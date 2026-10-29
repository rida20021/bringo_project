import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { requireAdmin, requireAppUser } from './lib/auth';

export const createTpeReceipt = mutation({
  args: {
    claimedAmount: v.number(),
    receiptDate: v.number(),
    terminalRef: v.optional(v.string()),
    merchantRef: v.optional(v.string()),
    evidenceStorageIds: v.array(v.id('_storage')),
    allocations: v.array(v.object({ orderId: v.id('orders'), allocatedAmount: v.number() })),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAppUser(ctx);

    let totalAllocated = 0;
    for (const alloc of args.allocations) {
      const order = await ctx.db.get(alloc.orderId);
      if (!order) throw new Error(`Order ${alloc.orderId} not found`);
      if (order.paymentMethod !== 'card') throw new Error(`Order ${alloc.orderId} is not a card order`);
      if (order.eligibilityStatus !== 'eligible') throw new Error(`Order ${alloc.orderId} not eligible`);
      totalAllocated += alloc.allocatedAmount;
    }
    if (totalAllocated > args.claimedAmount) throw new Error('Total allocated exceeds receipt claimed amount');

    const receiptId = await ctx.db.insert('tpeReceipts', {
      claimedAmount: args.claimedAmount,
      receiptDate: args.receiptDate,
      uploadedBy: appUser.userId,
      terminalRef: args.terminalRef,
      merchantRef: args.merchantRef,
      status: 'pending_review',
      evidenceStorageIds: args.evidenceStorageIds,
      createdAt: Date.now(),
    });

    for (const alloc of args.allocations) {
      await ctx.db.insert('tpeReceiptAllocations', {
        receiptId,
        orderId: alloc.orderId,
        allocatedAmount: alloc.allocatedAmount,
      });
    }

    return receiptId;
  },
});

export const reviewTpeReceipt = mutation({
  args: {
    receiptId: v.id('tpeReceipts'),
    action: v.union(v.literal('approve'), v.literal('reject')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new Error('Receipt not found');
    if (receipt.status !== 'pending_review') throw new Error('Receipt not in pending_review state');
    if (args.action === 'reject' && !args.reason?.trim()) throw new Error('A rejection reason is required');

    if (args.action === 'approve') {
      await ctx.db.patch(args.receiptId, {
        status: 'approved',
        reviewedBy: appUser.userId,
        reviewedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.receiptId, {
        status: 'rejected',
        reviewedBy: appUser.userId,
        reviewedAt: Date.now(),
        rejectionReason: args.reason,
      });
    }
  },
});

export const getTpeReceipts = query({
  args: {
    status: v.optional(v.union(v.literal('pending_review'), v.literal('approved'), v.literal('rejected'))),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const limit = Math.min(args.limit ?? 200, 500);
    const fromDate = args.fromDate;
    const toDate = args.toDate;

    const applyDateFilters = (q: FilterBuilder<DataModel['tpeReceipts']>) => {
      const conditions: Expression<boolean>[] = [];
      if (fromDate !== undefined) conditions.push(q.gte(q.field('receiptDate'), fromDate));
      if (toDate !== undefined) conditions.push(q.lte(q.field('receiptDate'), toDate));
      return conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    if (args.status) {
      return ctx.db
        .query('tpeReceipts')
        .withIndex('status', (q) => q.eq('status', args.status!))
        .filter(applyDateFilters)
        .order('desc')
        .take(limit);
    }

    return ctx.db.query('tpeReceipts').filter(applyDateFilters).order('desc').take(limit);
  },
});

export const getTpeReceiptAllocations = query({
  args: { receiptId: v.id('tpeReceipts') },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    return ctx.db
      .query('tpeReceiptAllocations')
      .withIndex('receiptId', (q) => q.eq('receiptId', args.receiptId))
      .collect();
  },
});
