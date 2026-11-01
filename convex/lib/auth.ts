import type { UserIdentity } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export type AppRole = 'supervisor' | 'admin' | 'rider';

/** Contexts that expose `ctx.db` and `ctx.auth` (queries and mutations). */
export type DbCtx = QueryCtx | MutationCtx;

export interface AppUser {
  identity: UserIdentity;
  userId: Id<'users'>;
  user: Doc<'users'>;
  profile: Doc<'userProfiles'> | null;
  role: AppRole | null;
}

/**
 * Resolve the signed-in user together with their application profile.
 * Returns null when unauthenticated or when the auth user no longer exists.
 */
export async function getAppUser(ctx: DbCtx): Promise<AppUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // Convex Auth derives the users document id from the JWT subject.
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .unique();

  return { identity, userId, user, profile, role: profile?.role ?? null };
}

export async function requireAppUser(ctx: DbCtx): Promise<AppUser> {
  const appUser = await getAppUser(ctx);
  if (!appUser) throw new Error('Unauthorized');
  if (!appUser.profile || !appUser.profile.isActive) throw new Error('Forbidden: inactive or unprovisioned user');
  if (appUser.profile.isArchived) throw new Error('Forbidden: archived user');
  return appUser;
}

export async function requireRole(ctx: DbCtx, ...roles: AppRole[]): Promise<AppUser> {
  const appUser = await requireAppUser(ctx);
  if (!appUser.role || !roles.includes(appUser.role)) {
    throw new Error('Forbidden: insufficient role');
  }
  return appUser;
}

export function requireAdmin(ctx: DbCtx): Promise<AppUser> {
  return requireRole(ctx, 'admin');
}

export function requireSupervisor(ctx: DbCtx): Promise<AppUser> {
  return requireRole(ctx, 'supervisor', 'admin');
}

export function requireRider(ctx: DbCtx): Promise<AppUser> {
  return requireRole(ctx, 'rider');
}
