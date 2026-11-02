import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { requireSupervisor } from './lib/auth';
import { endOfDayCasablanca, startOfDayCasablanca } from './lib/dates';
import { normalizeCommandKey } from './lib/tiktakValues';

type LiveTpeStatus = 'pending_review' | 'approved' | 'rejected';

interface LiveTpeReceiptRow {
  receiptId: Id<'liveEntryReceipts'>;
  liveEntryId: Id<'liveEntries'>;
  status: LiveTpeStatus;
  amount: number;
  commandId: string;
  entryDate: number;
  matchedOrder: boolean;
}

/**
 * Rider-uploaded TPE receipts are stored in `liveEntryReceipts`, not in the
 * admin-entered `tpeReceipts` table. Join them to their live entry and flag
 * whether the entry's command exists as an eligible card order for the same
 * business day (the two sources use different payment-method labels).
 */
async function loadLiveTpeReceipts(
  ctx: QueryCtx,
  from: number,
  to: number,
  cardOrderKeys: Set<string>
): Promise<LiveTpeReceiptRow[]> {
  const entries = await ctx.db
    .query('liveEntries')
    .withIndex('entryDate', (q) => q.gte('entryDate', from).lte('entryDate', to))
    .collect();

  const rows: LiveTpeReceiptRow[] = [];
  for (const entry of entries) {
    const receipts = await ctx.db
      .query('liveEntryReceipts')
      .withIndex('liveEntryId', (q) => q.eq('liveEntryId', entry._id))
      .filter((q) => q.eq(q.field('kind'), 'tpe'))
      .collect();

    if (receipts.length === 0) continue;

    const matchedOrder = cardOrderKeys.has(normalizeCommandKey(entry.commandId));
    for (const receipt of receipts) {
      rows.push({
        receiptId: receipt._id,
        liveEntryId: entry._id,
        status: receipt.status,
        amount: entry.amount,
        commandId: entry.commandId,
        entryDate: entry.entryDate,
        matchedOrder,
      });
    }
  }

  return rows;
}

