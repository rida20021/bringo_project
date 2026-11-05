import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin, requireSupervisor } from './lib/auth';
import { parseAmountToCentimes, parseTikTakDate } from './lib/tiktakValues';
import { insertAuditEvent } from './audit';

const PAYMENT_METHOD_MAP: Record<string, 'cash' | 'card' | 'online_payment' | 'unknown'> = {
  cash: 'cash',
  card: 'card',
  online_payment: 'online_payment',
};

function normalizePaymentMethod(raw: string): 'cash' | 'card' | 'online_payment' | 'unknown' {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  return PAYMENT_METHOD_MAP[key] || 'unknown';
}

function normalizeStoreName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const name = String(value).trim();
  return name.length > 0 ? name : null;
}

function normalizeStoreExternalId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // Excel numeric cells (e.g. 63) and strings ("63") must share one key.
  const externalId = String(value).trim();
  return externalId.length > 0 ? externalId : null;
}

/**
 * Resolve the market for an imported row, creating it on first sight.
 *
 * `cache` is scoped to a single batch so a report with hundreds of rows only
 * pays one index lookup per distinct store. A market is only provisioned when
 * both the name and external ID are usable; `city` stays empty for the admin
 * to fill in later.
 */
async function resolveMarketId(
  ctx: MutationCtx,
  cache: Map<string, Id<'markets'>>,
  rawName: unknown,
  rawExternalId: unknown,
  now: number
): Promise<{ marketId: Id<'markets'>; created: boolean } | null> {
  const name = normalizeStoreName(rawName);
  const externalId = normalizeStoreExternalId(rawExternalId);
  if (!name || !externalId) return null;

  const cached = cache.get(externalId);
  if (cached) return { marketId: cached, created: false };

  // `.first()` keeps the import resilient if legacy duplicate external IDs exist.
  const existing = await ctx.db
    .query('markets')
    .withIndex('externalId', (q) => q.eq('externalId', externalId))
    .first();
  if (existing) {
    cache.set(externalId, existing._id);
    return { marketId: existing._id, created: false };
  }

  const marketId = await ctx.db.insert('markets', {
    name,
    externalId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  cache.set(externalId, marketId);
  return { marketId, created: true };
}

export const getImportBatchByHash = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query('importBatches')
      .withIndex('attachmentHash', (q) => q.eq('attachmentHash', args.hash))
      .first();
  },
});

/** Admin/Supervisor upload URL shared by the Excel import flow and
 * bank-deposit receipt uploads on the supervisor dashboard. */
export const generateAdminUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSupervisor(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/** Compact summary returned when an upload is recognised as a duplicate file. */
export const getImportBatchSummary = internalQuery({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error('Batch not found');
    return {
      status: batch.status,
      reportDate: batch.reportDate,
      totalRows: batch.totalRows,
      acceptedRows: batch.acceptedRows,
      rejectedRows: batch.rejectedRows,
      duplicateRows: batch.duplicateRows,
      conflictRows: batch.conflictRows,
      completedAt: batch.completedAt ?? null,
      errorSummary: batch.errorSummary ?? null,
    };
  },
});

export const createImportBatch = internalMutation({
  args: {
    gmailMessageId: v.string(),
    gmailHistoryId: v.optional(v.string()),
    attachmentName: v.string(),
    attachmentHash: v.string(),
    reportDate: v.number(),
    storageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const existingByMessage = await ctx.db
      .query('importBatches')
      .withIndex('gmailMessageId', (q) => q.eq('gmailMessageId', args.gmailMessageId))
      .unique();
    if (existingByMessage) return { batchId: existingByMessage._id, isDuplicate: true };

    // The same file can arrive through another channel (manual upload vs
    // Gmail), so the content hash is the authoritative duplicate signal.
    const existingByHash = await ctx.db
      .query('importBatches')
      .withIndex('attachmentHash', (q) => q.eq('attachmentHash', args.attachmentHash))
      .first();
    if (existingByHash) return { batchId: existingByHash._id, isDuplicate: true };

    const batchId = await ctx.db.insert('importBatches', {
      ...args,
      receivedAt: Date.now(),
      startedAt: Date.now(),
      status: 'processing',
      totalRows: 0,
      acceptedRows: 0,
      rejectedRows: 0,
      duplicateRows: 0,
      conflictRows: 0,
    });
    return { batchId, isDuplicate: false };
  },
});

