/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { endOfDayCasablanca, startOfDayCasablanca } from '../lib/dates';

const modules = import.meta.glob([
  '../**/*.ts',
  '!../**/*.test.ts',
  '!../auth.ts',
  '!../auth.config.ts',
  '!../http.ts',
  '!../index.ts',
]);

const DAY_A = startOfDayCasablanca(Date.UTC(2026, 9, 25, 12));
const DAY_B = startOfDayCasablanca(Date.UTC(2026, 9, 26, 12));
const DAY_C = startOfDayCasablanca(Date.UTC(2026, 9, 27, 12));

type T = ReturnType<typeof makeT>;
type DepositStatus = 'pending_review' | 'submitted' | 'approved' | 'rejected';
type TpeStatus = 'pending_review' | 'approved' | 'rejected';

function makeT() {
  return convexTest({ schema, modules });
}

interface World {
  adminId: Id<'users'>;
  riderUserId: Id<'users'>;
  riderId: Id<'riders'>;
  marketId: Id<'markets'>;
  batchId: Id<'importBatches'>;
  sourceRowId: Id<'sourceRows'>;
}

async function createProfile(t: T, role: 'admin' | 'rider'): Promise<Id<'users'>> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: `${role}@bringo.test` });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName: role === 'admin' ? 'Admin Test' : 'Livreur Test',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

async function seedWorld(t: T): Promise<World> {
  const adminId = await createProfile(t, 'admin');
  const riderUserId = await createProfile(t, 'rider');

  return t.run(async (ctx) => {
    const marketId = await ctx.db.insert('markets', {
      name: 'Marché Central',
      externalId: 'MKT-1',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const riderId = await ctx.db.insert('riders', {
      canonicalName: 'Livreur Test',
      aliases: ['Livreur Test'],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const batchId = await ctx.db.insert('importBatches', {
      gmailMessageId: 'msg-1',
      attachmentName: 'Rapport_TIKTAK_2026-10-25.xlsx',
      attachmentHash: 'hash-1',
      reportDate: DAY_A,
      receivedAt: Date.now(),
      startedAt: Date.now(),
      status: 'completed',
      totalRows: 0,
      acceptedRows: 0,
      rejectedRows: 0,
      duplicateRows: 0,
      conflictRows: 0,
    });

    const sourceRowId = await ctx.db.insert('sourceRows', {
      importBatchId: batchId,
      originalRowNumber: 2,
      originalData: {},
      validationState: 'valid',
    });

    return { adminId, riderUserId, riderId, marketId, batchId, sourceRowId };
  });
}

async function addOrder(
  t: T,
  world: World,
  commandId: string,
  amount: number,
  deliveryDate: number,
  paymentMethod: 'cash' | 'card' | 'online_payment' = 'cash'
): Promise<Id<'orders'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('orders', {
      commandId,
      deliveryDate,
      riderId: world.riderId,
      rawRiderName: 'Livreur Test',
      paymentMethod,
      amount,
      sourceRowId: world.sourceRowId,
      importBatchId: world.batchId,
      eligibilityStatus: 'eligible',
      createdAt: Date.now(),
    })
  );
}

async function addCollection(
  t: T,
  world: World,
  amount: number,
  sourceReportDate: number,
  collectedAt: number
): Promise<Id<'cashCollections'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('cashCollections', {
      riderId: world.riderId,
      amount,
      collectedAt,
      collectedBy: world.adminId,
      sourceReportDate,
      isReversal: false,
      createdAt: Date.now(),
    })
  );
}

async function addDeposit(
  t: T,
  world: World,
  amount: number,
  depositDate: number,
  status: DepositStatus
): Promise<Id<'bankDeposits'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('bankDeposits', {
      amount,
      depositDate,
      depositedBy: world.adminId,
      status,
      evidenceStorageIds: [],
      createdAt: Date.now(),
    })
  );
}

async function addTpe(
  t: T,
  world: World,
  amount: number,
  receiptDate: number,
  status: TpeStatus
): Promise<Id<'tpeReceipts'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('tpeReceipts', {
      claimedAmount: amount,
      receiptDate,
      uploadedBy: world.adminId,
      status,
      evidenceStorageIds: [],
      createdAt: Date.now(),
    })
  );
}

async function addLiveEntry(
  t: T,
  world: World,
  commandId: string,
  amount: number,
  entryDate: number,
  paymentMethod: 'cash' | 'tpe' | 'card' = 'tpe'
): Promise<Id<'liveEntries'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('liveEntries', {
      riderUserId: world.riderUserId,
      commandId,
      commandKey: commandId.trim().toLowerCase(),
      marketId: world.marketId,
      marketName: 'Marché Central',
      marketExternalId: 'MKT-1',
      amount,
      paymentMethod,
      entryDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function addLiveTpeReceipt(
  t: T,
  world: World,
  liveEntryId: Id<'liveEntries'>,
  status: TpeStatus
): Promise<Id<'liveEntryReceipts'>> {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['receipt'], { type: 'image/png' }));
    return ctx.db.insert('liveEntryReceipts', {
      liveEntryId,
      riderUserId: world.riderUserId,
      kind: 'tpe',
      storageId,
      fileName: 'ticket.png',
      mimeType: 'image/png',
      size: 7,
      status,
      createdAt: Date.now(),
    });
  });
}

