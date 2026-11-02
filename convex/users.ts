import { action, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { getAppUser, requireAdmin } from './lib/auth';
import { hasAdminProfile } from './lib/provisioning';
import { insertAuditEvent } from './audit';
import { liveEntryDateCasablanca } from './lib/dates';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MIN_TEMPORARY_PASSWORD_LENGTH = 12;
const RECENT_TPE_RECEIPT_LIMIT = 10;

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

/**
 * Team member accounts (riders and supervisors), joined with their auth user
 * for the admin directory. Archived accounts are hidden unless explicitly
 * requested with `includeArchived`.
 */
export const listTeamMembers = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const includeArchived = args.includeArchived === true;

    const profiles = await ctx.db
      .query('userProfiles')
      .filter((q) => {
        const isTeamMember = q.or(
          q.eq(q.field('role'), 'rider'),
          q.eq(q.field('role'), 'supervisor')
        );
        if (includeArchived) return isTeamMember;
        return q.and(isTeamMember, q.neq(q.field('isArchived'), true));
      })
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
          isArchived: profile.isArchived === true,
          debtBalance: profile.debtBalance ?? 0,
          createdAt: profile.createdAt,
        };
      })
    );

    return members.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  },
});

/** Complete, admin-only operational view of one rider. */
export const getRiderProfileData = query({
  args: { riderUserId: v.id('users') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const [user, profile] = await Promise.all([
      ctx.db.get(args.riderUserId),
      ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', args.riderUserId))
        .unique(),
    ]);

    if (!user || !profile || profile.role !== 'rider') return null;

    const businessDate = liveEntryDateCasablanca(Date.now());
    const entries = await ctx.db
      .query('liveEntries')
      .withIndex('riderEntryDate', (q) =>
        q.eq('riderUserId', args.riderUserId).eq('entryDate', businessDate)
      )
      .collect();

    const liveEntries = await Promise.all(
      entries.map(async (entry) => {
        const receipts = await ctx.db
          .query('liveEntryReceipts')
          .withIndex('liveEntryId', (q) => q.eq('liveEntryId', entry._id))
          .collect();

        return {
          ...entry,
          receipts: await Promise.all(
            receipts.map(async (receipt) => ({
              receiptId: receipt._id,
              kind: receipt.kind,
              status: receipt.status,
              fileName: receipt.fileName,
              createdAt: receipt.createdAt,
              reviewedAt: receipt.reviewedAt,
              rejectionReason: receipt.rejectionReason,
              url: await ctx.storage.getUrl(receipt.storageId),
            }))
          ),
        };
      })
    );

    const recentReceiptDocs = await ctx.db
      .query('liveEntryReceipts')
      .withIndex('riderKind', (q) =>
        q.eq('riderUserId', args.riderUserId).eq('kind', 'tpe')
      )
      .order('desc')
      .take(RECENT_TPE_RECEIPT_LIMIT);

    const recentTpeRows = await Promise.all(
      recentReceiptDocs.map(async (receipt) => {
        const entry = await ctx.db.get(receipt.liveEntryId);
        if (!entry) return null;

        return {
          receiptId: receipt._id,
          status: receipt.status,
          fileName: receipt.fileName,
          mimeType: receipt.mimeType,
          createdAt: receipt.createdAt,
          reviewedAt: receipt.reviewedAt,
          rejectionReason: receipt.rejectionReason,
          url: await ctx.storage.getUrl(receipt.storageId),
          entry: {
            liveEntryId: entry._id,
            commandId: entry.commandId,
            marketName: entry.marketName,
            amount: entry.amount,
            entryDate: entry.entryDate,
          },
        };
      })
    );

    const stats = {
      entryCount: entries.length,
      totalAmount: 0,
      cashAmount: 0,
      tpeAmount: 0,
      cardAmount: 0,
    };
    for (const entry of entries) {
      stats.totalAmount += entry.amount;
      if (entry.paymentMethod === 'cash') stats.cashAmount += entry.amount;
      else if (entry.paymentMethod === 'tpe') stats.tpeAmount += entry.amount;
      else stats.cardAmount += entry.amount;
    }

    return {
      businessDate,
      profile: {
        userId: user._id,
        name: profile.displayName,
        email: user.email,
        role: profile.role,
        debtBalance: profile.debtBalance ?? 0,
        isActive: profile.isActive,
        isArchived: profile.isArchived === true,
      },
      stats,
      liveEntries: liveEntries.sort((a, b) => b.createdAt - a.createdAt),
      recentTpeReceipts: recentTpeRows.filter(
        (row): row is NonNullable<typeof row> => row !== null
      ),
    };
  },
});