export const processImportBatch = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    rows: v.array(v.any()),
    /** Original Excel row numbers, parallel to `rows`. Optional for Gmail imports. */
    rowNumbers: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error('Batch not found');
    if (batch.status !== 'processing') throw new Error('Batch not in processing state');

    if (args.rowNumbers && args.rowNumbers.length !== args.rows.length) {
      throw new Error(
        `rowNumbers length (${args.rowNumbers.length}) does not match rows length (${args.rows.length})`
      );
    }

    let accepted = 0;
    let rejected = 0;
    let duplicate = 0;
    let conflict = 0;
    let marketsCreated = 0;
    const errors: string[] = [];
    // One lookup per distinct store for the whole batch; discarded afterwards.
    const marketCache = new Map<string, Id<'markets'>>();

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const rowNum = args.rowNumbers?.[i] ?? i + 1;

      const commandId = String(row.number || row.command_id || row.id || '').trim();
      const rawRiderName = String(row.shopper_name || row.rider || row.name || '').trim();
      const rawStoreName = row.store_internal_name;
      const rawPaymentMethod = String(row.payment_method || row.method || '').trim();
      const rawAmount = row.Total || row.total || row.amount || row.montant;
      const rawDate = row.delivery_date_end || row.date || row.delivery_date;

      const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
      const amount = parseAmountToCentimes(rawAmount);
      const deliveryDate = parseTikTakDate(rawDate);

      let validationState: 'valid' | 'invalid' | 'duplicate' | 'conflict' = 'valid';
      const rowErrors: string[] = [];
      const warnings: string[] = [];

      if (!commandId) {
        validationState = 'invalid';
        rowErrors.push('Missing command ID');
      }
      if (!rawRiderName) {
        validationState = 'invalid';
        rowErrors.push('Missing rider name');
      }
      if (paymentMethod === 'unknown') {
        validationState = 'invalid';
        rowErrors.push(`Unknown payment method: ${rawPaymentMethod}`);
      }
      if (amount === null || amount < 0) {
        validationState = 'invalid';
        rowErrors.push('Invalid amount');
      }
      if (deliveryDate === null) {
        validationState = 'invalid';
        rowErrors.push('Invalid date');
      }

      let linkedOrderId: Id<'orders'> | undefined;
      if (validationState === 'valid') {
        // A command can legitimately produce several orders: a split payment
        // stores one leg per payment method (e.g. 100 MAD cash + 50 MAD card).
        // Collect every leg for the command instead of asserting uniqueness.
        const existingOrders = await ctx.db
          .query('orders')
          .withIndex('commandId', (q) => q.eq('commandId', commandId))
          .collect();

        const sameMethodOrder = existingOrders.find(
          (order) => order.paymentMethod === paymentMethod
        );

        if (!sameMethodOrder) {
          // No leg for this payment method yet: this row is a split-payment
          // leg and is inserted as a new order. A different rider is a data
          // smell worth surfacing, but never blocks the import.
          for (const existingOrder of existingOrders) {
            const splitWarning = `Cmd #${commandId} : paiement partagé (${existingOrder.paymentMethod} / ${paymentMethod})`;
            if (!warnings.includes(splitWarning)) warnings.push(splitWarning);

            // The first leg was inserted before the importer could know this
            // command was split. Tag its source row now so both Excel rows are
            // visible as split payments in the import details.
            const existingSourceRow = await ctx.db.get(existingOrder.sourceRowId);
            if (existingSourceRow) {
              const existingWarnings = existingSourceRow.warnings ?? [];
              if (!existingWarnings.includes(splitWarning)) {
                await ctx.db.patch(existingSourceRow._id, {
                  warnings: [...existingWarnings, splitWarning],
                });
              }
            }
          }
          const otherRiderLeg = existingOrders.find(
            (order) => order.rawRiderName !== rawRiderName
          );
          if (otherRiderLeg) {
            warnings.push(
              `Split payment rider differs from order ${commandId}: rider=${otherRiderLeg.rawRiderName}`
            );
          }
        } else if (
          sameMethodOrder.amount === amount &&
          sameMethodOrder.rawRiderName === rawRiderName
        ) {
          validationState = 'duplicate';
          duplicate++;
          linkedOrderId = sameMethodOrder._id;
        } else {
          validationState = 'conflict';
          conflict++;
          rowErrors.push(
            `Conflicts with existing order ${commandId}: amount=${sameMethodOrder.amount / 100}, rider=${sameMethodOrder.rawRiderName}, method=${sameMethodOrder.paymentMethod}`
          );
        }
      }

      if (validationState === 'invalid') rejected++;
      else if (validationState === 'valid') accepted++;

      let riderId = null;
      if (validationState !== 'invalid') {
        const existingRider = await ctx.db
          .query('riders')
          .withIndex('canonicalName', (q) => q.eq('canonicalName', rawRiderName))
          .unique();
        if (existingRider) {
          riderId = existingRider._id;
        } else {
          riderId = await ctx.db.insert('riders', {
            canonicalName: rawRiderName,
            aliases: [rawRiderName],
            isActive: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }

      // Auto-provision the market catalog from the report. This runs even for
      // rows that fail validation: the store is real reference data.
      const resolvedMarket = await resolveMarketId(
        ctx,
        marketCache,
        rawStoreName,
        row.store_external_id,
        Date.now()
      );
      if (resolvedMarket?.created) marketsCreated++;
      const marketId = resolvedMarket?.marketId;

      const sourceRowId = await ctx.db.insert('sourceRows', {
        importBatchId: args.batchId,
        originalRowNumber: rowNum,
        originalData: row,
        validationState,
        errors: rowErrors.length > 0 ? rowErrors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        linkedOrderId,
      });

      if (
        validationState === 'valid' &&
        riderId &&
        paymentMethod !== 'unknown' &&
        deliveryDate !== null &&
        amount !== null
      ) {
        const eligibilityStatus =
          paymentMethod === 'online_payment' ? 'excluded_payment_method' : 'eligible';
        const orderId = await ctx.db.insert('orders', {
          commandId,
          deliveryDate,
          riderId,
          rawRiderName,
          paymentMethod,
          amount,
          store: normalizeStoreName(rawStoreName) ?? undefined,
          company: row.company ? String(row.company) : undefined,
          marketId,
          shippingInfo: row,
          sourceRowId,
          importBatchId: args.batchId,
          eligibilityStatus,
          createdAt: Date.now(),
        });
        await ctx.db.patch(sourceRowId, { linkedOrderId: orderId });
      }

      if (rowErrors.length > 0) errors.push(`Row ${rowNum}: ${rowErrors.join('; ')}`);
    }

    await ctx.db.patch(args.batchId, {
      status: conflict > 0 ? 'needs_review' : 'completed',
      completedAt: Date.now(),
      totalRows: args.rows.length,
      acceptedRows: accepted,
      rejectedRows: rejected,
      duplicateRows: duplicate,
      conflictRows: conflict,
      errorSummary: errors.length > 0 ? errors.join('\n') : undefined,
    });

    return { accepted, rejected, duplicate, conflict, marketsCreated };
  },
});

