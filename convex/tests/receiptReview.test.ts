/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

const modules = import.meta.glob([
  '../**/*.ts',
  '!../**/*.test.ts',
  '!../auth.ts',
  '!../auth.config.ts',
  '!../http.ts',
  '!../index.ts',
]);

type T = ReturnType<typeof makeT>;
type TestRole = 'supervisor' | 'admin' | 'rider';

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(t: T, role: TestRole, isActive = true): Promise<Id<'users'>> {
  const displayName =
    role === 'admin' ? 'Admin Test' : role === 'supervisor' ? 'Superviseur Test' : 'Livreur Test';
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
    });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName,
      isActive,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

interface ReceiptFixture {
  riderId: Id<'users'>;
  liveEntryId: Id<'liveEntries'>;
  receiptId: Id<'liveEntryReceipts'>;
}

async function createPendingReceipt(
  t: T,
  overrides: { commandId?: string; amount?: number } = {}
): Promise<ReceiptFixture> {
  const riderId = await createProfile(t, 'rider');

  const storageId = await t.run(async (ctx) => {
    const blob = new Blob(['receipt'], { type: 'image/png' });
    return ctx.storage.store(blob);
  });

  const marketId = await t.run(async (ctx) =>
    ctx.db.insert('markets', {
      name: 'Marché Central',
      externalId: `MKT-${Math.random()}`,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );

  const now = Date.now();
  const commandId = overrides.commandId ?? 'CMD-REVIEW-1';

  const liveEntryId = await t.run(async (ctx) =>
    ctx.db.insert('liveEntries', {
      riderUserId: riderId,
      commandId,
      commandKey: commandId.toLowerCase(),
      marketId,
      marketName: 'Marché Central',
      marketExternalId: 'MKT-001',
      amount: overrides.amount ?? 15900,
      paymentMethod: 'tpe',
      entryDate: now,
      createdAt: now,
      updatedAt: now,
    })
  );

  const receiptId = await t.run(async (ctx) =>
    ctx.db.insert('liveEntryReceipts', {
      liveEntryId,
      riderUserId: riderId,
      kind: 'tpe',
      storageId,
      fileName: 'ticket.png',
      mimeType: 'image/png',
      size: 7,
      status: 'pending_review',
      createdAt: now,
    })
  );

  return { riderId, liveEntryId, receiptId };
}

describe('listPendingReceipts', () => {
  it('returns joined rider and entry data for supervisors', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const { receiptId } = await createPendingReceipt(t);

    const rows = await t
      .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
      .query(api.receipts.listPendingReceipts, {});

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      receiptId,
      kind: 'tpe',
      fileName: 'ticket.png',
      mimeType: 'image/png',
      entry: {
        commandId: 'CMD-REVIEW-1',
        marketName: 'Marché Central',
        amount: 15900,
        paymentMethod: 'tpe',
      },
      rider: {
        displayName: 'Livreur Test',
      },
    });
    expect(typeof rows[0].url === 'string' || rows[0].url === null).toBe(true);
  });

  it('shows pending receipts to admins too', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    await createPendingReceipt(t);

    const rows = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .query(api.receipts.listPendingReceipts, {});

    expect(rows).toHaveLength(1);
  });

  it('rejects riders and unauthenticated callers', async () => {
    const t = makeT();
    const riderId = await createProfile(t, 'rider');
    await createPendingReceipt(t);

    await expect(
      t
        .withIdentity({ subject: riderId, email: 'rider@bringo.test' })
        .query(api.receipts.listPendingReceipts, {})
    ).rejects.toThrow(/Forbidden/);

    await expect(t.query(api.receipts.listPendingReceipts, {})).rejects.toThrow(
      /Unauthorized|Forbidden/
    );
  });

  it('honours the limit argument', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    await createPendingReceipt(t, { commandId: 'CMD-1' });
    await createPendingReceipt(t, { commandId: 'CMD-2' });

    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });
    expect(await admin.query(api.receipts.listPendingReceipts, { limit: 1 })).toHaveLength(1);
    expect(await admin.query(api.receipts.listPendingReceipts, {})).toHaveLength(2);
  });
});

describe('approveReceipt', () => {
  it('marks a pending receipt as approved and removes it from the queue', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const { receiptId } = await createPendingReceipt(t);
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await admin.mutation(api.receipts.approveReceipt, { receiptId });

    const receipt = await t.run(async (ctx) => ctx.db.get(receiptId));
    expect(receipt?.status).toBe('approved');
    expect(receipt?.reviewedBy).toBe(adminId);
    expect(typeof receipt?.reviewedAt).toBe('number');

    expect(await admin.query(api.receipts.listPendingReceipts, {})).toHaveLength(0);
  });

  it('refuses supervisors and riders', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const riderId = await createProfile(t, 'rider');
    const { receiptId } = await createPendingReceipt(t);

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .mutation(api.receipts.approveReceipt, { receiptId })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      t
        .withIdentity({ subject: riderId, email: 'rider@bringo.test' })
        .mutation(api.receipts.approveReceipt, { receiptId })
    ).rejects.toThrow(/Forbidden/);

    const receipt = await t.run(async (ctx) => ctx.db.get(receiptId));
    expect(receipt?.status).toBe('pending_review');
  });

  it('refuses to review the same receipt twice', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const { receiptId } = await createPendingReceipt(t);
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await admin.mutation(api.receipts.approveReceipt, { receiptId });

    await expect(
      admin.mutation(api.receipts.approveReceipt, { receiptId })
    ).rejects.toThrow(/already been reviewed/);

    await expect(
      admin.mutation(api.receipts.rejectReceipt, { receiptId, reason: 'Trop tard' })
    ).rejects.toThrow(/already been reviewed/);
  });
});

describe('rejectReceipt', () => {
  it('requires a non-empty reason', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const { receiptId } = await createPendingReceipt(t);
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await expect(
      admin.mutation(api.receipts.rejectReceipt, { receiptId, reason: '   ' })
    ).rejects.toThrow(/reason is required/);

    const receipt = await t.run(async (ctx) => ctx.db.get(receiptId));
    expect(receipt?.status).toBe('pending_review');
  });

  it('stores the trimmed reason and reviewer', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const { receiptId } = await createPendingReceipt(t);
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await admin.mutation(api.receipts.rejectReceipt, {
      receiptId,
      reason: '  Montant illisible  ',
    });

    const receipt = await t.run(async (ctx) => ctx.db.get(receiptId));
    expect(receipt).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Montant illisible',
      reviewedBy: adminId,
    });
    expect(typeof receipt?.reviewedAt).toBe('number');

    expect(await admin.query(api.receipts.listPendingReceipts, {})).toHaveLength(0);
  });

  it('rejects reasons longer than 500 characters', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const { receiptId } = await createPendingReceipt(t);
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    await expect(
      admin.mutation(api.receipts.rejectReceipt, {
        receiptId,
        reason: 'x'.repeat(501),
      })
    ).rejects.toThrow(/500/);
  });
});
