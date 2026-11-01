/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

const modules = import.meta.glob([
  '../**/*.ts',
  '!../**/*.test.ts',
  '!../auth.ts',
  '!../auth.config.ts',
  '!../http.ts',
  '!../index.ts',
]);

type T = ReturnType<typeof makeT>;
type TestRole = 'supervisor' | 'admin' | 'rider';

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(
  t: T,
  role: TestRole,
  options: { isActive?: boolean; isArchived?: boolean; displayName?: string } = {}
): Promise<Id<'users'>> {
  const isActive = options.isActive ?? true;
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
    });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName: options.displayName ?? `${role} Test`,
      isActive,
      isArchived: options.isArchived,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

async function asAdmin(t: T) {
  const adminId = await createProfile(t, 'admin', { displayName: 'Admin Test' });
  return { adminId, admin: t.withIdentity({ subject: adminId, email: 'admin@bringo.test' }) };
}

async function getProfile(t: T, userId: Id<'users'>) {
  return t.run(async (ctx) =>
    ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', userId)).unique()
  );
}

describe('team directory listing', () => {
  it('lists riders and supervisors but not admins', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    await createProfile(t, 'rider', { displayName: 'Livreur Un' });
    await createProfile(t, 'supervisor', { displayName: 'Superviseur Un' });

    const members = await admin.query(api.users.listTeamMembers, {});
    const roles = members.map((member) => member.role).sort();
    expect(roles).toEqual(['rider', 'supervisor']);
    expect(members.every((member) => member.isArchived === false)).toBe(true);
  });

  it('hides archived members unless includeArchived is set', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    const riderId = await createProfile(t, 'rider', { displayName: 'Archivé' });

    await admin.mutation(api.users.archiveTeamMember, { userId: riderId });

    const visible = await admin.query(api.users.listTeamMembers, {});
    expect(visible).toHaveLength(0);

    const all = await admin.query(api.users.listTeamMembers, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0].isArchived).toBe(true);
  });
});

describe('archive and restore', () => {
  it('archives a member, deactivates them, and writes an audit event', async () => {
    const t = makeT();
    const { adminId, admin } = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');

    await admin.mutation(api.users.archiveTeamMember, { userId: riderId });

    const profile = await getProfile(t, riderId);
    expect(profile?.isArchived).toBe(true);
    expect(profile?.isActive).toBe(false);

    const events = await admin.query(api.audit.getAuditEvents, {
      targetType: 'users',
      targetId: riderId,
    });
    expect(events.some((event) => event.action === 'user_archived' && event.actorId === adminId)).toBe(
      true
    );
  });

  it('restores a member as inactive', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');

    await admin.mutation(api.users.archiveTeamMember, { userId: riderId });
    await admin.mutation(api.users.restoreTeamMember, { userId: riderId });

    const profile = await getProfile(t, riderId);
    expect(profile?.isArchived).toBe(false);
    expect(profile?.isActive).toBe(false);

    const visible = await admin.query(api.users.listTeamMembers, {});
    expect(visible).toHaveLength(1);
    expect(visible[0].isActive).toBe(false);
  });

  it('blocks an archived account from using the app', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await admin.mutation(api.users.archiveTeamMember, { userId: riderId });

    await expect(rider.query(api.markets.listMarkets, {})).rejects.toThrow(/Forbidden/);
  });

  it('rejects an archived profile that is still marked active', async () => {
    const t = makeT();
    const riderId = await createProfile(t, 'rider', { isActive: true, isArchived: true });
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await expect(rider.query(api.markets.listMarkets, {})).rejects.toThrow(/archived/);
  });

  it('refuses self-archiving and admin archiving', async () => {
    const t = makeT();
    const { adminId, admin } = await asAdmin(t);
    const otherAdminId = await createProfile(t, 'admin');

    await expect(
      admin.mutation(api.users.archiveTeamMember, { userId: adminId })
    ).rejects.toThrow(/themselves/);

    await expect(
      admin.mutation(api.users.archiveTeamMember, { userId: otherAdminId })
    ).rejects.toThrow(/Admin accounts/);
  });

  it('keeps archive and bulk actions admin-only', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const supervisor = t.withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' });
    const riderId = await createProfile(t, 'rider');

    await expect(
      supervisor.mutation(api.users.archiveTeamMember, { userId: riderId })
    ).rejects.toThrow(/Forbidden/);
    await expect(
      supervisor.mutation(api.users.bulkSetUserActive, { userIds: [riderId], isActive: false })
    ).rejects.toThrow(/Forbidden/);
  });
});

describe('bulk activation', () => {
  it('deactivates and reactivates several members at once', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    const firstId = await createProfile(t, 'rider');
    const secondId = await createProfile(t, 'supervisor');

    const deactivated = await admin.mutation(api.users.bulkSetUserActive, {
      userIds: [firstId, secondId],
      isActive: false,
    });
    expect(deactivated.updated).toBe(2);
    expect((await getProfile(t, firstId))?.isActive).toBe(false);
    expect((await getProfile(t, secondId))?.isActive).toBe(false);

    const reactivated = await admin.mutation(api.users.bulkSetUserActive, {
      userIds: [firstId, secondId],
      isActive: true,
    });
    expect(reactivated.updated).toBe(2);
    expect((await getProfile(t, firstId))?.isActive).toBe(true);
  });

  it('skips archived members', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    const archivedId = await createProfile(t, 'rider');
    const activeId = await createProfile(t, 'rider');

    await admin.mutation(api.users.archiveTeamMember, { userId: archivedId });

    const result = await admin.mutation(api.users.bulkSetUserActive, {
      userIds: [archivedId, activeId],
      isActive: false,
    });

    expect(result.updated).toBe(1);
    expect((await getProfile(t, archivedId))?.isActive).toBe(false);
    expect((await getProfile(t, activeId))?.isActive).toBe(false);
  });

  it('prevents an admin from bulk-deactivating themselves', async () => {
    const t = makeT();
    const { adminId, admin } = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');

    await expect(
      admin.mutation(api.users.bulkSetUserActive, {
        userIds: [adminId, riderId],
        isActive: false,
      })
    ).rejects.toThrow(/themselves/);

    // The transaction rolls back entirely.
    expect((await getProfile(t, riderId))?.isActive).toBe(true);
  });
});

describe('role changes', () => {
  it('promotes a rider to supervisor and back', async () => {
    const t = makeT();
    const { admin } = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');

    await admin.mutation(api.users.updateUserRole, { userId: riderId, role: 'supervisor' });
    expect((await getProfile(t, riderId))?.role).toBe('supervisor');

    await admin.mutation(api.users.updateUserRole, { userId: riderId, role: 'rider' });
    expect((await getProfile(t, riderId))?.role).toBe('rider');
  });
});
