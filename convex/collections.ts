import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createCashCollection = mutation({
  args: {
    riderId: v.id('riders'),
    amount: v.number(),
    collectedAt: v.number(),
    note: v.optional(v.string()),
    sourceReportDate: v.number(),
    allocations: v.array(v.object({ orderId: v.id('orders'), allocatedAmount: v.number() })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');

    let totalAllocated = 0;
    for (const alloc of args.allocations) {
      const order = await ctx.db.get(alloc.orderId);
      if (!order) throw new Error(`Order ${alloc.orderId} not found`);
      if (order.paymentMethod !== 'cash') throw new Error(`Order ${alloc.orderId} is not a cash order`);
      if (order.eligibilityStatus !== 'eligible') throw new Error(`Order ${alloc.orderId} not eligible`);
      totalAllocated += alloc.allocatedAmount;
    }
    if (totalAllocated > args.amount) throw new Error('Total allocated exceeds collection amount');

    const collectionId = await ctx.db.insert('cashCollections', {
      riderId: args.riderId,
      amount: args.amount,
      collectedAt: args.collectedAt,
      collectedBy: identity.subject,
      note: args.note,
      sourceReportDate: args.sourceReportDate,
      isReversal: false,
      createdAt: Date.now(),
    });

    for (const alloc of args.allocations) {
      await ctx.db.insert('cashCollectionAllocations', {
        collectionId,
        orderId: alloc.orderId,
        allocatedAmount: alloc.allocatedAmount,
      });
    }

    return collectionId;
  },
});

export const getCashCollections = query({
  args: { riderId: v.optional(v.id('riders')), fromDate: v.optional(v.number()), toDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let q = ctx.db.query('cashCollections').filter((q) => q.eq(q.field('isReversal'), false));
    if (args.riderId) q = q.withIndex('riderId', (q) => q.eq('riderId', args.riderId));
    if (args.fromDate) q = q.filter((q) => q.gte(q.field('collectedAt'), args.fromDate));
    if (args.toDate) q = q.filter((q) => q.lte(q.field('collectedAt'), args.toDate));
    return q.order('desc').collect();
  },
});

export const getCollectionAllocations = query({
  args: { collectionId: v.id('cashCollections') },
  handler: async (ctx, args) => {
    return ctx.db.query('cashCollectionAllocations').withIndex('collectionId', (q) => q.eq('collectionId', args.collectionId)).collect();
  },
});