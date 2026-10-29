import { cronJobs } from 'convex/server';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';

export const scheduledGmailSync = internalAction({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.runQuery(internal.settings.getImportSettings);
    if (!settings?.syncCursor) return;

    await ctx.runAction(internal.email.import.syncGmailHistory, { startHistoryId: settings.syncCursor });
  },
});

const crons = cronJobs();

crons.interval('scheduled-gmail-sync', { minutes: 1 }, internal.crons.scheduledGmailSync);

export default crons;
