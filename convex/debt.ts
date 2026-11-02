import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdmin } from './lib/auth';
import { insertAuditEvent } from './audit';
import { startOfDayCasablanca } from './lib/dates';

/**
 * Record cash lost by a rider as an outstanding debt on their profile.
 *
 * Rider debts stay on `userProfiles.debtBalance` for now; the auth user is not
 * linked to the Excel `riders` table. The admin records the loss explicitly so
 * it can be audited with a reason and the business day it belongs to.
 */
export const recordRiderLoss = mutation({
  args: {
    riderUserId: v.id('users'),
    amount: v.number(),
    reason: v.string(),
    sourceReportDate: v.number(),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);

    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
      throw new Error('Amount must be a positive integer number of centimes');
    }

    const reason = args.reason.trim();
    if (!reason) throw new Error('A reason is required to record a rider loss');

    if (!Number.isFinite(args.sourceReportDate)) {
      throw new Error('Invalid report date');
    }

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.riderUserId))
      .unique();
    if (!profile) throw new Error('Profile not found');
    if (profile.role !== 'rider') throw new Error('Losses can only be recorded against a rider');

    const sourceReportDate = startOfDayCasablanca(args.sourceReportDate);
    const previousBalance = profile.debtBalance ?? 0;
    const debtBalance = previousBalance + args.amount;

    await ctx.db.patch(profile._id, {
      debtBalance,
      updatedAt: Date.now(),
    });

    await insertAuditEvent(ctx, {
      actorId: appUser.userId,
      action: 'rider.debt_recorded',
      targetType: 'users',
      targetId: args.riderUserId,
      reason,
      beforeSummary: { debtBalance: previousBalance },
      afterSummary: {
        debtBalance,
        amount: args.amount,
        sourceReportDate,
      },
    });

    return { debtBalance };
  },
});
