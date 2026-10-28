import { query } from './_generated/server';
import { v } from 'convex/values';

export const getSupervisorDashboardData = query({
  args: { reportDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const targetDate = args.reportDate || getStartOfDayCasablanca(Date.now());

    const cashOrders = await ctx.db.query('orders')
      .withIndex('deliveryDate', (q) => q.eq('deliveryDate', targetDate))
      .filter((q) => q.and(q.eq(q.field('paymentMethod'), 'cash'), q.eq(q.field('eligibilityStatus'), 'eligible')))
      .collect();

    const cardOrders = await ctx.db.query('orders')
      .withIndex('deliveryDate', (q) => q.eq('deliveryDate', targetDate))
      .filter((q) => q.and(q.eq(q.field('paymentMethod'), 'card'), q.eq(q.field('eligibilityStatus'), 'eligible')))
      .collect();

    const collections = await ctx.db.query('cashCollections')
      .filter((q) => q.and(
        q.eq(q.field('isReversal'), false),
        q.eq(q.field('sourceReportDate'), targetDate)
      ))
      .collect();

    const deposits = await ctx.db.query('bankDeposits')
      .filter((q) => q.eq(q.field('depositDate'), targetDate))
      .collect();

    const tpeReceipts = await ctx.db.query('tpeReceipts')
      .filter((q) => q.eq(q.field('receiptDate'), targetDate))
      .collect();

    const totalCashDue = cashOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalCardDue = cardOrders.reduce((sum, o) => sum + o.amount, 0);

    const totalCollected = collections.reduce((sum, c) => sum + c.amount, 0);
    const totalDeposited = deposits
      .filter((d) => d.status === 'approved')
      .reduce((sum, d) => sum + d.amount, 0);
    const totalPendingDeposit = deposits
      .filter((d) => d.status === 'submitted')
      .reduce((sum, d) => sum + d.amount, 0);

    const totalTpeApproved = tpeReceipts
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + r.claimedAmount, 0);
    const totalTpePending = tpeReceipts
      .filter((r) => r.status === 'pending_review')
      .reduce((sum, r) => sum + r.claimedAmount, 0);

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
      pendingDeposits: deposits.filter((d) => d.status === 'submitted'),
      pendingTpe: tpeReceipts.filter((r) => r.status === 'pending_review'),
    };
  },
});

export const getAdminDashboardData = query({
  args: { fromDate: v.optional(v.number()), toDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const from = args.fromDate || getStartOfDayCasablanca(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = args.toDate || getEndOfDayCasablanca(Date.now());

    const batches = await ctx.db.query('importBatches')
      .filter((q) => q.and(q.gte(q.field('reportDate'), from), q.lte(q.field('reportDate'), to)))
      .collect();

    const orders = await ctx.db.query('orders')
      .filter((q) => q.and(q.gte(q.field('deliveryDate'), from), q.lte(q.field('deliveryDate'), to)))
      .collect();

    const collections = await ctx.db.query('cashCollections')
      .filter((q) => q.and(q.gte(q.field('collectedAt'), from), q.lte(q.field('collectedAt'), to)))
      .collect();

    const deposits = await ctx.db.query('bankDeposits')
      .filter((q) => q.and(q.gte(q.field('depositDate'), from), q.lte(q.field('depositDate'), to)))
      .collect();

    const tpeReceipts = await ctx.db.query('tpeReceipts')
      .filter((q) => q.and(q.gte(q.field('receiptDate'), from), q.lte(q.field('receiptDate'), to)))
      .collect();

    const cashOrders = orders.filter((o) => o.paymentMethod === 'cash' && o.eligibilityStatus === 'eligible');
    const cardOrders = orders.filter((o) => o.paymentMethod === 'card' && o.eligibilityStatus === 'eligible');

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
        submitted: deposits.filter((d) => d.status === 'submitted').reduce((s, d) => s + d.amount, 0),
        approved: deposits.filter((d) => d.status === 'approved').reduce((s, d) => s + d.amount, 0),
        rejected: deposits.filter((d) => d.status === 'rejected').reduce((s, d) => s + d.amount, 0),
        countSubmitted: deposits.filter((d) => d.status === 'submitted').length,
        countApproved: deposits.filter((d) => d.status === 'approved').length,
        countRejected: deposits.filter((d) => d.status === 'rejected').length,
      },
      tpeReceipts: {
        pending: tpeReceipts.filter((r) => r.status === 'pending_review').reduce((s, r) => s + r.claimedAmount, 0),
        approved: tpeReceipts.filter((r) => r.status === 'approved').reduce((s, r) => s + r.claimedAmount, 0),
        rejected: tpeReceipts.filter((r) => r.status === 'rejected').reduce((s, r) => s + r.claimedAmount, 0),
        countPending: tpeReceipts.filter((r) => r.status === 'pending_review').length,
        countApproved: tpeReceipts.filter((r) => r.status === 'approved').length,
        countRejected: tpeReceipts.filter((r) => r.status === 'rejected').length,
      },
      recentBatches: batches.slice(0, 20),
    };
  },
});

function getStartOfDayCasablanca(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getEndOfDayCasablanca(ts: number): number {
  const date = new Date(ts);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}