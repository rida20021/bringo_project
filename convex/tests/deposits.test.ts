/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { startOfDayCasablanca } from '../lib/dates';

const modules = import.meta.glob([
  '../**/*.ts',
  '!../**/*.test.ts',
  '!../auth.ts',
  '!../auth.config.ts',
  '!../http.ts',
  '!../index.ts',
]);

type T = ReturnType<typeof makeT>;
type TestRole = 'admin' | 'supervisor' | 'rider';

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(t: T, role: TestRole): Promise<Id<'users'>> {
  const displayName =
    role === 'admin' ? 'Admin Test' : role === 'supervisor' ? 'Superviseur Test' : 'Livreur Test';
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: `${role}-${Math.random()}@bringo.test` });
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

interface Fixture {
  adminId: Id<'users'>;
  supervisorId: Id<'users'>;
  riderUserId: Id<'users'>;
  riderId: Id<'riders'>;
  depositId: Id<'bankDeposits'>;
}

async function seedPendingDeposit(t: T): Promise<Fixture> {
  const adminId = await createProfile(t, 'admin');
  const supervisorId = await createProfile(t, 'supervisor');
  const riderUserId = await createProfile(t, 'rider');

  const rest = await t.run(async (ctx) => {
    const riderId = await ctx.db.insert('riders', {
      canonicalName: 'Livreur Test',
      aliases: ['Livreur Test'],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const storageId = await ctx.storage.store(new Blob(['receipt'], { type: 'image/png' }));

    const depositId = await ctx.db.insert('bankDeposits', {
      amount: 45000,
      depositDate: Date.now(),
      depositedBy: supervisorId,
      riderId,
      status: 'pending_review',
      evidenceStorageIds: [storageId],
      createdAt: Date.now(),
    });

    return { riderId, depositId };
  });

  return { adminId, supervisorId, riderUserId, ...rest };
}

function client(t: T, userId: Id<'users'>, email: string) {
  return t.withIdentity({ subject: userId, email });
}

function storeReceipt(t: T) {
  return t.run(async (ctx) =>
    ctx.storage.store(new Blob(['receipt'], { type: 'image/png' }))
  );
}

function getProfile(t: T, userId: Id<'users'>) {
  return t.run(async (ctx) =>
    ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', userId)).unique()
  );
}

describe('createCashCollection', () => {
  it('records a confirmed collection on the start of the Casablanca report day', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');

    const collectionId = await supervisor.mutation(api.deposits.createCashCollection, {
      riderId: fixture.riderId,
      amount: 12550,
      // 18:45 UTC is still the same Casablanca calendar day.
      sourceReportDate: Date.UTC(2026, 10, 2, 18, 45),
    });

    const collection = await t.run(async (ctx) => ctx.db.get(collectionId));
    expect(collection).toMatchObject({
      riderId: fixture.riderId,
      amount: 12550,
      collectedBy: fixture.supervisorId,
      status: 'confirmed',
      isReversal: false,
      sourceReportDate: startOfDayCasablanca(Date.UTC(2026, 10, 2, 18, 45)),
    });
  });

  it('feeds the supervisor "Encaissé" KPI for that report day', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');
    const admin = client(t, fixture.adminId, 'admin@bringo.test');
    const reportInstant = Date.UTC(2026, 10, 2, 18, 45);

    await supervisor.mutation(api.deposits.createCashCollection, {
      riderId: fixture.riderId,
      amount: 289428,
      sourceReportDate: reportInstant,
    });

    const data = await admin.query(api.reconciliation.getSupervisorDashboardData, {
      reportDate: reportInstant,
    });
    expect(data.kpis.totalCollected).toBe(289428);
    expect(data.reportDate).toBe(startOfDayCasablanca(reportInstant));
  });

  it('lets admins record collections but rejects riders and invalid amounts', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');
    const admin = client(t, fixture.adminId, 'admin@bringo.test');
    const rider = client(t, fixture.riderUserId, 'rider@bringo.test');
    const sourceReportDate = Date.UTC(2026, 10, 2, 12);

    await expect(
      admin.mutation(api.deposits.createCashCollection, {
        riderId: fixture.riderId,
        amount: 5000,
        sourceReportDate,
      })
    ).resolves.toBeDefined();

    await expect(
      rider.mutation(api.deposits.createCashCollection, {
        riderId: fixture.riderId,
        amount: 5000,
        sourceReportDate,
      })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      supervisor.mutation(api.deposits.createCashCollection, {
        riderId: fixture.riderId,
        amount: 0,
        sourceReportDate,
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      supervisor.mutation(api.deposits.createCashCollection, {
        riderId: fixture.riderId,
        amount: 12.5,
        sourceReportDate,
      })
    ).rejects.toThrow(/positive integer/);
  });
});

describe('listPendingBankDeposits', () => {
  it('enriches pending deposits with supervisor, rider and receipt data', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);

    const rows = await client(t, fixture.adminId, 'admin@bringo.test').query(
      api.deposits.listPendingBankDeposits,
      {}
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      depositId: fixture.depositId,
      amount: 45000,
      status: 'pending_review',
      supervisor: {
        userId: fixture.supervisorId,
        displayName: 'Superviseur Test',
      },
      rider: {
        riderId: fixture.riderId,
        name: 'Livreur Test',
      },
    });
    expect(typeof rows[0].receiptUrl === 'string' || rows[0].receiptUrl === null).toBe(true);
  });

  it('lets supervisors read the queue but keeps riders out', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);

    const rows = await client(t, fixture.supervisorId, 'supervisor@bringo.test').query(
      api.deposits.listPendingBankDeposits,
      {}
    );
    expect(rows).toHaveLength(1);

    await expect(
      client(t, fixture.riderUserId, 'rider@bringo.test').query(
        api.deposits.listPendingBankDeposits,
        {}
      )
    ).rejects.toThrow(/Forbidden/);
  });

  it('removes a deposit from the queue once approved', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const admin = client(t, fixture.adminId, 'admin@bringo.test');

    await admin.mutation(api.deposits.reviewBankDeposit, {
      depositId: fixture.depositId,
      action: 'approve',
    });

    const deposit = await t.run(async (ctx) => ctx.db.get(fixture.depositId));
    expect(deposit).toMatchObject({
      status: 'approved',
      reviewedBy: fixture.adminId,
    });
    expect(await admin.query(api.deposits.listPendingBankDeposits, {})).toHaveLength(0);
  });

  it('requires a reason to reject and stores it', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const admin = client(t, fixture.adminId, 'admin@bringo.test');

    await expect(
      admin.mutation(api.deposits.reviewBankDeposit, {
        depositId: fixture.depositId,
        action: 'reject',
      })
    ).rejects.toThrow(/reason is required/);

    await admin.mutation(api.deposits.reviewBankDeposit, {
      depositId: fixture.depositId,
      action: 'reject',
      reason: '  Reçu illisible  ',
    });

    const deposit = await t.run(async (ctx) => ctx.db.get(fixture.depositId));
    expect(deposit).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Reçu illisible',
      reviewedBy: fixture.adminId,
    });
    expect(await admin.query(api.deposits.listPendingBankDeposits, {})).toHaveLength(0);
  });
});

