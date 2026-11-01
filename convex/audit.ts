import { query, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import type { Id } from './_generated/dataModel';
import { requireAdmin } from './lib/auth';

/** Directly insert an audit event from any mutation without the internal-mutation dance. */
export async function insertAuditEvent(
  ctx: MutationCtx,
  args: {
    actorId: Id<'users'>;
    action: string;
    targetType: string;
    targetId: Id<'users'> | Id<'orders'> | Id<'cashCollections'> | Id<'bankDeposits'> | Id<'tpeReceipts'> | Id<'importBatches'> | Id<'riders'> | Id<'liveEntryReceipts'> | Id<'discrepancies'>;
    reason?: string;
    beforeSummary?: unknown;
    afterSummary?: unknown;
    correlationId?: string;
  }
): Promise<Id<'auditEvents'>> {
  return ctx.db.insert('auditEvents', {
    ...args,
    timestamp: Date.now(),
  });
}

const targetIdValidator = v.union(
  v.id('users'),
  v.id('orders'),
  v.id('cashCollections'),
  v.id('bankDeposits'),
  v.id('tpeReceipts'),
  v.id('importBatches'),
  v.id('riders'),
  v.id('liveEntryReceipts'),
  v.id('discrepancies')
);

export const logAuditEvent = internalMutation({
  args: {
    actorId: v.id('users'),
    action: v.string(),
    targetType: v.string(),
    targetId: targetIdValidator,
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
    targetId: v.optional(targetIdValidator),
    actorId: v.optional(v.id('users')),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? 100, 500);
    const fromDate = args.fromDate;
    const toDate = args.toDate;

    const dateFilter = (q: FilterBuilder<DataModel['auditEvents']>) => {
      const conditions: Expression<boolean>[] = [];
      if (fromDate !== undefined) conditions.push(q.gte(q.field('timestamp'), fromDate));
      if (toDate !== undefined) conditions.push(q.lte(q.field('timestamp'), toDate));
      return conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    if (args.targetType && args.targetId) {
      return ctx.db
        .query('auditEvents')
        .withIndex('target', (q) => q.eq('targetType', args.targetType!).eq('targetId', args.targetId!))
        .filter(dateFilter)
        .order('desc')
        .take(limit);
    }

    if (args.actorId) {
      return ctx.db
        .query('auditEvents')
        .withIndex('actorId', (q) => q.eq('actorId', args.actorId!))
        .filter(dateFilter)
        .order('desc')
        .take(limit);
    }

    return ctx.db
      .query('auditEvents')
      .withIndex('timestamp', (q) => q.gte('timestamp', fromDate ?? 0))
      .filter((q) => (toDate === undefined ? true : q.lte(q.field('timestamp'), toDate)))
      .order('desc')
      .take(limit);
  },
});
