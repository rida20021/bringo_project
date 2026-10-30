import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAppUser, requireAdmin } from './lib/auth';

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