describe('bank deposit expectations', () => {
  it('calculates the expected amount server-side from collections minus prior deposits', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');
    const reportInstant = Date.UTC(2026, 10, 2, 18, 45);
    const reportDay = startOfDayCasablanca(reportInstant);

    await supervisor.mutation(api.deposits.createCashCollection, {
      riderId: fixture.riderId,
      amount: 120000,
      sourceReportDate: reportInstant,
    });

    const firstDepositId = await supervisor.mutation(api.deposits.createBankDeposit, {
      riderId: fixture.riderId,
      amount: 50000,
      storageId: await storeReceipt(t),
      sourceReportDate: reportInstant,
    });

    const firstDeposit = await t.run(async (ctx) => ctx.db.get(firstDepositId));
    expect(firstDeposit).toMatchObject({
      amount: 50000,
      sourceReportDate: reportDay,
      expectedAmount: 120000,
      status: 'pending_review',
    });

    const expectation = await supervisor.query(api.deposits.getDepositExpectation, {
      riderId: fixture.riderId,
      sourceReportDate: reportInstant,
    });
    expect(expectation).toEqual({
      sourceReportDate: reportDay,
      totalCollected: 120000,
      totalDeposited: 50000,
      expectedAmount: 70000,
    });

    const secondDepositId = await supervisor.mutation(api.deposits.createBankDeposit, {
      riderId: fixture.riderId,
      amount: 20000,
      storageId: await storeReceipt(t),
      sourceReportDate: reportInstant,
    });

    const secondDeposit = await t.run(async (ctx) => ctx.db.get(secondDepositId));
    expect(secondDeposit?.expectedAmount).toBe(70000);
  });

  it('ignores reversals and rejected deposits when calculating the expectation', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');
    const reportInstant = Date.UTC(2026, 10, 2, 12);
    const reportDay = startOfDayCasablanca(reportInstant);

    await t.run(async (ctx) => {
      await ctx.db.insert('cashCollections', {
        riderId: fixture.riderId,
        amount: 90000,
        collectedAt: Date.now(),
        collectedBy: fixture.supervisorId,
        sourceReportDate: reportDay,
        isReversal: false,
        status: 'confirmed',
        createdAt: Date.now(),
      });
      await ctx.db.insert('cashCollections', {
        riderId: fixture.riderId,
        amount: 99999,
        collectedAt: Date.now(),
        collectedBy: fixture.supervisorId,
        sourceReportDate: reportDay,
        reversalOf: undefined,
        isReversal: true,
        status: 'confirmed',
        createdAt: Date.now(),
      });
      await ctx.db.insert('bankDeposits', {
        amount: 88888,
        depositDate: Date.now(),
        depositedBy: fixture.supervisorId,
        riderId: fixture.riderId,
        sourceReportDate: reportDay,
        status: 'rejected',
        evidenceStorageIds: [],
        createdAt: Date.now(),
      });
    });

    const expectation = await supervisor.query(api.deposits.getDepositExpectation, {
      riderId: fixture.riderId,
      sourceReportDate: reportInstant,
    });
    expect(expectation.expectedAmount).toBe(90000);
    expect(expectation.totalDeposited).toBe(0);
  });
});