// Return type for import batches with calculated totals breakdown
type ImportBatchWithTotal = Doc<'importBatches'> & {
  breakdown: {
    totalAmount: number;
    cashAmount: number;
    cardAmount: number;
    onlineAmount: number;
  };
};

export const getImportBatches = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.id('importBatches'),
    _creationTime: v.number(),
    gmailMessageId: v.string(),
    gmailHistoryId: v.optional(v.string()),
    attachmentName: v.string(),
    attachmentHash: v.string(),
    reportDate: v.number(),
    receivedAt: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(v.literal('pending'), v.literal('processing'), v.literal('completed'), v.literal('failed'), v.literal('needs_review')),
    totalRows: v.number(),
    acceptedRows: v.number(),
    rejectedRows: v.number(),
    duplicateRows: v.number(),
    conflictRows: v.number(),
    errorSummary: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    createdBy: v.optional(v.id('users')),
    breakdown: v.object({
      totalAmount: v.number(),
      cashAmount: v.number(),
      cardAmount: v.number(),
      onlineAmount: v.number(),
    }),
  })),
  handler: async (ctx, args): Promise<ImportBatchWithTotal[]> => {
    await requireAdmin(ctx);
    const batches = await ctx.db
      .query('importBatches')
      .order('desc')
      .take(Math.min(args.limit ?? 50, 200));

    // Calculate totals breakdown per batch
    const batchIds = batches.map((b) => b._id);
    const breakdownMap = new Map<Id<'importBatches'>, {
      totalAmount: number;
      cashAmount: number;
      cardAmount: number;
      onlineAmount: number;
    }>();

    // Initialize all batches
    for (const batchId of batchIds) {
      breakdownMap.set(batchId, {
        totalAmount: 0,
        cashAmount: 0,
        cardAmount: 0,
        onlineAmount: 0,
      });
    }

    // Sum amounts by payment method for each batch
    const orders = await ctx.db.query('orders').collect();
    for (const order of orders) {
      if (breakdownMap.has(order.importBatchId)) {
        const current = breakdownMap.get(order.importBatchId)!;
        current.totalAmount += order.amount;
        
        if (order.paymentMethod === 'cash') {
          current.cashAmount += order.amount;
        } else if (order.paymentMethod === 'card') {
          current.cardAmount += order.amount;
        } else if (order.paymentMethod === 'online_payment') {
          current.onlineAmount += order.amount;
        }
      }
    }

    // Add breakdown to each batch
    const batchesWithTotals: ImportBatchWithTotal[] = batches.map((batch) => ({
      ...batch,
      breakdown: breakdownMap.get(batch._id) ?? {
        totalAmount: 0,
        cashAmount: 0,
        cardAmount: 0,
        onlineAmount: 0,
      },
    }));

    return batchesWithTotals;
  },
});

