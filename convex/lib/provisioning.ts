import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { DbCtx } from './auth';

/** Registration is closed as soon as the first admin profile exists. */
export async function hasAdminProfile(ctx: DbCtx): Promise<boolean> {
  const admin = await ctx.db
    .query('userProfiles')
    .withIndex('role', (q) => q.eq('role', 'admin'))
    .first();
  return admin !== null;
}

export interface ProvisionArgs {
  userId: Id<'users'>;
  displayName: string;
  email: string;
  role: 'rider' | 'supervisor';
}

/**
 * Create a team member profile (rider or supervisor) belonging to an auth user
 * and clear the internal `provisioningRole` marker.
 *
 * Called from the `afterUserCreatedOrUpdated` auth callback, which runs inside
 * the same `auth:store` mutation as the user insert: if this throws, the auth
 * user and its password account are rolled back too.
 */
export async function provisionProfile(
  ctx: MutationCtx,
  args: ProvisionArgs
): Promise<Id<'userProfiles'>> {
  const existing = await ctx.db
    .query('userProfiles')
    .withIndex('userId', (q) => q.eq('userId', args.userId))
    .unique();
  if (existing) {
    await ctx.db.patch(args.userId, { provisioningRole: undefined });
    return existing._id;
  }

  const displayName = args.displayName.trim() || args.email;
  const now = Date.now();

  const profileId = await ctx.db.insert('userProfiles', {
    userId: args.userId,
    role: args.role,
    displayName,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  // The marker is internal only: remove it from the user document.
  await ctx.db.patch(args.userId, { provisioningRole: undefined });

  return profileId;
}