/**
 * Excel-imported riders that do not yet have an auth account linked to them.
 * The admin team page uses this to onboard existing riders without creating
 * duplicate identities.
 */
export const getUnlinkedRiders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const [riders, profiles] = await Promise.all([
      ctx.db.query('riders').collect(),
      ctx.db.query('userProfiles').collect(),
    ]);

    const linkedRiderIds = new Set<string>();
    for (const profile of profiles) {
      if (profile.riderId) linkedRiderIds.add(profile.riderId);
    }

    return riders
      .filter((rider) => !linkedRiderIds.has(rider._id))
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'fr'));
  },
});

/**
 * Bootstrap a profile for an existing auth user.
 * Only admins can promote/demote; the first admin is seeded by `seedAdmin`.
 * An optional `riderId` links the profile to an Excel-imported rider.
 */
export const createUser = mutation({
  args: {
    userId: v.id('users'),
    email: v.string(),
    role: v.union(v.literal('supervisor'), v.literal('admin'), v.literal('rider')),
    displayName: v.string(),
    riderId: v.optional(v.id('riders')),
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

    if (args.riderId) {
      const rider = await ctx.db.get(args.riderId);
      if (!rider) throw new Error('Excel rider not found');

      const alreadyLinked = await ctx.db
        .query('userProfiles')
        .withIndex('riderId', (q) => q.eq('riderId', args.riderId!))
        .first();
      if (alreadyLinked) throw new Error('This Excel rider is already linked to an account');
    }

    await ctx.db.insert('userProfiles', {
      userId: args.userId,
      role: args.role,
      displayName: args.displayName,
      ...(args.riderId ? { riderId: args.riderId } : {}),
      isActive: true,
      debtBalance: 0,
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
    riderId: v.optional(v.id('riders')),
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

    if (args.riderId) {
      await ctx.runQuery(internal.users.getLinkableRider, { riderId: args.riderId });
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
        ...(args.riderId ? { provisioningRiderId: args.riderId } : {}),
      },
    });

    return { userId: user._id };
  },
});

/**
 * Replace a rider's password through Convex Auth and revoke every active
 * session. The temporary password is supplied by the admin UI and is never
 * persisted outside the auth account's password hash.
 */
export const resetRiderPassword = action({
  args: {
    riderUserId: v.id('users'),
    temporaryPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const resetContext = await ctx.runQuery(internal.users.getRiderPasswordResetContext, {
      riderUserId: args.riderUserId,
    });

    if (
      args.temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH ||
      args.temporaryPassword.length > MAX_PASSWORD_LENGTH
    ) {
      throw new Error(
        `Temporary password must be between ${MIN_TEMPORARY_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`
      );
    }
    if (
      !/[a-z]/.test(args.temporaryPassword) ||
      !/[A-Z]/.test(args.temporaryPassword) ||
      !/[0-9]/.test(args.temporaryPassword) ||
      !/[^A-Za-z0-9]/.test(args.temporaryPassword)
    ) {
      throw new Error(
        'Temporary password must contain uppercase, lowercase, number, and symbol characters'
      );
    }

    await modifyAccountCredentials(ctx, {
      provider: 'password',
      account: {
        id: resetContext.providerAccountId,
        secret: args.temporaryPassword,
      },
    });
    await invalidateSessions(ctx, { userId: resetContext.riderUserId });

    await ctx.runMutation(internal.audit.logAuditEvent, {
      actorId: resetContext.adminUserId,
      action: 'rider.password_reset',
      targetType: 'users',
      targetId: resetContext.riderUserId,
      afterSummary: { sessionsInvalidated: true },
    });

    return { success: true };
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
    if (profile.isArchived) {
      throw new Error('Archived accounts must be restored before reactivation');
    }

    await ctx.db.patch(profile._id, { isActive: args.isActive, updatedAt: Date.now() });
  },
});

