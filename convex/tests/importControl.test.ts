/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { startOfDayCasablanca } from '../lib/dates';

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

const DAY = startOfDayCasablanca(Date.UTC(2026, 9, 25, 12));

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(t: T, role: TestRole): Promise<Id<'users'>> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
    });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName: `${role} Test`,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

interface SeedOptions {
  withStorage?: boolean;
  withOrder?: boolean;
  withDiscrepancies?: boolean;
}

interface SeedResult {
  batchId: Id<'importBatches'>;
  storageId: Id<'_storage'> | null;
  orderId: Id<'orders'> | null;
  discrepancyIds: Id<'discrepancies'>[];
}

/**
 * Insert one fully-linked import batch: three source rows, an order with its
 * cash/TPE allocations, and optionally discrepancies linked both by batch and
 * by order. Mirrors the shape produced by processImportBatch + matching.
 */
async function seedBatch(t: T, key: string, options: SeedOptions = {}): Promise<SeedResult> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert('users', { email: `seed-${key}@bringo.test` });
    const riderId = await ctx.db.insert('riders', {
      canonicalName: `Livreur ${key}`,
      aliases: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const marketId = await ctx.db.insert('markets', {
      name: `Marché ${key}`,
      externalId: `MKT-${key}`,
      city: 'Casablanca',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const storageId = options.withStorage
      ? await ctx.storage.store(new Blob([`report-${key}`]))
      : null;

    const batchId = await ctx.db.insert('importBatches', {
      gmailMessageId: `message-${key}`,
      attachmentName: `rapport-${key}.xlsx`,
      attachmentHash: `hash-${key}`,
      reportDate: DAY,
      receivedAt: now,
      startedAt: now,
      completedAt: now,
      status: 'needs_review',
      totalRows: 3,
      acceptedRows: 1,
      rejectedRows: 1,
      duplicateRows: 0,
      conflictRows: 1,
      errorSummary: 'Row 3: Invalid amount\nRow 4: Duplicate command',
      storageId: storageId ?? undefined,
    });

    const validRowId = await ctx.db.insert('sourceRows', {
      importBatchId: batchId,
      originalRowNumber: 2,
      originalData: { number: `CMD-${key}-OK` },
      validationState: 'valid',
    });
    await ctx.db.insert('sourceRows', {
      importBatchId: batchId,
      originalRowNumber: 3,
      originalData: { number: `CMD-${key}-BAD` },
      validationState: 'invalid',
      errors: ['Invalid amount'],
    });
    await ctx.db.insert('sourceRows', {
      importBatchId: batchId,
      originalRowNumber: 4,
      originalData: { number: `CMD-${key}-CONFLICT` },
      validationState: 'conflict',
      errors: ['Conflicts with existing order'],
    });

    let orderId: Id<'orders'> | null = null;
    if (options.withOrder !== false) {
      orderId = await ctx.db.insert('orders', {
        commandId: `CMD-${key}-OK`,
        deliveryDate: DAY,
        riderId,
        rawRiderName: `Livreur ${key}`,
        paymentMethod: 'cash',
        amount: 1500,
        sourceRowId: validRowId,
        importBatchId: batchId,
        eligibilityStatus: 'eligible',
        createdAt: now,
      });
      await ctx.db.patch(validRowId, { linkedOrderId: orderId });

      const collectionId = await ctx.db.insert('cashCollections', {
        riderId,
        amount: 1500,
        collectedAt: now,
        collectedBy: userId,
        sourceReportDate: DAY,
        isReversal: false,
        createdAt: now,
      });
      await ctx.db.insert('cashCollectionAllocations', {
        collectionId,
        orderId,
        allocatedAmount: 1500,
      });

      const receiptId = await ctx.db.insert('tpeReceipts', {
        claimedAmount: 1500,
        receiptDate: DAY,
        uploadedBy: userId,
        status: 'approved',
        evidenceStorageIds: [],
        createdAt: now,
      });
      await ctx.db.insert('tpeReceiptAllocations', {
        receiptId,
        orderId,
        allocatedAmount: 1500,
      });
    }

    const discrepancyIds: Id<'discrepancies'>[] = [];
    if (options.withDiscrepancies) {
      const liveEntryId = await ctx.db.insert('liveEntries', {
        riderUserId: userId,
        commandId: `CMD-${key}-OK`,
        commandKey: `cmd-${key}-ok`,
        marketId,
        marketName: `Marché ${key}`,
        marketExternalId: `MKT-${key}`,
        amount: 1200,
        paymentMethod: 'cash',
        entryDate: DAY,
        createdAt: now,
        updatedAt: now,
      });

      discrepancyIds.push(
        await ctx.db.insert('discrepancies', {
          reason: 'amount_mismatch',
          commandId: `CMD-${key}-OK`,
          commandKey: `cmd-${key}-ok`,
          entryDate: DAY,
          riderUserId: userId,
          riderName: `Livreur ${key}`,
          liveEntryId,
          orderId: orderId ?? undefined,
          importBatchId: batchId,
          riderAmount: 1200,
          excelAmount: 1500,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        })
      );

      discrepancyIds.push(
        await ctx.db.insert('discrepancies', {
          reason: 'amount_mismatch',
          commandId: `CMD-${key}-OK`,
          commandKey: `cmd-${key}-ok`,
          entryDate: DAY,
          riderUserId: userId,
          riderName: `Livreur ${key}`,
          liveEntryId,
          orderId: orderId ?? undefined,
          riderAmount: 1200,
          excelAmount: 1500,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    return { batchId, storageId, orderId, discrepancyIds };
  });
}

describe('deleteImportBatch', () => {
  it('cascades to rows, orders, allocations and discrepancies while sparing other imports', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    const doomed = await seedBatch(t, 'A', {
      withStorage: true,
      withOrder: true,
      withDiscrepancies: true,
    });
    const survivor = await seedBatch(t, 'B', {
      withStorage: true,
      withOrder: true,
      withDiscrepancies: true,
    });

    const result = await admin.mutation(api.imports.deleteImportBatch, {
      batchId: doomed.batchId,
    });

    expect(result).toMatchObject({
      deletedOrders: 1,
      deletedSourceRows: 3,
      deletedDiscrepancies: 2,
      deletedAllocations: 2,
    });

    const snapshot = await t.run(async (ctx) => ({
      batch: await ctx.db.get(doomed.batchId),
      survivorBatch: await ctx.db.get(survivor.batchId),
      orders: await ctx.db.query('orders').collect(),
      sourceRows: await ctx.db.query('sourceRows').collect(),
      discrepancies: await ctx.db.query('discrepancies').collect(),
      cashAllocations: await ctx.db.query('cashCollectionAllocations').collect(),
      tpeAllocations: await ctx.db.query('tpeReceiptAllocations').collect(),
      auditEvents: await ctx.db.query('auditEvents').collect(),
      doomedFileExists: doomed.storageId
        ? (await ctx.storage.get(doomed.storageId)) !== null
        : false,
      survivorFileExists: survivor.storageId
        ? (await ctx.storage.get(survivor.storageId)) !== null
        : false,
    }));

    expect(snapshot.batch).toBeNull();
    expect(snapshot.doomedFileExists).toBe(false);

    // Only the survivor's data remains.
    expect(snapshot.survivorBatch).not.toBeNull();
    expect(snapshot.survivorFileExists).toBe(true);
    expect(snapshot.orders).toHaveLength(1);
    expect(snapshot.orders[0].importBatchId).toBe(survivor.batchId);
    expect(snapshot.sourceRows).toHaveLength(3);
    expect(snapshot.sourceRows.every((row) => row.importBatchId === survivor.batchId)).toBe(true);
    expect(snapshot.discrepancies).toHaveLength(2);
    expect(
      snapshot.discrepancies.every(
        (discrepancy) =>
          discrepancy.importBatchId === survivor.batchId ||
          (discrepancy.orderId !== undefined &&
            discrepancy.orderId === survivor.orderId)
      )
    ).toBe(true);
    expect(snapshot.cashAllocations).toHaveLength(1);
    expect(snapshot.cashAllocations[0].orderId).toBe(survivor.orderId);
    expect(snapshot.tpeAllocations).toHaveLength(1);
    expect(snapshot.tpeAllocations[0].orderId).toBe(survivor.orderId);

    expect(snapshot.auditEvents).toHaveLength(1);
    expect(snapshot.auditEvents[0]).toMatchObject({
      actorId: adminId,
      action: 'import_batch.delete',
      targetType: 'importBatch',
      targetId: doomed.batchId,
    });
  });

  it('is restricted to admins', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const riderId = await createProfile(t, 'rider');
    const seeded = await seedBatch(t, 'C', { withOrder: false });

    const supervisor = t.withIdentity({
      subject: supervisorId,
      email: 'supervisor@bringo.test',
    });
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await expect(
      supervisor.mutation(api.imports.deleteImportBatch, { batchId: seeded.batchId })
    ).rejects.toThrow(/Forbidden/);
    await expect(
      rider.mutation(api.imports.deleteImportBatch, { batchId: seeded.batchId })
    ).rejects.toThrow(/Forbidden/);
    await expect(
      supervisor.query(api.imports.getImportBatchIssues, { batchId: seeded.batchId })
    ).rejects.toThrow(/Forbidden/);
    await expect(
      supervisor.query(api.imports.getImportFileUrl, { batchId: seeded.batchId })
    ).rejects.toThrow(/Forbidden/);

    const batch = await t.run(async (ctx) => ctx.db.get(seeded.batchId));
    expect(batch).not.toBeNull();
  });
});

describe('getImportFileUrl', () => {
  it('returns the original file URL and null when no file was stored', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    const withFile = await seedBatch(t, 'D', { withStorage: true, withOrder: false });
    const withoutFile = await seedBatch(t, 'E', { withStorage: false, withOrder: false });

    const url = await admin.query(api.imports.getImportFileUrl, {
      batchId: withFile.batchId,
    });
    expect(url).toMatch(/^https:\/\//);

    const missing = await admin.query(api.imports.getImportFileUrl, {
      batchId: withoutFile.batchId,
    });
    expect(missing).toBeNull();
  });
});

describe('getImportBatchIssues', () => {
  it('returns only invalid and conflicting rows ordered by row number', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });
    const seeded = await seedBatch(t, 'F', { withOrder: false });

    const issues = await admin.query(api.imports.getImportBatchIssues, {
      batchId: seeded.batchId,
    });

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.rowNumber)).toEqual([3, 4]);
    expect(issues.map((issue) => issue.validationState)).toEqual(['invalid', 'conflict']);
    expect(issues[0]).toMatchObject({
      commandId: 'CMD-F-BAD',
      errors: ['Invalid amount'],
    });
    expect(issues[1]).toMatchObject({
      commandId: 'CMD-F-CONFLICT',
      errors: ['Conflicts with existing order'],
    });
  });
});
