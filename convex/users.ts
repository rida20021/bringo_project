import { action, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { createAccount } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { getAppUser, requireAdmin } from './lib/auth';
import { hasAdminProfile } from './lib/provisioning';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 120;

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const appUser = await getAppUser(ctx);
    if (!appUser) return null;
    return {
      ...appUser.user,
      role: appUser.profile?.role ?? null,
      displayName: appUser.profile?.displayName ?? appUser.user.name ?? appUser.user.email ?? 'Utilisateur',
      isActive: appUser.profile?.isActive ?? false,
    };
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query('userProfiles').collect();
  },
});

/**
 * Public, unauthenticated-friendly status consumed by the login page.
 * Sign-up stays available only until the first admin exists (bootstrap).
 */
export const getRegistrationStatus = query({
  args: {},
  handler: async (ctx) => ({
    allowSignUp: !(await hasAdminProfile(ctx)),
  }),
});

/** Team member accounts (riders and supervisors), joined with their auth user for the admin directory. */
export const listTeamMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const profiles = await ctx.db
      .query('userProfiles')
      .filter((q) =>
        q.or(
          q.eq(q.field('role'), 'rider'),
          q.eq(q.field('role'), 'supervisor')
        )
      )
      .collect();

    const members = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.userId);
        return {
          userId: profile.userId,
          displayName: profile.displayName,
          email: user?.email ?? null,
          role: profile.role,
          isActive: profile.isActive,
          createdAt: profile.createdAt,
        };
      })
    );

    return members.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  },
});

/**
 * Bootstrap a profile for an existing auth user.
 * Only admins can promote/demote; the first admin is seeded by `seedAdmin`.
 */
export const createUser = mutation({
  args: {
    userId: v.id('users'),
    email: v.string(),
    role: v.union(v.literal('supervisor'), v.literal('admin'), v.literal('rider')),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existingUser = await ctx.db.get(args.userId);
    if (!existingUser) throw new Error('Auth user not found. The user must sign up before a profile is created.');

    const existingProfile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (existingProfile) throw new Error('A profile already exists for this user');

    await ctx.db.insert('userProfiles', {
      userId: args.userId,
      role: args.role,
      displayName: args.displayName,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return args.userId;
  },
});

/**
 * Admin-only action creating a team member end to end (rider or supervisor).
 * `createAccount` must run in an action because it hashes the password and
 * calls the internal auth mutation; the profile is inserted from the
 * `afterUserCreatedOrUpdated` callback, in the same transaction as the auth user.
 */
export const createTeamMember = action({
  args: {
    displayName: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.union(v.literal('rider'), v.literal('supervisor')),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.getCallerRole, {});

    const displayName = args.displayName.trim();
    if (displayName.length < 2 || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new Error(`Display name must be between 2 and ${MAX_DISPLAY_NAME_LENGTH} characters`);
    }

    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new Error('A valid email address is required');
    }

    if (
      args.password.length < MIN_PASSWORD_LENGTH ||
      args.password.length > MAX_PASSWORD_LENGTH
    ) {
      throw new Error(
        `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
      );
    }

    const existing = await ctx.runQuery(internal.users.findUserByEmail, { email });
    if (existing) throw new Error('An account with this email already exists');

    const { user } = await createAccount(ctx, {
      provider: 'password',
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: displayName,
        provisioningRole: args.role,
      },
    });

    return { userId: user._id };
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id('users'),
    role: v.union(v.literal('supervisor'), v.literal('admin'), v.literal('rider')),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);

    if (appUser.userId === args.userId && args.role !== 'admin') {
      throw new Error('Admins cannot demote themselves');
    }

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (!profile) throw new Error('Profile not found');

    await ctx.db.patch(profile._id, { role: args.role, updatedAt: Date.now() });
  },
});

export const setUserActive = mutation({
  args: { userId: v.id('users'), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);
    if (appUser.userId === args.userId && !args.isActive) {
      throw new Error('Admins cannot deactivate themselves');
    }

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (!profile) throw new Error('Profile not found');

    await ctx.db.patch(profile._id, { isActive: args.isActive, updatedAt: Date.now() });
  },
});

/**
 * One-time bootstrap: promotes the currently signed-in user to admin when no
 * admin profile exists yet. Subsequent calls are rejected.
 */
export const seedAdmin = mutation({
  args: { displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const appUser = await getAppUser(ctx);
    if (!appUser) throw new Error('Unauthorized');

    const existingAdmin = await ctx.db
      .query('userProfiles')
      .filter((q) => q.eq(q.field('role'), 'admin'))
      .first();
    if (existingAdmin) throw new Error('An admin already exists; use updateUserRole instead');

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', appUser.userId))
      .unique();

    if (profile) {
      await ctx.db.patch(profile._id, {
        role: 'admin',
        displayName: args.displayName ?? profile.displayName,
        isActive: true,
        updatedAt: Date.now(),
      });
      return profile._id;
    }

    return ctx.db.insert('userProfiles', {
      userId: appUser.userId,
      role: 'admin',
      displayName: args.displayName ?? appUser.user.name ?? appUser.user.email,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Action-safe authorization check: actions have no `ctx.db`. */
export const getCallerRole = internalQuery({
  args: {},
  handler: async (ctx) => {
    const appUser = await requireAdmin(ctx);
    return { userId: appUser.userId, role: appUser.role };
  },
});

/**
 * Case-insensitive existence check (existing accounts may predate email
 * normalization), used to fail before the auth account is created.
 */
export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim();
    if (!email) return null;

    const candidates = Array.from(new Set([email, email.toLowerCase()]));
    for (const candidate of candidates) {
      const user = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', candidate))
        .first();
      if (user) return { userId: user._id };
    }

    return null;
  },
});
