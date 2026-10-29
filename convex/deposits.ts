import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { requireAdmin, requireAppUser } from './lib/auth';

export const createBankDeposit = mutation({
  args: {
    amount: v.number(),
    bankReference: v.string(),
    depositDate: v.number(),
    evidenceStorageIds: v.array(v.id('_storage')),
    allocations: v.array(v.object({ collectionId: v.id('cashCollections'), allocatedAmount: v.number() })),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAppUser(ctx);

    let totalAllocated = 0;
    for (const alloc of args.allocations) {
      const collection = await ctx.db.get(alloc.collectionId);
      if (!collection) throw new Error(`Collection ${alloc.collectionId} not found`);
      if (collection.isReversal) throw new Error(`Collection ${alloc.collectionId} is a reversal`);
      totalAllocated += alloc.allocatedAmount;
    }
    if (totalAllocated > args.amount) throw new Error('Total allocated exceeds deposit amount');

    const depositId = await ctx.db.insert('bankDeposits', {
      amount: args.amount,
      bankReference: args.bankReference,
      depositDate: args.depositDate,
      depositedBy: appUser.userId,
      status: 'submitted',
      evidenceStorageIds: args.evidenceStorageIds,
      createdAt: Date.now(),
    });

    for (const alloc of args.allocations) {
      await ctx.db.insert('depositAllocations', {
        depositId,
        collectionId: alloc.collectionId,
        allocatedAmount: alloc.allocatedAmount,
      });
    }

    return depositId;
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
    if (deposit.status !== 'submitted') throw new Error('Deposit not in submitted state');
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
    status: v.optional(v.union(v.literal('submitted'), v.literal('approved'), v.literal('rejected'))),
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
