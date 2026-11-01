import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { requireAdmin, requireAppUser, requireRider, requireSupervisor } from './lib/auth';
import { insertAuditEvent } from './audit';

export const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;

const MAX_REJECTION_REASON_LENGTH = 500;
const DEFAULT_PENDING_LIMIT = 50;
const MAX_PENDING_LIMIT = 100;

export interface ReceiptUploadInput {
  storageId: Id<'_storage'>;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * Validate an uploaded file against Convex storage metadata. The client-provided
 * size/mime are only fallbacks: the stored metadata wins when present.
 */
export async function validateReceiptFile(
  ctx: MutationCtx,
  input: ReceiptUploadInput
): Promise<{ size: number; mimeType: string }> {
  if (!input.fileName.trim()) throw new Error('Receipt file name is required');
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new Error('Receipt file size is invalid');
  }
  if (input.size > MAX_RECEIPT_SIZE_BYTES) {
    throw new Error('Receipt file is larger than 10 MB');
  }

  const stored = await ctx.db.system.get('_storage', input.storageId);
  if (!stored) throw new Error('Receipt file not found');

  const size = stored.size;
  const mimeType = stored.contentType ?? input.mimeType;

  if (!Number.isFinite(size) || size <= 0) throw new Error('Receipt file size is invalid');
  if (size > MAX_RECEIPT_SIZE_BYTES) throw new Error('Receipt file is larger than 10 MB');
  if (!(ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error('Unsupported receipt file type');
  }

  return { size, mimeType };
}

/** Upload URLs are handed out only to authenticated, active riders. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRider(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Attach a receipt to an existing live entry — used for cash deposit receipts
 * uploaded later, and as a fallback if the initial upload was skipped.
 */
export const uploadReceipt = mutation({
  args: {
    liveEntryId: v.id('liveEntries'),
    kind: v.union(v.literal('tpe'), v.literal('bank_deposit')),
    storageId: v.id('_storage'),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const appUser = await requireRider(ctx);

    const entry = await ctx.db.get(args.liveEntryId);
    if (!entry || entry.riderUserId !== appUser.userId) {
      throw new Error('Live entry not found');
    }

    if (entry.paymentMethod === 'card') {
      throw new Error('Card payments do not carry a receipt');
    }
    if (entry.paymentMethod === 'tpe' && args.kind !== 'tpe') {
      throw new Error('TPE payments require a TPE receipt');
    }
    if (entry.paymentMethod === 'cash' && args.kind !== 'bank_deposit') {
      throw new Error('Cash payments can only carry a bank deposit receipt');
    }

    if (args.kind === 'tpe') {
      const existing = await ctx.db
        .query('liveEntryReceipts')
        .withIndex('liveEntryId', (q) => q.eq('liveEntryId', args.liveEntryId))
        .filter((q) => q.eq(q.field('kind'), 'tpe'))
        .first();
      if (existing) throw new Error('A TPE receipt is already attached to this entry');
    }

    const storedFile = await validateReceiptFile(ctx, args);

    return ctx.db.insert('liveEntryReceipts', {
      liveEntryId: args.liveEntryId,
      riderUserId: appUser.userId,
      kind: args.kind,
      storageId: args.storageId,
      fileName: args.fileName.trim(),
      mimeType: storedFile.mimeType,
      size: storedFile.size,
      status: 'pending_review',
      createdAt: Date.now(),
    });
  },
});

/** Owner, supervisor, or admin may open a receipt. */
export const getReceiptUrl = query({
  args: { receiptId: v.id('liveEntryReceipts') },
  handler: async (ctx, args) => {
    const appUser = await requireAppUser(ctx);

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new Error('Receipt not found');

    const isOwner = receipt.riderUserId === appUser.userId;
    const canReview = appUser.role === 'supervisor' || appUser.role === 'admin';
    if (!isOwner && !canReview) throw new Error('Forbidden: insufficient role');

    return ctx.storage.getUrl(receipt.storageId);
  },
});

/**
 * Review queue. Supervisors and admins may read it; only admins may act on it.
 * Newest submissions first.
 */
export const listPendingReceipts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);

    const requestedLimit = args.limit ?? DEFAULT_PENDING_LIMIT;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_PENDING_LIMIT)
      : DEFAULT_PENDING_LIMIT;

    const receipts = await ctx.db
      .query('liveEntryReceipts')
      .withIndex('status', (q) => q.eq('status', 'pending_review'))
      .order('desc')
      .take(limit);

    const rows = await Promise.all(
      receipts.map(async (receipt) => {
        const entry = await ctx.db.get(receipt.liveEntryId);
        if (!entry) return null;

        const user = await ctx.db.get(receipt.riderUserId);
        const profile = await ctx.db
          .query('userProfiles')
          .withIndex('userId', (q) => q.eq('userId', receipt.riderUserId))
          .unique();

        return {
          receiptId: receipt._id,
          kind: receipt.kind,
          fileName: receipt.fileName,
          mimeType: receipt.mimeType,
          size: receipt.size,
          createdAt: receipt.createdAt,
          url: await ctx.storage.getUrl(receipt.storageId),
          entry: {
            liveEntryId: entry._id,
            commandId: entry.commandId,
            marketName: entry.marketName,
            amount: entry.amount,
            paymentMethod: entry.paymentMethod,
            entryDate: entry.entryDate,
          },
          rider: {
            userId: receipt.riderUserId,
            displayName: profile?.displayName ?? user?.name ?? user?.email ?? 'Livreur',
            email: user?.email ?? null,
          },
        };
      })
    );

    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

