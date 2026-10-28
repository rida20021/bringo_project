import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { generateId } from 'convex/server';

const PAYMENT_METHOD_MAP: Record<string, 'cash' | 'card' | 'online_payment' | 'unknown'> = {
  cash: 'cash',
  card: 'card',
  online_payment: 'online_payment',
};

function normalizePaymentMethod(raw: string): 'cash' | 'card' | 'online_payment' | 'unknown' {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  return PAYMENT_METHOD_MAP[key] || 'unknown';
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Math.round(value * 100);
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return null;
    return Math.round(parsed * 100);
  }
  return null;
}

function parseDate(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return parsed;
    const parts = value.split(/[-/]/);
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (y > 1000 && m <= 12 && d <= 31) return new Date(y, m - 1, d).getTime();
    }
  }
  return null;
}

export const createImportBatch = mutation({
  args: {
    gmailMessageId: v.string(),
    gmailHistoryId: v.optional(v.string()),
    attachmentName: v.string(),
    attachmentHash: v.string(),
    reportDate: v.number(),
    storageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('importBatches').withIndex('gmailMessageId', (q) => q.eq('gmailMessageId', args.gmailMessageId)).unique();
    if (existing) return { batchId: existing._id, isDuplicate: true };
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

export const processImportBatch = mutation({
  args: { batchId: v.id('importBatches'), rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error('Batch not found');
    if (batch.status !== 'processing') throw new Error('Batch not in processing state');

    let accepted = 0, rejected = 0, duplicate = 0, conflict = 0;
    const errors: string[] = [];

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const rowNum = i + 1;

      const commandId = String(row.number || row.command_id || row.id || '').trim();
      const rawRiderName = String(row.shopper_name || row.rider || row.name || '').trim();
      const rawPaymentMethod = String(row.payment_method || row.method || '').trim();
      const rawAmount = row.Total || row.total || row.amount || row.montant;
      const rawDate = row.delivery_date_end || row.date || row.delivery_date;

      const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
      const amount = parseAmount(rawAmount);
      const deliveryDate = parseDate(rawDate);

      let validationState: 'valid' | 'invalid' | 'duplicate' | 'conflict' = 'valid';
      const rowErrors: string[] = [];
      const warnings: string[] = [];

      if (!commandId) { validationState = 'invalid'; rowErrors.push('Missing command ID'); }
      if (!rawRiderName) { validationState = 'invalid'; rowErrors.push('Missing rider name'); }
      if (paymentMethod === 'unknown') { validationState = 'invalid'; rowErrors.push(`Unknown payment method: ${rawPaymentMethod}`); }
      if (amount === null || amount < 0) { validationState = 'invalid'; rowErrors.push('Invalid amount'); }
      if (!deliveryDate) { validationState = 'invalid'; rowErrors.push('Invalid date'); }

      let linkedOrderId: string | undefined;
      if (validationState === 'valid') {
        const existingOrder = await ctx.db.query('orders').withIndex('commandId', (q) => q.eq('commandId', commandId)).unique();
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
            rowErrors.push(`Conflicts with existing order ${commandId}: amount=${existingOrder.amount/100}, rider=${existingOrder.rawRiderName}, method=${existingOrder.paymentMethod}`);
          }
        }
      }

      if (validationState === 'invalid') rejected++;
      else if (validationState === 'valid') accepted++;

      const riderId = validationState !== 'invalid' ? await ctx.runMutation(internalMutation.riders.getOrCreateRider, { rawName: rawRiderName }) : null;

      const sourceRowId = await ctx.db.insert('sourceRows', {
        importBatchId: args.batchId,
        originalRowNumber: rowNum,
        originalData: row,
        validationState,
        errors: rowErrors.length > 0 ? rowErrors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        linkedOrderId: linkedOrderId as any,
      });

      if (validationState === 'valid' && riderId) {
        const eligibilityStatus = paymentMethod === 'online_payment' ? 'excluded_payment_method' : 'eligible';
        const orderId = await ctx.db.insert('orders', {
          commandId,
          deliveryDate: deliveryDate!,
          riderId,
          rawRiderName,
          paymentMethod,
          amount: amount!,
          store: row.store ? String(row.store) : undefined,
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
    return ctx.db.query('importBatches').order('desc').take(args.limit || 50).collect();
  },
});

export const getImportBatch = query({
  args: { batchId: v.id('importBatches') },
  handler: async (ctx, args) => {
    return ctx.db.get(args.batchId);
  },
});

export const getSourceRows = query({
  args: { batchId: v.id('importBatches'), state: v.optional(v.union(v.literal('valid'), v.literal('invalid'), v.literal('duplicate'), v.literal('conflict'))) },
  handler: async (ctx, args) => {
    let q = ctx.db.query('sourceRows').withIndex('importBatchId', (q) => q.eq('importBatchId', args.batchId));
    if (args.state) q = q.filter((q) => q.eq(q.field('validationState'), args.state));
    return q.collect();
  },
});