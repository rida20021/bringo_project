/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { api } from '../_generated/api';
import { endOfDayCasablanca, startOfDayCasablanca } from '../lib/dates';
import {
  addCollection,
  addDeposit,
  addLiveEntry,
  addLiveTpeReceipt,
  addOrder,
  addTpe,
  adminClient,
  makeT,
  seedWorld,
  type T,
  type World,
} from './_helpers/world';

const modules = import.meta.glob([
  '../**/*.ts',
  '!../**/*.test.ts',
  '!../auth.ts',
  '!../auth.config.ts',
  '!../http.ts',
  '!../index.ts',
  '!../tests/_helpers/**/*.ts',
]);

const DAY_A = startOfDayCasablanca(Date.UTC(2026, 9, 25, 12));
const DAY_B = startOfDayCasablanca(Date.UTC(2026, 9, 26, 12));
const DAY_C = startOfDayCasablanca(Date.UTC(2026, 9, 27, 12));

/** Seeds two full business days (A and B) plus an out-of-range order on C. */
async function seedMultiDay(t: T): Promise<World> {
  const world = await seedWorld(t, DAY_A);

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
    const t = makeT(modules);
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
    const t = makeT(modules);
    const world = await seedWorld(t, DAY_A);
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
    const t = makeT(modules);
    const world = await seedWorld(t, DAY_A);

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
    const t = makeT(modules);
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
    const t = makeT(modules);
    const world = await seedWorld(t, DAY_A);

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
    const t = makeT(modules);
    const world = await seedWorld(t, DAY_A);

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
    const t = makeT(modules);
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
      totalImported: 6000,
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
    const t = makeT(modules);
    const world = await seedMultiDay(t);

    const data = await adminClient(t, world).query(api.reconciliation.getAdminDashboardData, {
      fromDate: DAY_B,
      toDate: DAY_A,
    });

    expect(data.dateRange).toEqual({ from: DAY_A, to: endOfDayCasablanca(DAY_B) });
    expect(data.totals.cashDue).toBe(4000);
  });

  it('defaults to the last seven days when no range is provided', async () => {
    const t = makeT(modules);
    const world = await seedWorld(t, DAY_A);
    const today = startOfDayCasablanca(Date.now());
    const thirtyDaysAgo = startOfDayCasablanca(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await addOrder(t, world, 'TODAY', 1111, today);
    await addOrder(t, world, 'OLD', 9999, thirtyDaysAgo);

    const data = await adminClient(t, world).query(api.reconciliation.getAdminDashboardData, {});

    expect(data.totals.cashDue).toBe(1111);
  });
});

describe('getGlobalReconciliation', () => {
  it('merges orders and liveEntries correctly without double counting and computes true debt/real cash', async () => {
    const t = makeT(modules);
    const world = await seedWorld(t, DAY_A);

    // Case A: Exact Match (Excel 1000, Live 1000)
    await addOrder(t, world, 'CMD-MATCH', 1000, DAY_A);
    await addLiveEntry(t, world, 'CMD-MATCH', 1000, DAY_A, 'cash');

    // Case B: Mismatch (Excel 2000, Live 1800)
    await addOrder(t, world, 'CMD-MISMATCH', 2000, DAY_A);
    await addLiveEntry(t, world, 'CMD-MISMATCH', 1800, DAY_A, 'cash');

    // Case C: Missing Live (Excel 3000, no Live entry)
    await addOrder(t, world, 'CMD-MISSING-LIVE', 3000, DAY_A);

    // Case D: Live Only (No Excel, Live 1500)
    await addLiveEntry(t, world, 'CMD-LIVE-ONLY', 1500, DAY_A, 'cash');

    // Collections
    await addCollection(t, world, 500, DAY_A, DAY_A);

    const result = await adminClient(t, world).query(
      api.reconciliation.getGlobalReconciliation,
      { fromDate: DAY_A, toDate: DAY_A }
    );

    expect(result.totals.excelTotal).toBe(1000 + 2000 + 3000); // 6000
    // realCash = Excel total (6000) + Live Only (1500) = 7500
    expect(result.totals.realCash).toBe(7500);
    expect(result.totals.liveOnlyTotal).toBe(1500);
    expect(result.totals.collected).toBe(500);

    expect(result.alerts.mismatchCount).toBe(1);
    expect(result.alerts.missingLiveCount).toBe(1);
    expect(result.alerts.liveOnlyCount).toBe(1);

    expect(result.mismatches).toEqual([
      { commandId: 'CMD-MISMATCH', liveAmount: 1800, excelAmount: 2000 },
    ]);
    expect(result.missingLive).toEqual([
      { commandId: 'CMD-MISSING-LIVE', excelAmount: 3000 },
    ]);
    expect(result.liveOnly).toEqual([
      { commandId: 'CMD-LIVE-ONLY', liveAmount: 1500 },
    ]);
  });
});
