/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { hasAdminProfile, provisionProfile } from '../lib/provisioning';

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

async function createProfile(t: T, role: TestRole): Promise<Id<'users'>> {
  const displayName =
    role === 'admin' ? 'Admin Test' : role === 'supervisor' ? 'Superviseur Test' : 'Livreur Test';
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
    });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

const validMemberArgs = {
  displayName: 'Nouveau Livreur',
  email: 'nouveau.livreur@bringo.test',
  password: 'motdepasse123',
  role: 'rider' as const,
};

describe('closed registration', () => {
  it('allows sign-up only while no admin exists', async () => {
    const t = makeT();

    expect((await t.query(api.users.getRegistrationStatus, {})).allowSignUp).toBe(true);

    await createProfile(t, 'supervisor');
    expect((await t.query(api.users.getRegistrationStatus, {})).allowSignUp).toBe(true);

    await createProfile(t, 'admin');
    expect((await t.query(api.users.getRegistrationStatus, {})).allowSignUp).toBe(false);
  });

  it('reports admin presence through the provisioning helper', async () => {
    const t = makeT();

    expect(await t.run((ctx) => hasAdminProfile(ctx))).toBe(false);

    await createProfile(t, 'admin');
    expect(await t.run((ctx) => hasAdminProfile(ctx))).toBe(true);
  });
});

describe('createTeamMember authorization and validation', () => {
  it('rejects unauthenticated callers', async () => {
    const t = makeT();

    await expect(t.action(api.users.createTeamMember, validMemberArgs)).rejects.toThrow(
      /Unauthorized|Forbidden/
    );
  });

  it('rejects supervisors and riders', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const riderId = await createProfile(t, 'rider');

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .action(api.users.createTeamMember, validMemberArgs)
    ).rejects.toThrow(/Forbidden/);

    await expect(
      t
        .withIdentity({ subject: riderId, email: 'rider@bringo.test' })
        .action(api.users.createTeamMember, validMemberArgs)
    ).rejects.toThrow(/Forbidden/);
  });

  it('validates the name, email, and password before creating anything', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await expect(
      admin.action(api.users.createTeamMember, { ...validMemberArgs, displayName: 'X' })
    ).rejects.toThrow(/name/);

    await expect(
      admin.action(api.users.createTeamMember, { ...validMemberArgs, email: 'invalid' })
    ).rejects.toThrow(/email/);

    await expect(
      admin.action(api.users.createTeamMember, { ...validMemberArgs, password: 'short' })
    ).rejects.toThrow(/between 8 and 128/);

    const users = await t.run(async (ctx) => ctx.db.query('users').collect());
    expect(users).toHaveLength(1);
  });
});

describe('listTeamMembers', () => {
  it('lists riders and supervisors, admin-only', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const supervisorId = await createProfile(t, 'supervisor');
    const riderId = await createProfile(t, 'rider');

    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });
    const members = await admin.query(api.users.listTeamMembers, {});

    expect(members).toHaveLength(2);
    const rider = members.find((m) => m.role === 'rider');
    const supervisor = members.find((m) => m.role === 'supervisor');
    expect(rider).toBeDefined();
    expect(rider!.userId).toBe(riderId);
    expect(supervisor).toBeDefined();
    expect(supervisor!.userId).toBe(supervisorId);

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .query(api.users.listTeamMembers, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('rejects riders reading the directory', async () => {
    const t = makeT();
    const riderId = await createProfile(t, 'rider');

    await expect(
      t
        .withIdentity({ subject: riderId, email: 'rider@bringo.test' })
        .query(api.users.listTeamMembers, {})
    ).rejects.toThrow(/Forbidden/);
  });
});

describe('rider activation', () => {
  it('lets an admin deactivate a rider, which blocks rider access', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const riderId = await createProfile(t, 'rider');
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await admin.mutation(api.users.setUserActive, { userId: riderId, isActive: false });

    const profile = await t.run(async (ctx) =>
      ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', riderId))
        .unique()
    );
    expect(profile?.isActive).toBe(false);

    await expect(rider.query(api.orders.getMyLiveEntries, {})).rejects.toThrow(/Forbidden/);

    await admin.mutation(api.users.setUserActive, { userId: riderId, isActive: true });
    expect(await rider.query(api.orders.getMyLiveEntries, {})).toEqual([]);
  });
});

describe('provisionProfile', () => {
  it('creates exactly one active rider profile and clears the marker', async () => {
    const t = makeT();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert('users', {
        email: 'provisioned@bringo.test',
        name: 'Livreur Provisionné',
        provisioningRole: 'rider',
      })
    );

    const profileId = await t.run((ctx) =>
      provisionProfile(ctx, {
        userId,
        displayName: 'Livreur Provisionné',
        email: 'provisioned@bringo.test',
        role: 'rider',
      })
    );

    const profile = await t.run(async (ctx) => ctx.db.get(profileId));
    expect(profile).toMatchObject({
      userId,
      role: 'rider',
      displayName: 'Livreur Provisionné',
      isActive: true,
    });

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.provisioningRole).toBeUndefined();

    const again = await t.run((ctx) =>
      provisionProfile(ctx, {
        userId,
        displayName: 'Autre Nom',
        email: 'provisioned@bringo.test',
        role: 'rider',
      })
    );
    expect(again).toBe(profileId);

    const profiles = await t.run(async (ctx) => ctx.db.query('userProfiles').collect());
    expect(profiles).toHaveLength(1);
  });

  it('falls back to the email when no name is provided', async () => {
    const t = makeT();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert('users', { email: 'sans-nom@bringo.test' })
    );

    const profileId = await t.run((ctx) =>
      provisionProfile(ctx, {
        userId,
        displayName: '   ',
        email: 'sans-nom@bringo.test',
        role: 'rider',
      })
    );

    const profile = await t.run(async (ctx) => ctx.db.get(profileId));
    expect(profile?.displayName).toBe('sans-nom@bringo.test');
  });
});
