import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin, requireSupervisor } from './lib/auth';
import { startOfDayCasablanca } from './lib/dates';
import { normalizeCommandKey } from './lib/tiktakValues';

const MAX_LIST_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 100;
const MAX_RESOLUTION_NOTE_LENGTH = 500;

type DiscrepancyReason = 'missing_in_excel' | 'amount_mismatch';
type DiscrepancyStatus = 'open' | 'resolved';

interface MatchingArgs {
  reportDate: number;
  importBatchId?: Id<'importBatches'>;
}

/**
 * Compare the rider live entries of a Casablanca business day against the
 * imported Excel truth. Discrepancies are upserted so re-running a match (or
 * importing the same file twice) never creates duplicates.
 */
async function matchLiveEntries(ctx: MutationCtx, args: MatchingArgs) {
  const day = startOfDayCasablanca(args.reportDate);

  const entries = await ctx.db
    .query('liveEntries')
    .withIndex('entryDate', (q) => q.eq('entryDate', day))
    .collect();

  const orders = await ctx.db
    .query('orders')
    .withIndex('deliveryDate', (q) => q.eq('deliveryDate', day))
    .collect();

  const ordersByKey = new Map<string, Doc<'orders'>>();
  for (const order of orders) {
    ordersByKey.set(normalizeCommandKey(order.commandId), order);
  }

  const riderNames = new Map<Id<'users'>, string>();
  async function resolveRiderName(userId: Id<'users'>): Promise<string> {
    const cached = riderNames.get(userId);
    if (cached !== undefined) return cached;

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .unique();

    let name = profile?.displayName.trim();
    if (!name) {
      const user = await ctx.db.get(userId);
      name = user?.name?.trim() || user?.email?.trim();
    }

    const resolved = name || 'Livreur';
    riderNames.set(userId, resolved);
    return resolved;
  }

  let matched = 0;
  let missingInExcel = 0;
  let amountMismatch = 0;
  let discrepanciesCreated = 0;
  let discrepanciesUpdated = 0;

  for (const entry of entries) {
    const commandKey = normalizeCommandKey(entry.commandId);
    const order = ordersByKey.get(commandKey);

    if (order && order.amount === entry.amount) {
      matched++;
      continue;
    }

    const reason: DiscrepancyReason = order ? 'amount_mismatch' : 'missing_in_excel';
    if (reason === 'missing_in_excel') missingInExcel++;
    else amountMismatch++;

    const riderName = await resolveRiderName(entry.riderUserId);
    const now = Date.now();

    const existing = await ctx.db
      .query('discrepancies')
      .withIndex('liveEntryReason', (q) =>
        q.eq('liveEntryId', entry._id).eq('reason', reason)
      )
      .unique();

    if (existing) {
      // Resolved discrepancies stay resolved: a later import must not reopen
      // something an admin already arbitrated.
      if (existing.status === 'resolved') continue;

      await ctx.db.patch(existing._id, {
        commandId: entry.commandId,
        commandKey,
        entryDate: day,
        riderUserId: entry.riderUserId,
        riderName,
        riderAmount: entry.amount,
        excelAmount: order?.amount,
        orderId: order?._id,
        importBatchId: args.importBatchId,
        updatedAt: now,
      });
      discrepanciesUpdated++;
      continue;
    }

    await ctx.db.insert('discrepancies', {
      reason,
      commandId: entry.commandId,
      commandKey,
      entryDate: day,
      riderUserId: entry.riderUserId,
      riderName,
      liveEntryId: entry._id,
      orderId: order?._id,
      importBatchId: args.importBatchId,
      riderAmount: entry.amount,
      excelAmount: order?.amount,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    discrepanciesCreated++;
  }

  return { matched, missingInExcel, amountMismatch, discrepanciesCreated, discrepanciesUpdated };
}

/** Called right after an Excel batch is ingested. Internal: no auth check. */
export const runMatchingForBatch = internalMutation({
  args: { batchId: v.id('importBatches'), reportDate: v.number() },
  handler: async (ctx, args) => {
    return matchLiveEntries(ctx, {
      reportDate: args.reportDate,
      importBatchId: args.batchId,
    });
  },
});

/** Manual re-run from the admin dashboard. */
export const runMatchingForDate = mutation({
  args: { reportDate: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!Number.isFinite(args.reportDate)) throw new Error('Date invalide');
    return matchLiveEntries(ctx, { reportDate: args.reportDate });
  },
});

export const getDiscrepancies = query({
  args: {
    status: v.optional(v.union(v.literal('open'), v.literal('resolved'))),
    reportDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);

    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? DEFAULT_LIST_LIMIT), 1),
      MAX_LIST_LIMIT
    );
    const day = args.reportDate !== undefined ? startOfDayCasablanca(args.reportDate) : null;
    const status: DiscrepancyStatus | undefined = args.status;

    if (day !== null) {
      const rows = await ctx.db
        .query('discrepancies')
        .withIndex('entryDate', (q) => q.eq('entryDate', day))
        .order('desc')
        .collect();
      const filtered = status ? rows.filter((row) => row.status === status) : rows;
      return filtered.slice(0, limit);
    }

    if (status) {
      return ctx.db
        .query('discrepancies')
        .withIndex('status', (q) => q.eq('status', status))
        .order('desc')
        .take(limit);
    }

    return ctx.db.query('discrepancies').order('desc').take(limit);
  },
});

export const getDiscrepancyStats = query({
  args: { reportDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);

    const reportDate = args.reportDate;
    const docs =
      reportDate !== undefined
        ? await ctx.db
            .query('discrepancies')
            .withIndex('entryDate', (q) =>
              q.eq('entryDate', startOfDayCasablanca(reportDate))
            )
            .collect()
        : await ctx.db.query('discrepancies').collect();

    let open = 0;
    let resolved = 0;
    let missingInExcel = 0;
    let amountMismatch = 0;

    for (const doc of docs) {
      if (doc.status === 'resolved') {
        resolved++;
        continue;
      }
      open++;
      // Reason breakdown is expressed over open discrepancies so the numbers
      // reconcile with the `open` counter shown in the dashboard.
      if (doc.reason === 'missing_in_excel') missingInExcel++;
      else amountMismatch++;
    }

    return { open, resolved, missingInExcel, amountMismatch };
  },
});

export const resolveDiscrepancy = mutation({
  args: { discrepancyId: v.id('discrepancies'), note: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const note = args.note.trim();
    if (!note) throw new Error('Une note de résolution est requise');
    if (note.length > MAX_RESOLUTION_NOTE_LENGTH) {
      throw new Error(
        `La note de résolution ne doit pas dépasser ${MAX_RESOLUTION_NOTE_LENGTH} caractères`
      );
    }

    const discrepancy = await ctx.db.get(args.discrepancyId);
    if (!discrepancy) throw new Error('Écart introuvable');
    if (discrepancy.status === 'resolved') return discrepancy;

    const now = Date.now();
    await ctx.db.patch(discrepancy._id, {
      status: 'resolved',
      resolvedBy: admin.userId,
      resolvedAt: now,
      resolutionNote: note,
      updatedAt: now,
    });

    return ctx.db.get(discrepancy._id);
  },
});
