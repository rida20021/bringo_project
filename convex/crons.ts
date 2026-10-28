import { cronJobs } from 'convex/server';
import { internalAction } from './_generated/server';

export const scheduledGmailSync = internalAction({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.runQuery(internalQuery.settings.getImportSettings);
    if (!settings?.syncCursor) return;

    await ctx.runAction(internalAction.email.import.syncGmailHistory, { startHistoryId: settings.syncCursor });
  },
});

cronJobs.everyMinute('scheduled-gmail-sync', scheduledGmailSync);