/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { hasAdminProfile, provisionRiderProfile } from '../lib/provisioning';

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

const validRiderArgs = {
  displayName: 'Nouveau Livreur',
  email: 'nouveau.livreur@bringo.test',
  password: 'motdepasse123',
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

describe('createRiderAccount authorization and validation', () => {
  it('rejects unauthenticated callers', async () => {
    const t = makeT();

    await expect(t.action(api.users.createRiderAccount, validRiderArgs)).rejects.toThrow(
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
        .action(api.users.createRiderAccount, validRiderArgs)
    ).rejects.toThrow(/Forbidden/);

    await expect(
      t
        .withIdentity({ subject: riderId, email: 'rider@bringo.test' })
        .action(api.users.createRiderAccount, validRiderArgs)
    ).rejects.toThrow(/Forbidden/);
  });

  it('validates the name, email, and password before creating anything', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await expect(
      admin.action(api.users.createRiderAccount, { ...validRiderArgs, displayName: 'X' })
    ).rejects.toThrow(/name/);

    await expect(
      admin.action(api.users.createRiderAccount, { ...validRiderArgs, email: 'invalid' })
    ).rejects.toThrow(/email/);

    await expect(
      admin.action(api.users.createRiderAccount, { ...validRiderArgs, password: 'short' })
    ).rejects.toThrow(/between 8 and 128/);

    const users = await t.run(async (ctx) => ctx.db.query('users').collect());
    expect(users).toHaveLength(1);
  });
});

describe('listRiderUsers', () => {
  it('lists only riders and is admin-only', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const supervisorId = await createProfile(t, 'supervisor');
    const riderId = await createProfile(t, 'rider');

    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });
    const riders = await admin.query(api.users.listRiderUsers, {});

    expect(riders).toHaveLength(1);
    expect(riders[0].userId).toBe(riderId);
    expect(riders[0].displayName).toBe('Livreur Test');
    expect(riders[0].email).toMatch(/@bringo\.test$/);
    expect(riders[0].isActive).toBe(true);

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .query(api.users.listRiderUsers, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('rejects riders reading the directory', async () => {
    const t = makeT();
    const riderId = await createProfile(t, 'rider');

    await expect(
      t
        .withIdentity({ subject: riderId, email: 'rider@bringo.test' })
        .query(api.users.listRiderUsers, {})
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

describe('provisionRiderProfile', () => {
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
      provisionRiderProfile(ctx, {
        userId,
        displayName: 'Livreur Provisionné',
        email: 'provisioned@bringo.test',
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
      provisionRiderProfile(ctx, {
        userId,
        displayName: 'Autre Nom',
        email: 'provisioned@bringo.test',
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
      provisionRiderProfile(ctx, {
        userId,
        displayName: '   ',
        email: 'sans-nom@bringo.test',
      })
    );

    const profile = await t.run(async (ctx) => ctx.db.get(profileId));
    expect(profile?.displayName).toBe('sans-nom@bringo.test');
  });
});