function adminClient(t: T, world: World) {
  return t.withIdentity({ subject: world.adminId, email: 'admin@bringo.test' });
}

/** Seeds two full business days (A and B) plus an out-of-range order on C. */
async function seedMultiDay(t: T): Promise<World> {
  const world = await seedWorld(t);

  await addOrder(t, world, 'A-CASH', 1000, DAY_A);
  await addOrder(t, world, 'A-CARD', 2000, DAY_A, 'card');
  await addOrder(t, world, 'B-CASH', 3000, DAY_B);
  await addOrder(t, world, 'C-CASH', 4000, DAY_C);

  // Collected later (DAY_C) but belonging to report day A.
  await addCollection(t, world, 500, DAY_A, DAY_C);
  await addCollection(t, world, 700, DAY_B, DAY_B);

  await addDeposit(t, world, 300, DAY_A, 'approved');
  await addDeposit(t, world, 200, DAY_B, 'submitted');

  await addTpe(t, world, 1500, DAY_A, 'approved');
  await addTpe(t, world, 800, DAY_B, 'pending_review');

  return world;
}

describe('getSupervisorDashboardData', () => {
  it('returns the KPIs for the requested report date only', async () => {
    const t = makeT();
    const world = await seedMultiDay(t);

    const data = await adminClient(t, world).query(
      api.reconciliation.getSupervisorDashboardData,
      { reportDate: DAY_B }
    );

    expect(data.reportDate).toBe(DAY_B);
    expect(data.kpis).toMatchObject({
      totalCashDue: 3000,
      totalCardDue: 0,
      totalCollected: 700,
      totalDeposited: 0,
      totalPendingDeposit: 200,
      totalTpeApproved: 0,
      totalTpePending: 800,
      cashAwaitingDeposit: 500,
      cashOutstanding: 2300,
      cardVariance: 0,
    });
    expect(data.riders).toHaveLength(1);
    expect(data.riders[0]).toMatchObject({
      cashDue: 3000,
      cardDue: 0,
      collected: 700,
      remaining: 2300,
    });
  });

  it('defaults to the current Casablanca day when reportDate is omitted', async () => {
    const t = makeT();
    const world = await seedWorld(t);
    const today = startOfDayCasablanca(Date.now());

    await addOrder(t, world, 'TODAY-CASH', 12345, today);
    await addCollection(t, world, 2345, today, today);

    const data = await adminClient(t, world).query(
      api.reconciliation.getSupervisorDashboardData,
      {}
    );

    expect(data.reportDate).toBe(today);
    expect(data.kpis.totalCashDue).toBe(12345);
    expect(data.kpis.totalCollected).toBe(2345);
  });

  it('counts approved deposits registered at any time of the Casablanca day', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    await addOrder(t, world, 'DAY-CASH', 5000, DAY_A);
    await addCollection(t, world, 5000, DAY_A, DAY_A);
    const dayEnd = endOfDayCasablanca(DAY_A);

    // `depositDate` is the registration instant (Date.now()), not midnight.
    await addDeposit(t, world, 1285.14, DAY_A + 9 * 60 * 60 * 1000, 'approved');
    await addDeposit(t, world, 1609.14, dayEnd, 'approved');
    await addDeposit(t, world, 400, DAY_A + 11 * 60 * 60 * 1000, 'submitted');
    await addDeposit(t, world, 999, DAY_B + 9 * 60 * 60 * 1000, 'approved');

    const data = await adminClient(t, world).query(
      api.reconciliation.getSupervisorDashboardData,
      { reportDate: DAY_A }
    );

    expect(data.kpis.totalDeposited).toBe(2894.28);
    expect(data.kpis.totalPendingDeposit).toBe(400);
    expect(data.kpis.cashAwaitingDeposit).toBe(5000 - 2894.28 - 400);

    // The overview panel must agree with the supervisor KPI.
    const overview = await adminClient(t, world).query(api.reconciliation.getAdminDashboardData, {
      fromDate: DAY_A,
      toDate: DAY_A,
    });
    expect(overview.deposits.approved).toBe(2894.28);
  });

  it('resolves a UTC instant near midnight to the Casablanca day', async () => {
    const t = makeT();
    const world = await seedMultiDay(t);
    const admin = adminClient(t, world);

    // 23:30 UTC on Oct 25 is 00:30 on Oct 26 in Casablanca (UTC+1).
    const afterMidnight = await admin.query(api.reconciliation.getSupervisorDashboardData, {
      reportDate: Date.UTC(2026, 9, 25, 23, 30),
    });
    expect(afterMidnight.reportDate).toBe(DAY_B);
    expect(afterMidnight.kpis.totalCashDue).toBe(3000);

    // 22:30 UTC on Oct 25 is still Oct 25 in Casablanca.
    const beforeMidnight = await admin.query(api.reconciliation.getSupervisorDashboardData, {
      reportDate: Date.UTC(2026, 9, 25, 22, 30),
    });
    expect(beforeMidnight.reportDate).toBe(DAY_A);
    expect(beforeMidnight.kpis.totalCashDue).toBe(1000);
  });
});