describe('supervisor short deposit debt', () => {
  it('charges the shortfall to the supervisor and writes an audit event on approval', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');
    const admin = client(t, fixture.adminId, 'admin@bringo.test');
    const reportInstant = Date.UTC(2026, 10, 2, 18, 45);
    const reportDay = startOfDayCasablanca(reportInstant);

    await supervisor.mutation(api.deposits.createCashCollection, {
      riderId: fixture.riderId,
      amount: 100000,
      sourceReportDate: reportInstant,
    });

    const depositId = await supervisor.mutation(api.deposits.createBankDeposit, {
      riderId: fixture.riderId,
      amount: 40000,
      storageId: await storeReceipt(t),
      sourceReportDate: reportInstant,
    });

    const pendingRows = await admin.query(api.deposits.listPendingBankDeposits, {});
    expect(
      pendingRows.find((row) => row.depositId === depositId)
    ).toMatchObject({
      amount: 40000,
      sourceReportDate: reportDay,
      expectedAmount: 100000,
      shortfallAmount: null,
    });

    // Existing debt must be preserved and increased by the new shortfall.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', fixture.supervisorId))
        .unique();
      if (profile) await ctx.db.patch(profile._id, { debtBalance: 5000 });
    });

    await admin.mutation(api.deposits.reviewBankDeposit, {
      depositId,
      action: 'approve',
    });

    const deposit = await t.run(async (ctx) => ctx.db.get(depositId));
    expect(deposit).toMatchObject({
      status: 'approved',
      expectedAmount: 100000,
      shortfallAmount: 60000,
      reviewedBy: fixture.adminId,
    });
    expect((await getProfile(t, fixture.supervisorId))?.debtBalance).toBe(65000);

    const events = await admin.query(api.audit.getAuditEvents, {
      targetType: 'users',
      targetId: fixture.supervisorId,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'supervisor.debt_recorded',
      actorId: fixture.adminId,
      targetId: fixture.supervisorId,
      beforeSummary: { debtBalance: 5000 },
      afterSummary: {
        debtBalance: 65000,
        shortfallAmount: 60000,
        expectedAmount: 100000,
        depositAmount: 40000,
        depositId,
        sourceReportDate: reportDay,
      },
    });
  });

  it('records no debt when the deposit matches the expected amount', async () => {
    const t = makeT();
    const fixture = await seedPendingDeposit(t);
    const supervisor = client(t, fixture.supervisorId, 'supervisor@bringo.test');
    const admin = client(t, fixture.adminId, 'admin@bringo.test');
    const reportInstant = Date.UTC(2026, 10, 2, 18, 45);

    await supervisor.mutation(api.deposits.createCashCollection, {
      riderId: fixture.riderId,
      amount: 100000,
      sourceReportDate: reportInstant,
    });

    const depositId = await supervisor.mutation(api.deposits.createBankDeposit, {
      riderId: fixture.riderId,
      amount: 100000,
      storageId: await storeReceipt(t),
      sourceReportDate: reportInstant,
    });

    await admin.mutation(api.deposits.reviewBankDeposit, {
      depositId,
      action: 'approve',
    });

    const deposit = await t.run(async (ctx) => ctx.db.get(depositId));
    expect(deposit?.shortfallAmount).toBe(0);
    expect((await getProfile(t, fixture.supervisorId))?.debtBalance ?? 0).toBe(0);

    const events = await admin.query(api.audit.getAuditEvents, {
      targetType: 'users',
      targetId: fixture.supervisorId,
    });
    expect(events).toHaveLength(0);
  });
});
