import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { auth } from './auth';

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db.get(identity.subject);
    if (!user) return null;
    const profile = await ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', user._id)).unique();
    return { ...user, role: profile?.role || 'supervisor', displayName: profile?.displayName || user.name || 'User' };
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');
    const profile = await ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', identity.subject)).unique();
    if (!profile || profile.role !== 'admin') throw new Error('Forbidden');
    return ctx.db.query('userProfiles').collect();
  },
});

export const createUser = mutation({
  args: { email: v.string(), role: v.union(v.literal('supervisor'), v.literal('admin')), displayName: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');
    const profile = await ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', identity.subject)).unique();
    if (!profile || profile.role !== 'admin') throw new Error('Forbidden');
    const userId = await ctx.db.insert('users', { email: args.email, name: args.displayName });
    await ctx.db.insert('userProfiles', { userId, role: args.role, displayName: args.displayName, isActive: true, createdAt: Date.now(), updatedAt: Date.now() });
    return userId;
  },
});

export const updateUserRole = mutation({
  args: { userId: v.id('users'), role: v.union(v.literal('supervisor'), v.literal('admin')) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');
    const profile = await ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', identity.subject)).unique();
    if (!profile || profile.role !== 'admin') throw new Error('Forbidden');
    await ctx.db.patch(args.userId, { role: args.role, updatedAt: Date.now() });
  },
});