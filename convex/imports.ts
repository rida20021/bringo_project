import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
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
    const errors: string[] = [];

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const rowNum = args.rowNumbers?.[i] ?? i + 1;

      const commandId = String(row.number || row.command_id || row.id || '').trim();
      const rawRiderName = String(row.shopper_name || row.rider || row.name || '').trim();
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
        // Command IDs are unique across the whole orders table, not per day.
        const existingOrder = await ctx.db
          .query('orders')
          .withIndex('commandId', (q) => q.eq('commandId', commandId))
          .unique();
        if (existingOrder) {
          const sameAmount = existingOrder.amount === amount;
          const sameRider = existingOrder.rawRiderName === rawRiderName;
          const sameMethod = existingOrder.paymentMethod === paymentMethod;
          if (sameAmount && sameRider && sameMethod) {
            validationState = 'duplicate';
            duplicate++;
            linkedOrderId = existingOrder._id;
          } else {
            validationState = 'conflict';
            conflict++;
            rowErrors.push(
              `Conflicts with existing order ${commandId}: amount=${existingOrder.amount / 100}, rider=${existingOrder.rawRiderName}, method=${existingOrder.paymentMethod}`
            );
          }
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
          store: row.store_internal_name ? String(row.store_internal_name) : undefined,
          company: row.company ? String(row.company) : undefined,
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

    return { accepted, rejected, duplicate, conflict };
  },
});

export const getImportBatches = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db
      .query('importBatches')
      .order('desc')
      .take(Math.min(args.limit ?? 50, 200));
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

/** Invalid and conflicting rows for one batch, ordered by original row number. */
export const getImportBatchIssues = query({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query('sourceRows')
      .withIndex('importBatchId', (q) => q.eq('importBatchId', args.batchId))
      .collect();

    return rows
      .filter((row) => row.validationState === 'invalid' || row.validationState === 'conflict')
      .sort((a, b) => a.originalRowNumber - b.originalRowNumber)
      .map((row) => ({
        _id: row._id,
        rowNumber: row.originalRowNumber,
        validationState: row.validationState,
        commandId: sourceCommandId(row.originalData),
        errors: row.errors ?? [],
        warnings: row.warnings ?? [],
      }));
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