async function loadPendingReceipt(
  ctx: MutationCtx,
  receiptId: Id<'liveEntryReceipts'>
): Promise<Id<'liveEntryReceipts'>> {
  const receipt = await ctx.db.get(receiptId);
  if (!receipt) throw new Error('Receipt not found');
  if (receipt.status !== 'pending_review') {
    throw new Error('This receipt has already been reviewed');
  }
  return receipt._id;
}

/** Approve evidence only: no deposit or cash total is created here. */
export const approveReceipt = mutation({
  args: { receiptId: v.id('liveEntryReceipts') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const receiptId = await loadPendingReceipt(ctx, args.receiptId);

    await ctx.db.patch(receiptId, {
      status: 'approved',
      reviewedBy: admin.userId,
      reviewedAt: Date.now(),
      rejectionReason: undefined,
    });

    await insertAuditEvent(ctx, {
      actorId: admin.userId,
      action: 'receipt.approved',
      targetType: 'liveEntryReceipts',
      targetId: receiptId,
      afterSummary: { status: 'approved' },
    });

    return receiptId;
  },
});

export const rejectReceipt = mutation({
  args: {
    receiptId: v.id('liveEntryReceipts'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const reason = args.reason.trim();
    if (!reason) throw new Error('A rejection reason is required');
    if (reason.length > MAX_REJECTION_REASON_LENGTH) {
      throw new Error(
        `Rejection reason must be ${MAX_REJECTION_REASON_LENGTH} characters or fewer`
      );
    }

    const receiptId = await loadPendingReceipt(ctx, args.receiptId);

    await ctx.db.patch(receiptId, {
      status: 'rejected',
      reviewedBy: admin.userId,
      reviewedAt: Date.now(),
      rejectionReason: reason,
    });

    await insertAuditEvent(ctx, {
      actorId: admin.userId,
      action: 'receipt.rejected',
      targetType: 'liveEntryReceipts',
      targetId: receiptId,
      reason: reason,
      afterSummary: { status: 'rejected' },
    });

    return receiptId;
  },
});

/** Daily cleanup: delete storage files and DB records for rejected receipts older than 30 days. */
export const cleanupRejectedReceipts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const rejected = await ctx.db
      .query('liveEntryReceipts')
      .withIndex('status', (q) => q.eq('status', 'rejected'))
      .filter((q) => q.lt(q.field('createdAt'), thirtyDaysAgo))
      .collect();

    let deleted = 0;
    for (const receipt of rejected) {
      await ctx.storage.delete(receipt.storageId);
      await ctx.db.delete(receipt._id);
      deleted++;
    }

    return { deleted };
  },
});
