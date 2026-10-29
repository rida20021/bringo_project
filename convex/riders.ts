import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireSupervisor } from './lib/auth';

export const getRiders = query({
  args: {},
  handler: async (ctx) => {
    await requireSupervisor(ctx);
    return ctx.db.query('riders').filter((q) => q.eq(q.field('isActive'), true)).collect();
  },
});

export const getOrCreateRider = mutation({
  args: { rawName: v.string() },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const existing = await ctx.db.query('riders').withIndex('canonicalName', (q) => q.eq('canonicalName', args.rawName)).unique();
    if (existing) return existing._id;
    const riderId = await ctx.db.insert('riders', {
      canonicalName: args.rawName,
      aliases: [args.rawName],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return riderId;
  },
});

export const searchRiders = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const riders = await ctx.db.query('riders').filter((q) => q.eq(q.field('isActive'), true)).collect();
    const term = args.searchTerm.toLowerCase();
    return riders.filter((r) => r.canonicalName.toLowerCase().includes(term) || r.aliases.some((a) => a.toLowerCase().includes(term)));
  },
});