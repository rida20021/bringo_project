import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

export const logAuditEvent = internalMutation({
  args: {
    actorId: v.id('users'),
    action: v.string(),
    targetType: v.string(),
    targetId: v.union(v.id('users'), v.id('orders'), v.id('cashCollections'), v.id('bankDeposits'), v.id('tpeReceipts'), v.id('importBatches'), v.id('riders')),
    reason: v.optional(v.string()),
    beforeSummary: v.optional(v.any()),
    afterSummary: v.optional(v.any()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('auditEvents', {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const getAuditEvents = query({
  args: {
    targetType: v.optional(v.string()),
    targetId: v.optional(v.union(v.id('users'), v.id('orders'), v.id('cashCollections'), v.id('bankDeposits'), v.id('tpeReceipts'), v.id('importBatches'), v.id('riders'))),
    actorId: v.optional(v.id('users')),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query('auditEvents').withIndex('timestamp', (q) => q.gte('timestamp', args.fromDate || 0));
    if (args.toDate) q = q.withIndex('timestamp', (q) => q.lte('timestamp', args.toDate));
    if (args.targetType && args.targetId) q = q.withIndex('target', (q) => q.eq('targetType', args.targetType).eq('targetId', args.targetId));
    if (args.actorId) q = q.withIndex('actorId', (q) => q.eq('actorId', args.actorId));
    return q.order('desc').take(args.limit || 100).collect();
  },
});