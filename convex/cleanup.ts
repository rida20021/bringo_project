import { internalMutation } from "./_generated/server";

export const nukeEverything = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tablesToWipe = [
      "orders", 
      "liveEntries", 
      "cashCollections", 
      "bankDeposits", 
      "discrepancies", 
      "liveEntryReceipts", 
      "importBatches", 
      "sourceRows",
      "tpeReceipts",
      "riders",    
      "markets"    
    ] as const;

    let deletedCount = 0;
    const report: Record<string, number> = {};

    for (const table of tablesToWipe) {
      const records = await ctx.db.query(table).collect();
      report[table] = records.length;
      for (const record of records) {
        await ctx.db.delete(record._id);
        deletedCount++;
      }
    }

    return { message: `Deleted ${deletedCount} records.`, report };
  },
});