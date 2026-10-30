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

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(
  t: T,
  role: 'supervisor' | 'admin' | 'rider',
  isActive = true
): Promise<Id<'users'>> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: `${role}-${Math.random()}@bringo.test` });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName:
        role === 'admin' ? 'Admin Test' : role === 'rider' ? 'Livreur Test' : 'Superviseur Test',
      isActive,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

describe('authorization helpers', () => {
  it('rejects unauthenticated reads of the user directory', async () => {
    const t = makeT();
    await expect(t.query(api.users.getUsers, {})).rejects.toThrow(/Unauthorized|Forbidden/);
  });

  it('rejects a supervisor reading the user directory', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');

    await expect(
      t.withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' }).query(api.users.getUsers, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('allows an admin to read the user directory', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');

    const profiles = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .query(api.users.getUsers, {});

    expect(profiles).toHaveLength(1);
    expect(profiles[0].role).toBe('admin');
  });

  it('rejects a deactivated admin', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin', false);

    await expect(
      t.withIdentity({ subject: adminId, email: 'admin@bringo.test' }).query(api.users.getUsers, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('rejects an authenticated user without a profile', async () => {
    const t = makeT();
    const userId = await t.run(async (ctx) => ctx.db.insert('users', { email: 'orphan@bringo.test' }));

    await expect(
      t.withIdentity({ subject: userId, email: 'orphan@bringo.test' }).query(api.users.getUsers, {})
    ).rejects.toThrow(/Forbidden/);
  });
});

describe('privileged mutations', () => {
  it('only lets admins update import settings', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const settings = {
      allowedSenders: ['rapports@bringo.ma'],
      subjectPattern: 'Rapport TIKTAK',
      attachmentExtensions: ['xlsx'],
      timezone: 'Africa/Casablanca',
      alertRecipients: ['admin@bringo.ma'],
      maxFileSizeMB: 10,
      allowedMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      retentionDays: 90,
      invalidRowPolicy: 'partial_accept' as const,
      importSLAMinutes: 30,
    };

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .mutation(api.settings.updateImportSettings, settings)
    ).rejects.toThrow(/Forbidden/);

    const adminId = await createProfile(t, 'admin');
    await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .mutation(api.settings.updateImportSettings, settings);

    const stored = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .query(api.settings.getImportSettingsPublic, {});

    expect(stored?.timezone).toBe('Africa/Casablanca');
    expect(stored?.updatedBy).toBe(adminId);
  });

  it('lets only admins approve a bank deposit', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const adminId = await createProfile(t, 'admin');

    const depositId = await t.run(async (ctx) =>
      ctx.db.insert('bankDeposits', {
        amount: 100000,
        bankReference: 'VIR-001',
        depositDate: Date.now(),
        depositedBy: supervisorId,
        status: 'submitted',
        evidenceStorageIds: [],
        createdAt: Date.now(),
      })
    );

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .mutation(api.deposits.reviewBankDeposit, { depositId, action: 'approve' })
    ).rejects.toThrow(/Forbidden/);

    await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .mutation(api.deposits.reviewBankDeposit, { depositId, action: 'approve' });

    const deposit = await t.run(async (ctx) => ctx.db.get(depositId));
    expect(deposit?.status).toBe('approved');
    expect(deposit?.reviewedBy).toBe(adminId);
  });

  it('requires a reason when rejecting a deposit', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const adminId = await createProfile(t, 'admin');

    const depositId = await t.run(async (ctx) =>
      ctx.db.insert('bankDeposits', {
        amount: 50000,
        bankReference: 'VIR-002',
        depositDate: Date.now(),
        depositedBy: supervisorId,
        status: 'submitted',
        evidenceStorageIds: [],
        createdAt: Date.now(),
      })
    );

    await expect(
      t
        .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
        .mutation(api.deposits.reviewBankDeposit, { depositId, action: 'reject' })
    ).rejects.toThrow(/reason/);
  });

  it('prevents an admin from demoting themselves', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');

    await expect(
      t
        .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
        .mutation(api.users.updateUserRole, { userId: adminId, role: 'supervisor' })
    ).rejects.toThrow(/demote/);
  });

  it('promotes another user to admin', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const supervisorId = await createProfile(t, 'supervisor');

    await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .mutation(api.users.updateUserRole, { userId: supervisorId, role: 'admin' });

    const profile = await t.run(async (ctx) =>
      ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', supervisorId))
        .unique()
    );
    expect(profile?.role).toBe('admin');
  });

  it('allows one-time admin bootstrap and then locks it', async () => {
    const t = makeT();
    const userId = await t.run(async (ctx) => ctx.db.insert('users', { email: 'first@bringo.test' }));

    await t
      .withIdentity({ subject: userId, email: 'first@bringo.test' })
      .mutation(api.users.seedAdmin, { displayName: 'Premier Admin' });

    const profile = await t.run(async (ctx) =>
      ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', userId)).unique()
    );
    expect(profile?.role).toBe('admin');

    await expect(
      t
        .withIdentity({ subject: userId, email: 'first@bringo.test' })
        .mutation(api.users.seedAdmin, { displayName: 'Encore' })
    ).rejects.toThrow(/admin already exists/);
  });
});

describe('role-gated dashboard queries', () => {
  it('keeps the admin dashboard closed to supervisors', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .query(api.reconciliation.getAdminDashboardData, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('allows supervisors to open their dashboard', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');

    const data = await t
      .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
      .query(api.reconciliation.getSupervisorDashboardData, {});

    expect(data.kpis.totalCashDue).toBe(0);
    expect(data.riders).toHaveLength(0);
  });

  it('keeps import batches closed to supervisors', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .query(api.imports.getImportBatches, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('keeps both dashboards closed to riders', async () => {
    const t = makeT();
    const riderId = await createProfile(t, 'rider');
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await expect(rider.query(api.reconciliation.getAdminDashboardData, {})).rejects.toThrow(
      /Forbidden/
    );
    await expect(rider.query(api.reconciliation.getSupervisorDashboardData, {})).rejects.toThrow(
      /Forbidden/
    );
  });

  it('lets an admin assign the rider role', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const userId = await t.run(async (ctx) =>
      ctx.db.insert('users', { email: 'new-rider@bringo.test' })
    );

    await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .mutation(api.users.createUser, {
        userId,
        email: 'new-rider@bringo.test',
        role: 'rider',
        displayName: 'Nouveau Livreur',
      });

    const profile = await t.run(async (ctx) =>
      ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', userId)).unique()
    );
    expect(profile?.role).toBe('rider');
  });
});