describe('TPE approval KPIs', () => {
  it('counts an approved rider TPE receipt when its command matches a card order', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    await addOrder(t, world, 'CMD-TPE', 2500, DAY_A, 'card');
    const entry = await addLiveEntry(t, world, 'CMD-TPE', 2500, DAY_A, 'tpe');
    await addLiveTpeReceipt(t, world, entry, 'approved');

    const admin = adminClient(t, world);

    const supervisor = await admin.query(api.reconciliation.getSupervisorDashboardData, {
      reportDate: DAY_A,
    });
    expect(supervisor.kpis.totalTpeApproved).toBe(2500);
    expect(supervisor.kpis.totalCardDue).toBe(2500);
    expect(supervisor.kpis.cardVariance).toBe(0);
    expect(supervisor.pendingTpe).toHaveLength(0);

    const overview = await admin.query(api.reconciliation.getAdminDashboardData, {
      fromDate: DAY_A,
      toDate: DAY_A,
    });
    expect(overview.tpeReceipts).toMatchObject({
      approved: 2500,
      countApproved: 1,
      pending: 0,
      countPending: 0,
    });
  });

  it('exposes pending rider TPE receipts and ignores unmatched approvals', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    await addOrder(t, world, 'MATCHED', 1200, DAY_A, 'card');
    const matched = await addLiveEntry(t, world, 'MATCHED', 1200, DAY_A, 'tpe');
    await addLiveTpeReceipt(t, world, matched, 'approved');

    const unmatched = await addLiveEntry(t, world, 'NO-EXCEL', 900, DAY_A, 'tpe');
    await addLiveTpeReceipt(t, world, unmatched, 'approved');

    const pendingEntry = await addLiveEntry(t, world, 'STILL-PENDING', 700, DAY_A, 'tpe');
    await addLiveTpeReceipt(t, world, pendingEntry, 'pending_review');

    const data = await adminClient(t, world).query(
      api.reconciliation.getSupervisorDashboardData,
      { reportDate: DAY_A }
    );

    // Only the receipt backed by a matching card order is approved revenue.
    expect(data.kpis.totalTpeApproved).toBe(1200);
    expect(data.kpis.totalTpePending).toBe(700);
    expect(data.pendingTpe).toHaveLength(1);
  });
});

describe('getAdminDashboardData', () => {
  it('filters every KPI to the requested inclusive range', async () => {
    const t = makeT();
    const world = await seedMultiDay(t);

    const data = await adminClient(t, world).query(api.reconciliation.getAdminDashboardData, {
      fromDate: DAY_A,
      toDate: DAY_B,
    });

    expect(data.dateRange).toEqual({ from: DAY_A, to: endOfDayCasablanca(DAY_B) });
    expect(data.totals).toMatchObject({
      cashDue: 4000,
      cardDue: 2000,
      onlinePaymentExcluded: 0,
    });
    // The DAY_A collection was recorded on DAY_C but settles report day A.
    expect(data.collections).toMatchObject({ total: 1200, count: 2 });
    expect(data.deposits).toMatchObject({
      submitted: 200,
      approved: 300,
      rejected: 0,
      countSubmitted: 1,
      countApproved: 1,
    });
    expect(data.tpeReceipts).toMatchObject({
      pending: 800,
      approved: 1500,
      countPending: 1,
      countApproved: 1,
    });
    expect(data.imports.totalBatches).toBe(1);
  });

  it('swaps an inverted range instead of returning an empty dashboard', async () => {
    const t = makeT();
    const world = await seedMultiDay(t);

    const data = await adminClient(t, world).query(api.reconciliation.getAdminDashboardData, {
      fromDate: DAY_B,
      toDate: DAY_A,
    });

    expect(data.dateRange).toEqual({ from: DAY_A, to: endOfDayCasablanca(DAY_B) });
    expect(data.totals.cashDue).toBe(4000);
  });

  it('defaults to the last seven days when no range is provided', async () => {
    const t = makeT();
    const world = await seedWorld(t);
    const today = startOfDayCasablanca(Date.now());
    const thirtyDaysAgo = startOfDayCasablanca(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await addOrder(t, world, 'TODAY', 1111, today);
    await addOrder(t, world, 'OLD', 9999, thirtyDaysAgo);

    const data = await adminClient(t, world).query(api.reconciliation.getAdminDashboardData, {});

    expect(data.totals.cashDue).toBe(1111);
  });
});