export const getImportBatch = query({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.get(args.batchId);
  },
});

export const getSourceRows = query({
  args: {
    batchId: v.id('importBatches'),
    state: v.optional(
      v.union(v.literal('valid'), v.literal('invalid'), v.literal('duplicate'), v.literal('conflict'))
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query('sourceRows')
      .withIndex('importBatchId', (q) => q.eq('importBatchId', args.batchId))
      .collect();
    return args.state ? rows.filter((row) => row.validationState === args.state) : rows;
  },
});

/** Signed URL for the original uploaded report, or null when it was not stored. */
export const getImportFileUrl = query({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const batch = await ctx.db.get(args.batchId);
    if (!batch || !batch.storageId) return null;
    return ctx.storage.getUrl(batch.storageId);
  },
});

function sourceCommandId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const raw = record.number ?? record.command_id ?? record.id;
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  return value.length > 0 ? value : null;
}

/** Invalid, conflicting, and warning-bearing rows ordered by original row number. */
export const getImportBatchIssues = query({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query('sourceRows')
      .withIndex('importBatchId', (q) => q.eq('importBatchId', args.batchId))
      .collect();

    return rows
      .map((row) => ({
        _id: row._id,
        rowNumber: row.originalRowNumber,
        validationState: row.validationState,
        commandId: sourceCommandId(row.originalData),
        errors: row.errors ?? [],
        warnings: row.warnings ?? [],
      }))
      .filter((row) => row.errors.length > 0 || row.warnings.length > 0)
      .sort((a, b) => a.rowNumber - b.rowNumber);
  },
});

/**
 * Delete an import batch and everything derived from it: source rows, orders,
 * their collection/TPE allocations, and linked discrepancies. Orders that only
 * collide with this batch (duplicates from an earlier import) are preserved.
 */
export const deleteImportBatch = mutation({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error('Import batch not found');

    const sourceRows = await ctx.db
      .query('sourceRows')
      .withIndex('importBatchId', (q) => q.eq('importBatchId', args.batchId))
      .collect();
    const orders = await ctx.db
      .query('orders')
      .withIndex('importBatchId', (q) => q.eq('importBatchId', args.batchId))
      .collect();
    const orderIds = new Set(orders.map((order) => order._id));

    let allocationsDeleted = 0;
    for (const order of orders) {
      const cashAllocations = await ctx.db
        .query('cashCollectionAllocations')
        .withIndex('orderId', (q) => q.eq('orderId', order._id))
        .collect();
      for (const allocation of cashAllocations) {
        await ctx.db.delete(allocation._id);
        allocationsDeleted += 1;
      }

      const tpeAllocations = await ctx.db
        .query('tpeReceiptAllocations')
        .withIndex('orderId', (q) => q.eq('orderId', order._id))
        .collect();
      for (const allocation of tpeAllocations) {
        await ctx.db.delete(allocation._id);
        allocationsDeleted += 1;
      }
    }

    const discrepancies = await ctx.db.query('discrepancies').collect();
    const linkedDiscrepancies = discrepancies.filter(
      (discrepancy) =>
        discrepancy.importBatchId === args.batchId ||
        (discrepancy.orderId !== undefined && orderIds.has(discrepancy.orderId))
    );
    for (const discrepancy of linkedDiscrepancies) {
      await ctx.db.delete(discrepancy._id);
    }

    for (const order of orders) {
      await ctx.db.delete(order._id);
    }
    for (const row of sourceRows) {
      await ctx.db.delete(row._id);
    }

    const storageId = batch.storageId;
    if (storageId) {
      await ctx.storage.delete(storageId);
    }

    await ctx.db.delete(args.batchId);

    await insertAuditEvent(ctx, {
      actorId: admin.userId,
      action: 'import_batch.delete',
      targetType: 'importBatch',
      targetId: args.batchId,
      beforeSummary: {
        attachmentName: batch.attachmentName,
        reportDate: batch.reportDate,
        status: batch.status,
        totalRows: batch.totalRows,
        acceptedRows: batch.acceptedRows,
        rejectedRows: batch.rejectedRows,
        duplicateRows: batch.duplicateRows,
        conflictRows: batch.conflictRows,
      },
      afterSummary: {
        deletedOrders: orders.length,
        deletedSourceRows: sourceRows.length,
        deletedDiscrepancies: linkedDiscrepancies.length,
        deletedAllocations: allocationsDeleted,
        deletedStorageFile: storageId !== undefined,
      },
    });

    return {
      deletedOrders: orders.length,
      deletedSourceRows: sourceRows.length,
      deletedDiscrepancies: linkedDiscrepancies.length,
      deletedAllocations: allocationsDeleted,
    };
  },
});
