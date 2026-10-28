import { mutation, query, internalQuery, internalMutation } from './_generated/server';
import { v } from 'convex/values';

export const getImportSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query('importSettings').first();
  },
});

export const updateImportSettings = mutation({
  args: {
    allowedSenders: v.array(v.string()),
    subjectPattern: v.string(),
    gmailLabel: v.optional(v.string()),
    attachmentExtensions: v.array(v.string()),
    timezone: v.string(),
    alertRecipients: v.array(v.string()),
    maxFileSizeMB: v.number(),
    allowedMimeTypes: v.array(v.string()),
    retentionDays: v.number(),
    invalidRowPolicy: v.union(v.literal('partial_accept'), v.literal('block_report')),
    importSLAMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');
    const profile = await ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', identity.subject)).unique();
    if (!profile || profile.role !== 'admin') throw new Error('Forbidden');

    const existing = await ctx.db.query('importSettings').first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now(), updatedBy: identity.subject });
    } else {
      await ctx.db.insert('importSettings', { ...args, updatedAt: Date.now(), updatedBy: identity.subject });
    }
  },
});

export const getSyncCursor = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query('importSettings').first();
    return settings?.syncCursor;
  },
});

export const updateSyncCursor = internalMutation({
  args: { historyId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db.query('importSettings').first();
    if (settings) {
      await ctx.db.patch(settings._id, { syncCursor: args.historyId });
    }
  },
});

export const getImportSettingsPublic = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');
    const profile = await ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', identity.subject)).unique();
    if (!profile || profile.role !== 'admin') throw new Error('Forbidden');
    return ctx.db.query('importSettings').first();
  },
});