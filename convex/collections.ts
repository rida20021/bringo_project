import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { requireAppUser } from './lib/auth';

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
    const appUser = await requireAppUser(ctx);

    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error(`Rider ${args.riderId} not found`);

    let totalAllocated = 0;
    for (const alloc of args.allocations) {
      const order = await ctx.db.get(alloc.orderId);
      if (!order) throw new Error(`Order ${alloc.orderId} not found`);
      if (order.riderId !== args.riderId) throw new Error(`Order ${alloc.orderId} belongs to a different rider`);
      if (order.paymentMethod !== 'cash') throw new Error(`Order ${alloc.orderId} is not a cash order`);
      if (order.eligibilityStatus !== 'eligible') throw new Error(`Order ${alloc.orderId} not eligible`);
      totalAllocated += alloc.allocatedAmount;
    }
    if (totalAllocated > args.amount) throw new Error('Total allocated exceeds collection amount');

    const collectionId = await ctx.db.insert('cashCollections', {
      riderId: args.riderId,
      amount: args.amount,
      collectedAt: args.collectedAt,
      collectedBy: appUser.userId,
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
  args: {
    riderId: v.optional(v.id('riders')),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const limit = Math.min(args.limit ?? 200, 500);
    const fromDate = args.fromDate;
    const toDate = args.toDate;

    const applyFilters = (q: FilterBuilder<DataModel['cashCollections']>) => {
      const conditions: Expression<boolean>[] = [q.eq(q.field('isReversal'), false)];
      if (fromDate !== undefined) conditions.push(q.gte(q.field('collectedAt'), fromDate));
      if (toDate !== undefined) conditions.push(q.lte(q.field('collectedAt'), toDate));
      return conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    if (args.riderId) {
      return ctx.db
        .query('cashCollections')
        .withIndex('riderId', (q) => q.eq('riderId', args.riderId!))
        .filter(applyFilters)
        .order('desc')
        .take(limit);
    }

    return ctx.db.query('cashCollections').filter(applyFilters).order('desc').take(limit);
  },
});

export const getCollectionAllocations = query({
  args: { collectionId: v.id('cashCollections') },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    return ctx.db
      .query('cashCollectionAllocations')
      .withIndex('collectionId', (q) => q.eq('collectionId', args.collectionId))
      .collect();
  },
});