/** Activate or deactivate several team members at once (bulk action). Archived members are skipped. */
export const bulkSetUserActive = mutation({
  args: {
    userIds: v.array(v.id('users')),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);
    const userIds = Array.from(new Set(args.userIds));
    if (userIds.length === 0) throw new Error('Aucun membre sélectionné');
    if (!args.isActive && userIds.includes(appUser.userId)) {
      throw new Error('Admins cannot deactivate themselves');
    }

    let updated = 0;
    for (const userId of userIds) {
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', userId))
        .unique();
      if (!profile) continue;
      // Archived accounts must be restored explicitly before their status changes.
      if (profile.isArchived) continue;
      await ctx.db.patch(profile._id, { isActive: args.isActive, updatedAt: Date.now() });
      updated += 1;
    }

    return { updated };
  },
});

/**
 * Soft delete: hide a team member and block their login while preserving their
 * financial history. Restoring always brings the account back inactive.
 */
export const archiveTeamMember = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);
    if (appUser.userId === args.userId) {
      throw new Error('Admins cannot archive themselves');
    }

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (!profile) throw new Error('Profile not found');
    if (profile.role === 'admin') throw new Error('Admin accounts cannot be archived');
    if (profile.isArchived) return { archived: false };

    await ctx.db.patch(profile._id, {
      isArchived: true,
      isActive: false,
      updatedAt: Date.now(),
    });

    await insertAuditEvent(ctx, {
      actorId: appUser.userId,
      action: 'user_archived',
      targetType: 'users',
      targetId: args.userId,
      beforeSummary: {
        role: profile.role,
        isActive: profile.isActive,
        isArchived: profile.isArchived ?? false,
      },
      afterSummary: { isActive: false, isArchived: true },
    });

    return { archived: true };
  },
});

/** Lift a soft delete. The account returns inactive and must be reactivated. */
export const restoreTeamMember = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (!profile) throw new Error('Profile not found');
    if (!profile.isArchived) return { restored: false };

    await ctx.db.patch(profile._id, {
      isArchived: false,
      isActive: false,
      updatedAt: Date.now(),
    });

    await insertAuditEvent(ctx, {
      actorId: appUser.userId,
      action: 'user_restored',
      targetType: 'users',
      targetId: args.userId,
      beforeSummary: { isActive: false, isArchived: true },
      afterSummary: { isActive: false, isArchived: false },
    });

    return { restored: true };
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
      debtBalance: 0,
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

/** Resolve and authorize the exact password account used by a reset action. */
export const getRiderPasswordResetContext = internalQuery({
  args: { riderUserId: v.id('users') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const [rider, profile] = await Promise.all([
      ctx.db.get(args.riderUserId),
      ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', args.riderUserId))
        .unique(),
    ]);
    if (!rider || !profile || profile.role !== 'rider') {
      throw new Error('Rider account not found');
    }
    if (profile.isArchived) throw new Error('Archived rider accounts cannot be reset');

    const passwordAccount = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) =>
        q.eq('userId', args.riderUserId).eq('provider', 'password')
      )
      .unique();
    if (!passwordAccount) throw new Error('Password account not found for this rider');

    return {
      adminUserId: admin.userId,
      riderUserId: rider._id,
      providerAccountId: passwordAccount.providerAccountId,
    };
  },
});

/** Action-safe check that an Excel rider exists and is still linkable. */
export const getLinkableRider = internalQuery({
  args: { riderId: v.id('riders') },
  handler: async (ctx, args) => {
    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error('Excel rider not found');

    const alreadyLinked = await ctx.db
      .query('userProfiles')
      .withIndex('riderId', (q) => q.eq('riderId', args.riderId))
      .first();
    if (alreadyLinked) throw new Error('This Excel rider is already linked to an account');

    return { riderId: rider._id, canonicalName: rider.canonicalName };
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
