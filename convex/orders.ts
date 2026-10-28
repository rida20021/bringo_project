import { query } from './_generated/server';
import { v } from 'convex/values';

export const getOrders = query({
  args: {
    deliveryDate: v.optional(v.number()),
    riderId: v.optional(v.id('riders')),
    paymentMethod: v.optional(v.union(v.literal('cash'), v.literal('card'), v.literal('online_payment'))),
    eligibilityStatus: v.optional(v.union(v.literal('eligible'), v.literal('excluded_payment_method'), v.literal('quarantined'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query('orders');
    if (args.deliveryDate) q = q.withIndex('deliveryDate', (q) => q.eq('deliveryDate', args.deliveryDate));
    if (args.riderId) q = q.withIndex('riderId', (q) => q.eq('riderId', args.riderId));
    if (args.paymentMethod) q = q.withIndex('paymentMethod', (q) => q.eq('paymentMethod', args.paymentMethod));
    if (args.eligibilityStatus) q = q.filter((q) => q.eq(q.field('eligibilityStatus'), args.eligibilityStatus));
    return q.order('desc').take(args.limit || 200).collect();
  },
});

export const getOrderById = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, args) => {
    return ctx.db.get(args.orderId);
  },
});

export const getRiderBalances = query({
  args: { deliveryDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const orders = await ctx.db.query('orders')
      .filter((q) => q.eq(q.field('eligibilityStatus'), 'eligible'))
      .filter((q) => q.or(q.eq(q.field('paymentMethod'), 'cash'), q.eq(q.field('paymentMethod'), 'card')))
      .collect();

    const riderMap = new Map<string, { riderId: string; rawName: string; cashDue: number; cardDue: number; orders: any[] }>();

    for (const order of orders) {
      if (args.deliveryDate && order.deliveryDate !== args.deliveryDate) continue;
      const key = order.riderId;
      if (!riderMap.has(key)) {
        riderMap.set(key, { riderId: order.riderId, rawName: order.rawRiderName, cashDue: 0, cardDue: 0, orders: [] });
      }
      const rider = riderMap.get(key)!;
      rider.orders.push(order);
      if (order.paymentMethod === 'cash') rider.cashDue += order.amount;
      else if (order.paymentMethod === 'card') rider.cardDue += order.amount;
    }

    return Array.from(riderMap.values());
  },
});