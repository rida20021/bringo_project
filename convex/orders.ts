import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel, Id } from './_generated/dataModel';
import { requireRider, requireSupervisor } from './lib/auth';
import { startOfDayCasablanca } from './lib/dates';
import { validateReceiptFile } from './receipts';

const livePaymentMethod = v.union(v.literal('cash'), v.literal('tpe'), v.literal('card'));
const receiptKind = v.union(v.literal('tpe'), v.literal('bank_deposit'));

/** 1,000,000.00 MAD — a sanity ceiling far above any real delivery. */
const MAX_LIVE_AMOUNT_CENTIMES = 100_000_000;
const MAX_COMMAND_LENGTH = 60;


export const getOrders = query({
  args: {
    deliveryDate: v.optional(v.number()),
    riderId: v.optional(v.id('riders')),
    paymentMethod: v.optional(v.union(v.literal('cash'), v.literal('card'), v.literal('online_payment'))),
    eligibilityStatus: v.optional(
      v.union(v.literal('eligible'), v.literal('excluded_payment_method'), v.literal('quarantined'))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const limit = Math.min(args.limit ?? 200, 500);

    const applyFilters = (q: FilterBuilder<DataModel['orders']>) => {
      const conditions: Expression<boolean>[] = [];
      if (args.deliveryDate !== undefined) conditions.push(q.eq(q.field('deliveryDate'), args.deliveryDate));
      if (args.riderId !== undefined) conditions.push(q.eq(q.field('riderId'), args.riderId));
      if (args.paymentMethod !== undefined) conditions.push(q.eq(q.field('paymentMethod'), args.paymentMethod));
      if (args.eligibilityStatus !== undefined) conditions.push(q.eq(q.field('eligibilityStatus'), args.eligibilityStatus));
      return conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    return ctx.db.query('orders').filter(applyFilters).order('desc').take(limit);
  },
});

export const getOrderById = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    return ctx.db.get(args.orderId);
  },
});

export const getRiderBalances = query({
  args: { deliveryDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);
    const targetDate = args.deliveryDate;
    const orders = await ctx.db
      .query('orders')
      .filter((q) => {
        const conditions = [
          q.eq(q.field('eligibilityStatus'), 'eligible'),
          q.or(q.eq(q.field('paymentMethod'), 'cash'), q.eq(q.field('paymentMethod'), 'card')),
        ];
        if (targetDate !== undefined) conditions.push(q.eq(q.field('deliveryDate'), targetDate));
        return q.and(...conditions);
      })
      .collect();

    const riderMap = new Map<
      string,
      { riderId: string; rawName: string; cashDue: number; cardDue: number; orders: typeof orders }
    >();

    for (const order of orders) {
      const key = order.riderId;
      if (!riderMap.has(key)) {
        riderMap.set(key, {
          riderId: order.riderId,
          rawName: order.rawRiderName,
          cashDue: 0,
          cardDue: 0,
          orders: [],
        });
      }
      const rider = riderMap.get(key)!;
      rider.orders.push(order);
      if (order.paymentMethod === 'cash') rider.cashDue += order.amount;
      else if (order.paymentMethod === 'card') rider.cardDue += order.amount;
    }

    return Array.from(riderMap.values());
  },
});

/**
 * Rider live entry. Stored in `liveEntries` rather than `orders` so the
 * Excel-import truth stays untouched until the Milestone 4 matching engine.
 */
export const createLiveOrder = mutation({
  args: {
    commandId: v.string(),
    marketId: v.id('markets'),
    amount: v.number(),
    paymentMethod: livePaymentMethod,
    receipt: v.optional(
      v.object({
        kind: receiptKind,
        storageId: v.id('_storage'),
        fileName: v.string(),
        mimeType: v.string(),
        size: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const appUser = await requireRider(ctx);

    const commandId = args.commandId.trim();
    if (!commandId) throw new Error('Command number is required');
    if (commandId.length > MAX_COMMAND_LENGTH) throw new Error('Command number is too long');
    const commandKey = commandId.toLocaleLowerCase('fr');

    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
      throw new Error('Amount must be a positive integer number of centimes');
    }
    if (args.amount > MAX_LIVE_AMOUNT_CENTIMES) {
      throw new Error('Amount exceeds the allowed maximum');
    }

    const market = await ctx.db.get(args.marketId);
    if (!market) throw new Error('Market not found');
    if (!market.isActive) throw new Error('Market is inactive');

    if (args.paymentMethod === 'tpe') {
      if (!args.receipt) throw new Error('A TPE receipt is required for TPE payments');
      if (args.receipt.kind !== 'tpe') throw new Error('TPE payments require a TPE receipt');
    }
    if (args.paymentMethod === 'cash' && args.receipt && args.receipt.kind !== 'bank_deposit') {
      throw new Error('Cash payments can only carry a bank deposit receipt');
    }
    if (args.paymentMethod === 'card' && args.receipt) {
      throw new Error('Card payments do not carry a receipt');
    }

    const entryDate = startOfDayCasablanca(Date.now());
    const duplicate = await ctx.db
      .query('liveEntries')
      .withIndex('riderCommandDate', (q) =>
        q
          .eq('riderUserId', appUser.userId)
          .eq('entryDate', entryDate)
          .eq('commandKey', commandKey)
      )
      .unique();
    if (duplicate) throw new Error('This command has already been entered today');

    const storedFile = args.receipt
      ? await validateReceiptFile(ctx, args.receipt)
      : null;

    const now = Date.now();
    const liveEntryId = await ctx.db.insert('liveEntries', {
      riderUserId: appUser.userId,
      commandId,
      commandKey,
      marketId: market._id,
      marketName: market.name,
      marketExternalId: market.externalId,
      amount: args.amount,
      paymentMethod: args.paymentMethod,
      entryDate,
      createdAt: now,
      updatedAt: now,
    });

    let receiptId: Id<'liveEntryReceipts'> | null = null;
    if (args.receipt && storedFile) {
      receiptId = await ctx.db.insert('liveEntryReceipts', {
        liveEntryId,
        riderUserId: appUser.userId,
        kind: args.receipt.kind,
        storageId: args.receipt.storageId,
        fileName: args.receipt.fileName.trim(),
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        status: 'pending_review',
        createdAt: now,
      });
    }

    return { liveEntryId, receiptId };
  },
});

/** The signed-in rider's entries for one Casablanca day (today by default). */
export const getMyLiveEntries = query({
  args: { entryDate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const appUser = await requireRider(ctx);
    const entryDate = args.entryDate ?? startOfDayCasablanca(Date.now());

    const entries = await ctx.db
      .query('liveEntries')
      .withIndex('riderEntryDate', (q) =>
        q.eq('riderUserId', appUser.userId).eq('entryDate', entryDate)
      )
      .collect();

    const withReceipts = await Promise.all(
      entries.map(async (entry) => {
        const receipts = await ctx.db
          .query('liveEntryReceipts')
          .withIndex('liveEntryId', (q) => q.eq('liveEntryId', entry._id))
          .collect();

        return {
          ...entry,
          receipts: await Promise.all(
            receipts.map(async (receipt) => ({
              _id: receipt._id,
              kind: receipt.kind,
              status: receipt.status,
              fileName: receipt.fileName,
              createdAt: receipt.createdAt,
              rejectionReason: receipt.rejectionReason,
              url: await ctx.storage.getUrl(receipt.storageId),
            }))
          ),
        };
      })
    );

    return withReceipts.sort((a, b) => b.createdAt - a.createdAt);
  },
});

