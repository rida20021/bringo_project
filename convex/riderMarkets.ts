import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireAdmin, requireAppUser } from './lib/auth';

/**
 * Assign one or more markets to a rider.
 * Admin only. Replaces existing assignments for the given rider.
 */
export const assignMarketsToRider = mutation({
  args: {
    riderId: v.id('users'),
    marketIds: v.array(v.id('markets')),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);
    const now = Date.now();

    // Verify rider exists and is a rider
    const riderProfile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.riderId))
      .unique();

    if (!riderProfile) {
      throw new Error('Rider profile not found');
    }
    if (riderProfile.role !== 'rider') {
      throw new Error('User is not a rider');
    }

    // Verify all markets exist and are active
    for (const marketId of args.marketIds) {
      const market = await ctx.db.get(marketId);
      if (!market) {
        throw new Error(`Market ${marketId} not found`);
      }
      if (!market.isActive) {
        throw new Error(`Market ${marketId} is not active`);
      }
    }

    // Delete existing assignments for this rider
    const existingAssignments = await ctx.db
      .query('riderMarkets')
      .withIndex('by_rider', (q) => q.eq('riderId', args.riderId))
      .collect();

    for (const assignment of existingAssignments) {
      await ctx.db.delete(assignment._id);
    }

    // Insert new assignments
    for (const marketId of args.marketIds) {
      await ctx.db.insert('riderMarkets', {
        riderId: args.riderId,
        marketId,
        assignedAt: now,
        assignedBy: appUser.userId,
      });
    }

    // Also update the rider's marketIds array in userProfiles for backward compatibility
    const riderProfileForUpdate = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.riderId))
      .unique();

    if (riderProfileForUpdate) {
      await ctx.db.patch(riderProfileForUpdate._id, {
        marketIds: args.marketIds,
        updatedAt: now,
      });
    }

    return { success: true, assignedCount: args.marketIds.length };
  },
});

/**
 * Get markets assigned to the currently authenticated rider.
 * Used by the Live Entry dropdown.
 * Falls back to all active markets if rider has no assignments.
 */
export const getMyMarkets = query({
  args: {},
  handler: async (ctx) => {
    const appUser = await requireAppUser(ctx);

    if (appUser.role !== 'rider') {
      throw new Error('Only riders can call getMyMarkets');
    }

    const riderId = appUser.userId;

    // Get assigned market IDs from riderMarkets table
    const assignments = await ctx.db
      .query('riderMarkets')
      .withIndex('by_rider', (q) => q.eq('riderId', riderId))
      .collect();

    const marketIds = assignments.map((a) => a.marketId);

    if (marketIds.length > 0) {
      // Get the assigned markets
      const markets = [];
      for (const marketId of marketIds) {
        const market = await ctx.db.get(marketId);
        if (market && market.isActive) {
          markets.push(market);
        }
      }
      return markets;
    }

    // Fallback: if no assignments, return all active markets
    // This ensures riders can still submit orders even if admin hasn't assigned markets yet
    return ctx.db
      .query('markets')
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
  },
});

/**
 * Get all markets assigned to a specific rider (admin view).
 */
export const getRiderMarkets = query({
  args: { riderId: v.id('users') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const assignments = await ctx.db
      .query('riderMarkets')
      .withIndex('by_rider', (q) => q.eq('riderId', args.riderId))
      .collect();

    const marketIds = assignments.map((a) => a.marketId);

    const markets = [];
    for (const marketId of marketIds) {
      const market = await ctx.db.get(marketId);
      if (market) {
        markets.push({ ...market, assignedAt: assignments.find(a => a.marketId === marketId)?.assignedAt });
      }
    }

    return markets;
  },
});

/**
 * Remove a specific market assignment for a rider.
 * Admin only.
 */
export const removeRiderMarket = mutation({
  args: {
    riderId: v.id('users'),
    marketId: v.id('markets'),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const assignment = await ctx.db
      .query('riderMarkets')
      .withIndex('by_rider', (q) => q.eq('riderId', args.riderId))
      .filter((q) => q.eq(q.field('marketId'), args.marketId))
      .unique();

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    await ctx.db.delete(assignment._id);

    // Update the rider's marketIds array in userProfiles for backward compatibility
    const remainingAssignments = await ctx.db
      .query('riderMarkets')
      .withIndex('by_rider', (q) => q.eq('riderId', args.riderId))
      .collect();

    const riderProfile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', args.riderId))
      .unique();

    if (riderProfile) {
      await ctx.db.patch(riderProfile._id, {
        marketIds: remainingAssignments.map((a) => a.marketId),
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Get all riders assigned to a specific market.
 */
export const getMarketRiders = query({
  args: { marketId: v.id('markets') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const assignments = await ctx.db
      .query('riderMarkets')
      .withIndex('by_market', (q) => q.eq('marketId', args.marketId))
      .collect();

    const riderIds = assignments.map((a) => a.riderId);

    const riders = [];
    for (const riderId of riderIds) {
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', riderId))
        .unique();
      if (profile) {
        riders.push({ ...profile, assignedAt: assignments.find(a => a.riderId === riderId)?.assignedAt });
      }
    }

    return riders;
  },
});