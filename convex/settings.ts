import { mutation, query, internalQuery, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdmin } from './lib/auth';

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
    const appUser = await requireAdmin(ctx);

    const existing = await ctx.db.query('importSettings').first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now(), updatedBy: appUser.userId });
      return existing._id;
    }

    return ctx.db.insert('importSettings', {
      ...args,
      updatedAt: Date.now(),
      updatedBy: appUser.userId,
    });
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

export const getGmailToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query('importSettings').first();
    if (!settings?.gmailAccessToken) return null;
    return {
      _id: settings._id,
      accessToken: settings.gmailAccessToken,
      refreshToken: settings.gmailRefreshToken,
      expiresAt: settings.gmailTokenExpiresAt ?? 0,
    };
  },
});

export const updateGmailToken = internalMutation({
  args: {
    id: v.id('importSettings'),
    accessToken: v.string(),
    expiresAt: v.number(),
    refreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      gmailAccessToken: args.accessToken,
      gmailTokenExpiresAt: args.expiresAt,
      ...(args.refreshToken ? { gmailRefreshToken: args.refreshToken } : {}),
    });
  },
});

export const getImportSettingsPublic = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query('importSettings').first();
  },
});