export const getSupervisorDashboardData = query({
  args: { reportDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    // Normalize the requested instant (a date-picker value or any timestamp) to
    // the start of its Casablanca calendar day, matching `orders.deliveryDate`.
    const targetDate = startOfDayCasablanca(args.reportDate ?? Date.now());

    const cashOrders = await ctx.db.query('orders')
      .withIndex('deliveryDate', (q) => q.eq('deliveryDate', targetDate))
      .filter((q) => q.and(q.eq(q.field('paymentMethod'), 'cash'), q.eq(q.field('eligibilityStatus'), 'eligible')))
      .collect();

    const cardOrders = await ctx.db.query('orders')
      .withIndex('deliveryDate', (q) => q.eq('deliveryDate', targetDate))
      .filter((q) => q.and(q.eq(q.field('paymentMethod'), 'card'), q.eq(q.field('eligibilityStatus'), 'eligible')))
      .collect();

    // Collections belong to the business day they settle (`sourceReportDate`),
    // not the instant they were entered. Reversals never count as collected.
    const collections = await ctx.db.query('cashCollections')
      .withIndex('sourceReportDate', (q) => q.eq('sourceReportDate', targetDate))
      .filter((q) => q.eq(q.field('isReversal'), false))
      .collect();

    // `depositDate` records the instant the deposit was registered, not the
    // start of its business day, so it must be matched with the full Casablanca
    // day range instead of an equality check.
    const targetDateEnd = endOfDayCasablanca(targetDate);
    const deposits = await ctx.db.query('bankDeposits')
      .withIndex('depositDate', (q) => q.gte('depositDate', targetDate).lte('depositDate', targetDateEnd))
      .collect();

    const tpeReceipts = await ctx.db.query('tpeReceipts')
      .filter((q) => q.eq(q.field('receiptDate'), targetDate))
      .collect();

    const cardOrderKeys = new Set(cardOrders.map((order) => normalizeCommandKey(order.commandId)));
    const liveTpe = await loadLiveTpeReceipts(ctx, targetDate, targetDate, cardOrderKeys);
    const approvedLiveTpe = liveTpe.filter((r) => r.status === 'approved' && r.matchedOrder);
    const pendingLiveTpe = liveTpe.filter((r) => r.status === 'pending_review');

    const totalCashDue = cashOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalCardDue = cardOrders.reduce((sum, o) => sum + o.amount, 0);

    const totalCollected = collections.reduce((sum, c) => sum + c.amount, 0);
    const totalDeposited = deposits
      .filter((d) => d.status === 'approved')
      .reduce((sum, d) => sum + d.amount, 0);
    const totalPendingDeposit = deposits
      .filter((d) => d.status === 'submitted' || d.status === 'pending_review')
      .reduce((sum, d) => sum + d.amount, 0);

    // `tpeReceipts` holds admin-entered evidence; rider receipts live in
    // `liveEntryReceipts`. An approved rider receipt only counts once its
    // command matches an eligible card order for the day.
    const totalTpeApproved =
      tpeReceipts
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + r.claimedAmount, 0) +
      approvedLiveTpe.reduce((sum, r) => sum + r.amount, 0);
    const totalTpePending =
      tpeReceipts
        .filter((r) => r.status === 'pending_review')
        .reduce((sum, r) => sum + r.claimedAmount, 0) +
      pendingLiveTpe.reduce((sum, r) => sum + r.amount, 0);

    const riderMap = new Map<string, { riderId: string; name: string; cashDue: number; cardDue: number; collected: number; remaining: number }>();
    for (const order of cashOrders) {
      if (!riderMap.has(order.riderId)) riderMap.set(order.riderId, { riderId: order.riderId, name: order.rawRiderName, cashDue: 0, cardDue: 0, collected: 0, remaining: 0 });
      const r = riderMap.get(order.riderId)!;
      r.cashDue += order.amount;
    }
    for (const order of cardOrders) {
      if (!riderMap.has(order.riderId)) riderMap.set(order.riderId, { riderId: order.riderId, name: order.rawRiderName, cashDue: 0, cardDue: 0, collected: 0, remaining: 0 });
      const r = riderMap.get(order.riderId)!;
      r.cardDue += order.amount;
    }
    for (const col of collections) {
      const r = riderMap.get(col.riderId);
      if (r) r.collected += col.amount;
    }
    for (const [, r] of riderMap) {
      r.remaining = r.cashDue - r.collected;
    }

    return {
      reportDate: targetDate,
      kpis: {
        totalCashDue,
        totalCardDue,
        totalCollected,
        totalDeposited,
        totalPendingDeposit,
        totalTpeApproved,
        totalTpePending,
        cashAwaitingDeposit: totalCollected - totalDeposited - totalPendingDeposit,
        cashOutstanding: totalCashDue - totalCollected,
        cardVariance: totalCardDue - totalTpeApproved,
      },
      riders: Array.from(riderMap.values()).sort((a, b) => b.remaining - a.remaining),
      recentCollections: collections.slice(0, 10),
      pendingDeposits: deposits.filter((d) => d.status === 'submitted' || d.status === 'pending_review'),
      pendingTpe: [
        ...tpeReceipts.filter((r) => r.status === 'pending_review'),
        ...pendingLiveTpe.map((r) => ({
          _id: r.receiptId,
          claimedAmount: r.amount,
          receiptDate: r.entryDate,
          status: 'pending_review' as const,
          source: 'live_entry' as const,
          commandId: r.commandId,
        })),
      ],
    };
  },
});

