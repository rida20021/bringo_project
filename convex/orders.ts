import { query } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { requireSupervisor } from './lib/auth';

export const getOrders = query({
  args: {
    deliveryDate: v.optional(v.number()),
    riderId: v.optional(v.id('riders')),
    paymentMethod: v.optional(v.union(v.literal('cash'), v.literal('card'), v.literal('online_payment'))),
    eligibilityStatus: v.optional(
      v.union(v.literal('eligible'), v.literal('excluded_payment_method'), v.literal('quarantined'))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const limit = Math.min(args.limit ?? 200, 500);

    const applyFilters = (q: FilterBuilder<DataModel['orders']>) => {
      const conditions: Expression<boolean>[] = [];
      if (args.deliveryDate !== undefined) conditions.push(q.eq(q.field('deliveryDate'), args.deliveryDate));
      if (args.riderId !== undefined) conditions.push(q.eq(q.field('riderId'), args.riderId));
      if (args.paymentMethod !== undefined) conditions.push(q.eq(q.field('paymentMethod'), args.paymentMethod));
      if (args.eligibilityStatus !== undefined) conditions.push(q.eq(q.field('eligibilityStatus'), args.eligibilityStatus));
      return conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    return ctx.db.query('orders').filter(applyFilters).order('desc').take(limit);
  },
});

export const getOrderById = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    return ctx.db.get(args.orderId);
  },
});

export const getRiderBalances = query({
  args: { deliveryDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const targetDate = args.deliveryDate;
    const orders = await ctx.db
      .query('orders')
      .filter((q) => {
        const conditions = [
          q.eq(q.field('eligibilityStatus'), 'eligible'),
          q.or(q.eq(q.field('paymentMethod'), 'cash'), q.eq(q.field('paymentMethod'), 'card')),
        ];
        if (targetDate !== undefined) conditions.push(q.eq(q.field('deliveryDate'), targetDate));
        return q.and(...conditions);
      })
      .collect();

    const riderMap = new Map<
      string,
      { riderId: string; rawName: string; cashDue: number; cardDue: number; orders: typeof orders }
    >();

    for (const order of orders) {
      const key = order.riderId;
      if (!riderMap.has(key)) {
        riderMap.set(key, {
          riderId: order.riderId,
          rawName: order.rawRiderName,
          cashDue: 0,
          cardDue: 0,
          orders: [],
        });
      }
      const rider = riderMap.get(key)!;
      rider.orders.push(order);
      if (order.paymentMethod === 'cash') rider.cashDue += order.amount;
      else if (order.paymentMethod === 'card') rider.cardDue += order.amount;
    }

    return Array.from(riderMap.values());
  },
});
