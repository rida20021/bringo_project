import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { requireAdmin, requireAppUser, requireSupervisor } from './lib/auth';

/**
 * Supervisor or Admin records a bank deposit tied to a rider.
 * Takes the rider ID, deposit amount in centimes, and a single receipt storage ID.
 * The deposit is inserted with `pending_review` status for admin approval.
 */
export const createBankDeposit = mutation({
  args: {
    riderId: v.id('riders'),
    amount: v.number(),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const appUser = await requireSupervisor(ctx);

    if (args.amount <= 0) throw new Error('Amount must be greater than zero');

    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error('Rider not found');

    const stored = await ctx.db.system.get('_storage', args.storageId);
    if (!stored) throw new Error('Receipt file not found in storage');

    return ctx.db.insert('bankDeposits', {
      amount: args.amount,
      depositDate: Date.now(),
      depositedBy: appUser.userId,
      riderId: args.riderId,
      status: 'pending_review',
      evidenceStorageIds: [args.storageId],
      createdAt: Date.now(),
    });
  },
});

export const reviewBankDeposit = mutation({
  args: {
    depositId: v.id('bankDeposits'),
    action: v.union(v.literal('approve'), v.literal('reject')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) throw new Error('Deposit not found');
    if (deposit.status !== 'submitted' && deposit.status !== 'pending_review') {
      throw new Error('Deposit is not awaiting review');
    }
    if (args.action === 'reject' && !args.reason?.trim()) throw new Error('A rejection reason is required');

    if (args.action === 'approve') {
      await ctx.db.patch(args.depositId, {
        status: 'approved',
        reviewedBy: appUser.userId,
        reviewedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.depositId, {
        status: 'rejected',
        reviewedBy: appUser.userId,
        reviewedAt: Date.now(),
        rejectionReason: args.reason,
      });
    }
  },
});

export const getBankDeposits = query({
  args: {
    status: v.optional(v.union(v.literal('pending_review'), v.literal('submitted'), v.literal('approved'), v.literal('rejected'))),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const limit = Math.min(args.limit ?? 200, 500);
    const fromDate = args.fromDate;
    const toDate = args.toDate;

    const applyDateFilters = (q: FilterBuilder<DataModel['bankDeposits']>) => {
      const conditions: Expression<boolean>[] = [];
      if (fromDate !== undefined) conditions.push(q.gte(q.field('depositDate'), fromDate));
      if (toDate !== undefined) conditions.push(q.lte(q.field('depositDate'), toDate));
      return conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    if (args.status) {
      return ctx.db
        .query('bankDeposits')
        .withIndex('status', (q) => q.eq('status', args.status!))
        .filter(applyDateFilters)
        .order('desc')
        .take(limit);
    }

    return ctx.db.query('bankDeposits').filter(applyDateFilters).order('desc').take(limit);
  },
});

export const getDepositAllocations = query({
  args: { depositId: v.id('bankDeposits') },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    return ctx.db
      .query('depositAllocations')
      .withIndex('depositId', (q) => q.eq('depositId', args.depositId))
      .collect();
  },
});