export const getAdminDashboardData = query({
  args: { fromDate: v.optional(v.number()), toDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const now = Date.now();
    const fromInput = args.fromDate ?? now - 7 * 24 * 60 * 60 * 1000;
    const toInput = args.toDate ?? now;
    // Keep the range inclusive and tolerate inverted inputs (e.g. a stale URL).
    const [fromTs, toTs] = fromInput <= toInput ? [fromInput, toInput] : [toInput, fromInput];
    const from = startOfDayCasablanca(fromTs);
    const to = endOfDayCasablanca(toTs);

    const batches = await ctx.db.query('importBatches')
      .filter((q) => q.and(q.gte(q.field('reportDate'), from), q.lte(q.field('reportDate'), to)))
      .collect();

    const orders = await ctx.db.query('orders')
      .filter((q) => q.and(q.gte(q.field('deliveryDate'), from), q.lte(q.field('deliveryDate'), to)))
      .collect();

    // Collections belong to the business day they settle, not the moment they
    // were entered, so both dashboards agree on the same report date.
    const collections = await ctx.db.query('cashCollections')
      .filter((q) => q.and(q.gte(q.field('sourceReportDate'), from), q.lte(q.field('sourceReportDate'), to)))
      .collect();

    const deposits = await ctx.db.query('bankDeposits')
      .filter((q) => q.and(q.gte(q.field('depositDate'), from), q.lte(q.field('depositDate'), to)))
      .collect();

    const tpeReceipts = await ctx.db.query('tpeReceipts')
      .filter((q) => q.and(q.gte(q.field('receiptDate'), from), q.lte(q.field('receiptDate'), to)))
      .collect();

    const cashOrders = orders.filter((o) => o.paymentMethod === 'cash' && o.eligibilityStatus === 'eligible');
    const cardOrders = orders.filter((o) => o.paymentMethod === 'card' && o.eligibilityStatus === 'eligible');

    const cardOrderKeys = new Set(cardOrders.map((order) => normalizeCommandKey(order.commandId)));
    const liveTpe = await loadLiveTpeReceipts(ctx, from, to, cardOrderKeys);
    const approvedLiveTpe = liveTpe.filter((r) => r.status === 'approved' && r.matchedOrder);
    const pendingLiveTpe = liveTpe.filter((r) => r.status === 'pending_review');
    const rejectedLiveTpe = liveTpe.filter((r) => r.status === 'rejected');

    const manualTpeApproved = tpeReceipts
      .filter((r) => r.status === 'approved')
      .reduce((s, r) => s + r.claimedAmount, 0);
    const manualTpePending = tpeReceipts
      .filter((r) => r.status === 'pending_review')
      .reduce((s, r) => s + r.claimedAmount, 0);
    const manualTpeRejected = tpeReceipts
      .filter((r) => r.status === 'rejected')
      .reduce((s, r) => s + r.claimedAmount, 0);

    return {
      dateRange: { from, to },
      imports: {
        totalBatches: batches.length,
        totalRows: batches.reduce((s, b) => s + b.totalRows, 0),
        acceptedRows: batches.reduce((s, b) => s + b.acceptedRows, 0),
        rejectedRows: batches.reduce((s, b) => s + b.rejectedRows, 0),
        duplicateRows: batches.reduce((s, b) => s + b.duplicateRows, 0),
        conflictRows: batches.reduce((s, b) => s + b.conflictRows, 0),
      },
      totals: {
        cashDue: cashOrders.reduce((s, o) => s + o.amount, 0),
        cardDue: cardOrders.reduce((s, o) => s + o.amount, 0),
        onlinePaymentExcluded: orders.filter((o) => o.paymentMethod === 'online_payment').reduce((s, o) => s + o.amount, 0),
      },
      collections: {
        total: collections.reduce((s, c) => s + c.amount, 0),
        count: collections.length,
      },
      deposits: {
        submitted: deposits.filter((d) => d.status === 'submitted' || d.status === 'pending_review').reduce((s, d) => s + d.amount, 0),
        approved: deposits.filter((d) => d.status === 'approved').reduce((s, d) => s + d.amount, 0),
        rejected: deposits.filter((d) => d.status === 'rejected').reduce((s, d) => s + d.amount, 0),
        countSubmitted: deposits.filter((d) => d.status === 'submitted' || d.status === 'pending_review').length,
        countApproved: deposits.filter((d) => d.status === 'approved').length,
        countRejected: deposits.filter((d) => d.status === 'rejected').length,
      },
      tpeReceipts: {
        pending: manualTpePending + pendingLiveTpe.reduce((s, r) => s + r.amount, 0),
        approved: manualTpeApproved + approvedLiveTpe.reduce((s, r) => s + r.amount, 0),
        rejected: manualTpeRejected + rejectedLiveTpe.reduce((s, r) => s + r.amount, 0),
        countPending:
          tpeReceipts.filter((r) => r.status === 'pending_review').length + pendingLiveTpe.length,
        countApproved:
          tpeReceipts.filter((r) => r.status === 'approved').length + approvedLiveTpe.length,
        countRejected:
          tpeReceipts.filter((r) => r.status === 'rejected').length + rejectedLiveTpe.length,
      },
      recentBatches: batches.slice(0, 20),
    };
  },
});
