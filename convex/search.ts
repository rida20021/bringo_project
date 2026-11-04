import { query } from './_generated/server';
import { v } from 'convex/values';
import { requireAdmin } from './lib/auth';

/**
 * Normalize a command ID for search: trim whitespace, remove leading '#'.
 */
function normalizeCommandSearch(input: string): string {
  let normalized = input.trim();
  if (normalized.startsWith('#')) {
    normalized = normalized.slice(1);
  }
  return normalized.toLowerCase();
}

export const globalCommandSearch = query({
  args: {
    commandId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const commandId = normalizeCommandSearch(args.commandId);
    if (!commandId) {
      return null;
    }

    // Query live entries by commandKey using a filter (no index available)
    const liveEntries = await ctx.db.query('liveEntries').collect();
    const liveEntry = liveEntries.find((e) => e.commandKey === commandId);

    // Query Excel orders by commandId
    const excelOrders = await ctx.db
      .query('orders')
      .withIndex('commandId', (q) => q.eq('commandId', commandId))
      .collect();

    // Fetch receipts for the live entry if it exists
    let receipts: Array<{
      _id: string;
      status: string;
      kind: 'tpe' | 'bank_deposit';
      createdAt: number;
    }> = [];

    if (liveEntry) {
      const receiptDocs = await ctx.db
        .query('liveEntryReceipts')
        .withIndex('liveEntryId', (q) => q.eq('liveEntryId', liveEntry._id))
        .collect();

      receipts = receiptDocs.map((r) => ({
        _id: r._id,
        status: r.status,
        kind: r.kind,
        createdAt: r._creationTime,
      }));
    }

    // Get rider name if we have a live entry
    let riderName: string | null = null;
    if (liveEntry) {
      const profile = await ctx.db
        .query('userProfiles')
        .withIndex('userId', (q) => q.eq('userId', liveEntry.riderUserId))
        .unique();
      riderName = profile?.displayName ?? null;
    } else if (excelOrders.length > 0) {
      // Fallback to Excel rider name
      riderName = excelOrders[0].rawRiderName;
    }

    return {
      commandId,
      riderName,
      liveEntry: liveEntry
        ? {
            _id: liveEntry._id,
            amount: liveEntry.amount,
            paymentMethod: liveEntry.paymentMethod,
            entryDate: liveEntry.entryDate,
            createdAt: liveEntry._creationTime,
          }
        : null,
      receipts,
      excelOrders: excelOrders.map((o) => ({
        _id: o._id,
        amount: o.amount,
        paymentMethod: o.paymentMethod,
        deliveryDate: o.deliveryDate,
        rawRiderName: o.rawRiderName,
      })),
    };
  },
});
