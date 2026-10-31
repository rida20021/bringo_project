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

const DAY_A = startOfDayCasablanca(Date.UTC(2026, 9, 25, 12));
const DAY_B = startOfDayCasablanca(Date.UTC(2026, 9, 26, 12));

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(t: T, role: TestRole): Promise<Id<'users'>> {
  const displayName = role === 'rider' ? 'Livreur Test' : `${role} Test`;
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
    });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

interface World {
  adminId: Id<'users'>;
  riderUserId: Id<'users'>;
  marketId: Id<'markets'>;
  batchId: Id<'importBatches'>;
  sourceRowId: Id<'sourceRows'>;
  riderRecordId: Id<'riders'>;
}

async function seedWorld(t: T): Promise<World> {
  const adminId = await createProfile(t, 'admin');
  const riderUserId = await createProfile(t, 'rider');

  return t.run(async (ctx) => {
    const marketId = await ctx.db.insert('markets', {
      name: 'Marché Central',
      externalId: `MKT-${Math.random()}`,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const riderRecordId = await ctx.db.insert('riders', {
      canonicalName: 'Livreur Test',
      aliases: ['Livreur Test'],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const batchId = await ctx.db.insert('importBatches', {
      gmailMessageId: `msg-${Math.random()}`,
      attachmentName: 'Rapport_TIKTAK_2026-10-25.xlsx',
      attachmentHash: `hash-${Math.random()}`,
      reportDate: DAY_A,
      receivedAt: Date.now(),
      startedAt: Date.now(),
      status: 'completed',
      totalRows: 0,
      acceptedRows: 0,
      rejectedRows: 0,
      duplicateRows: 0,
      conflictRows: 0,
    });

    const sourceRowId = await ctx.db.insert('sourceRows', {
      importBatchId: batchId,
      originalRowNumber: 2,
      originalData: {},
      validationState: 'valid',
    });

    return { adminId, riderUserId, marketId, batchId, sourceRowId, riderRecordId };
  });
}

async function addOrder(
  t: T,
  world: World,
  commandId: string,
  amount: number,
  deliveryDate = DAY_A
): Promise<Id<'orders'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('orders', {
      commandId,
      deliveryDate,
      riderId: world.riderRecordId,
      rawRiderName: 'Livreur Test',
      paymentMethod: 'cash',
      amount,
      sourceRowId: world.sourceRowId,
      importBatchId: world.batchId,
      eligibilityStatus: 'eligible',
      createdAt: Date.now(),
    })
  );
}

async function addLiveEntry(
  t: T,
  world: World,
  commandId: string,
  amount: number,
  entryDate = DAY_A
): Promise<Id<'liveEntries'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('liveEntries', {
      riderUserId: world.riderUserId,
      commandId,
      commandKey: commandId.trim().toLowerCase(),
      marketId: world.marketId,
      marketName: 'Marché Central',
      marketExternalId: 'MKT-1',
      amount,
      paymentMethod: 'cash',
      entryDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

function adminClient(t: T, world: World) {
  return t.withIdentity({ subject: world.adminId, email: 'admin@bringo.test' });
}

describe('matching engine', () => {
  it('classifies matched, mismatched and missing commands', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    await addLiveEntry(t, world, 'CMD-001', 37504);
    await addOrder(t, world, 'CMD-001', 37504);

    await addLiveEntry(t, world, 'CMD-002', 5000);
    await addOrder(t, world, 'CMD-002', 4000);

    await addLiveEntry(t, world, 'CMD-003', 2000);

    // Excel-only order: out of scope for the rider-vs-Excel comparison.
    await addOrder(t, world, 'CMD-004', 3000);

    const admin = adminClient(t, world);
    const result = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_A,
    });

    expect(result).toMatchObject({
      matched: 1,
      missingInExcel: 1,
      amountMismatch: 1,
      discrepanciesCreated: 2,
    });

    const rows = await admin.query(api.discrepancies.getDiscrepancies, {});
    expect(rows).toHaveLength(2);

    const mismatch = rows.find((row) => row.reason === 'amount_mismatch');
    expect(mismatch).toMatchObject({
      commandId: 'CMD-002',
      riderAmount: 5000,
      excelAmount: 4000,
      status: 'open',
      riderName: 'Livreur Test',
    });

    const missing = rows.find((row) => row.reason === 'missing_in_excel');
    expect(missing).toMatchObject({
      commandId: 'CMD-003',
      riderAmount: 2000,
      status: 'open',
    });
    expect(missing?.excelAmount).toBeUndefined();

    expect(rows.some((row) => row.commandId === 'CMD-004')).toBe(false);
  });

  it('never creates a discrepancy for an Excel order without a live entry', async () => {
    const t = makeT();
    const world = await seedWorld(t);
    await addOrder(t, world, 'CMD-ONLY-EXCEL', 9000);

    const admin = adminClient(t, world);
    const result = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_A,
    });

    expect(result).toMatchObject({
      matched: 0,
      missingInExcel: 0,
      amountMismatch: 0,
      discrepanciesCreated: 0,
    });
    expect(await admin.query(api.discrepancies.getDiscrepancies, {})).toHaveLength(0);
  });

  it('is idempotent across repeated runs', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    await addLiveEntry(t, world, 'CMD-002', 5000);
    await addOrder(t, world, 'CMD-002', 4000);
    await addLiveEntry(t, world, 'CMD-003', 2000);

    const admin = adminClient(t, world);
    const first = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_A,
    });
    expect(first).toMatchObject({ discrepanciesCreated: 2, discrepanciesUpdated: 0 });

    const before = await admin.query(api.discrepancies.getDiscrepancies, {});
    const second = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_A,
    });
    expect(second).toMatchObject({ discrepanciesCreated: 0, discrepanciesUpdated: 2 });

    const after = await admin.query(api.discrepancies.getDiscrepancies, {});
    expect(after).toHaveLength(2);
    expect(after.map((row) => row._id).sort()).toEqual(
      before.map((row) => row._id).sort()
    );
  });
});

describe('discrepancy resolution', () => {
  async function seedTwoDiscrepancies(t: T) {
    const world = await seedWorld(t);
    await addLiveEntry(t, world, 'CMD-002', 5000);
    await addOrder(t, world, 'CMD-002', 4000);
    await addLiveEntry(t, world, 'CMD-003', 2000);

    const admin = adminClient(t, world);
    await admin.mutation(api.discrepancies.runMatchingForDate, { reportDate: DAY_A });
    const rows = await admin.query(api.discrepancies.getDiscrepancies, {});
    return { world, admin, rows };
  }

  it('rejects empty, whitespace-only and over-long notes', async () => {
    const t = makeT();
    const { admin, rows } = await seedTwoDiscrepancies(t);
    const target = rows[0];

    await expect(
      admin.mutation(api.discrepancies.resolveDiscrepancy, {
        discrepancyId: target._id,
        note: '',
      })
    ).rejects.toThrow(/note de résolution est requise/);

    await expect(
      admin.mutation(api.discrepancies.resolveDiscrepancy, {
        discrepancyId: target._id,
        note: '    ',
      })
    ).rejects.toThrow(/note de résolution est requise/);

    await expect(
      admin.mutation(api.discrepancies.resolveDiscrepancy, {
        discrepancyId: target._id,
        note: 'x'.repeat(501),
      })
    ).rejects.toThrow(/ne doit pas dépasser 500/);
  });

  it('resolves a discrepancy and updates stats without reopening it', async () => {
    const t = makeT();
    const { admin, rows } = await seedTwoDiscrepancies(t);
    const target = rows.find((row) => row.reason === 'amount_mismatch')!;

    const resolved = await admin.mutation(api.discrepancies.resolveDiscrepancy, {
      discrepancyId: target._id,
      note: 'Montant corrigé avec le livreur',
    });
    expect(resolved).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Montant corrigé avec le livreur',
    });
    expect(resolved?.resolvedAt).toBeTypeOf('number');

    const resolvedRows = await admin.query(api.discrepancies.getDiscrepancies, {
      status: 'resolved',
    });
    expect(resolvedRows).toHaveLength(1);
    expect(resolvedRows[0]).toMatchObject({
      _id: target._id,
      resolutionNote: 'Montant corrigé avec le livreur',
    });

    expect(await admin.query(api.discrepancies.getDiscrepancyStats, {})).toMatchObject({
      open: 1,
      resolved: 1,
    });

    const rerun = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_A,
    });
    expect(rerun.discrepanciesCreated).toBe(0);

    const all = await admin.query(api.discrepancies.getDiscrepancies, {});
    expect(all).toHaveLength(2);
    const stillResolved = all.find((row) => row._id === target._id);
    expect(stillResolved?.status).toBe('resolved');

    expect(await admin.query(api.discrepancies.getDiscrepancyStats, {})).toMatchObject({
      open: 1,
      resolved: 1,
      missingInExcel: 1,
      amountMismatch: 0,
    });
  });
});

describe('discrepancy authorization', () => {
  it('blocks riders from matching, listing, stats and resolution', async () => {
    const t = makeT();
    const world = await seedWorld(t);
    await addLiveEntry(t, world, 'CMD-003', 2000);

    const admin = adminClient(t, world);
    await admin.mutation(api.discrepancies.runMatchingForDate, { reportDate: DAY_A });
    const [existing] = await admin.query(api.discrepancies.getDiscrepancies, {});
    expect(existing).toMatchObject({ commandId: 'CMD-003', status: 'open' });

    const rider = t.withIdentity({
      subject: world.riderUserId,
      email: 'rider@bringo.test',
    });

    await expect(
      rider.mutation(api.discrepancies.runMatchingForDate, { reportDate: DAY_A })
    ).rejects.toThrow(/Forbidden/);
    await expect(rider.query(api.discrepancies.getDiscrepancies, {})).rejects.toThrow(
      /Forbidden/
    );
    await expect(rider.query(api.discrepancies.getDiscrepancyStats, {})).rejects.toThrow(
      /Forbidden/
    );
    await expect(
      rider.mutation(api.discrepancies.resolveDiscrepancy, {
        discrepancyId: existing._id,
        note: 'tentative',
      })
    ).rejects.toThrow(/Forbidden/);

    const rows = await admin.query(api.discrepancies.getDiscrepancies, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('open');
  });

  it('lets only active admins read stats and lists', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    const admin = adminClient(t, world);
    expect(await admin.query(api.discrepancies.getDiscrepancyStats, {})).toEqual({
      open: 0,
      resolved: 0,
      missingInExcel: 0,
      amountMismatch: 0,
    });
    expect(await admin.query(api.discrepancies.getDiscrepancies, {})).toEqual([]);
  });
});

describe('discrepancy listing scope', () => {
  it('scopes results to the requested report date and caps the limit', async () => {
    const t = makeT();
    const world = await seedWorld(t);
    const liveEntryId = await addLiveEntry(t, world, 'CMD-DAY-A', 1000);

    await t.run(async (ctx) => {
      for (let index = 0; index < 210; index++) {
        await ctx.db.insert('discrepancies', {
          reason: 'missing_in_excel',
          commandId: `CMD-A-${index}`,
          commandKey: `cmd-a-${index}`,
          entryDate: DAY_A,
          riderUserId: world.riderUserId,
          riderName: 'Livreur Test',
          liveEntryId,
          riderAmount: 1000,
          status: 'open',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    // One discrepancy on another day, to prove the date scope is applied.
    await addLiveEntry(t, world, 'CMD-DAY-B', 2000, DAY_B);
    await adminClient(t, world).mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_B,
    });

    const admin = adminClient(t, world);

    const dayA = await admin.query(api.discrepancies.getDiscrepancies, {
      reportDate: DAY_A,
      limit: 1000,
    });
    expect(dayA).toHaveLength(200);
    expect(dayA.every((row) => row.entryDate === DAY_A)).toBe(true);

    const dayB = await admin.query(api.discrepancies.getDiscrepancies, {
      reportDate: DAY_B,
    });
    expect(dayB).toHaveLength(1);
    expect(dayB[0]).toMatchObject({ commandId: 'CMD-DAY-B', entryDate: DAY_B });

    const limited = await admin.query(api.discrepancies.getDiscrepancies, {
      reportDate: DAY_A,
      limit: 5,
    });
    expect(limited).toHaveLength(5);

    expect(
      await admin.query(api.discrepancies.getDiscrepancyStats, { reportDate: DAY_B })
    ).toMatchObject({ open: 1, resolved: 0 });
  });

  it('does not match a live entry against an order from another day', async () => {
    const t = makeT();
    const world = await seedWorld(t);

    await addLiveEntry(t, world, 'CMD-CROSS-DAY', 3000, DAY_A);
    await addOrder(t, world, 'CMD-CROSS-DAY', 3000, DAY_B);

    const admin = adminClient(t, world);

    const dayAResult = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_A,
    });
    expect(dayAResult).toMatchObject({
      matched: 0,
      missingInExcel: 1,
      discrepanciesCreated: 1,
    });

    const rows = await admin.query(api.discrepancies.getDiscrepancies, {
      reportDate: DAY_A,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reason: 'missing_in_excel',
      commandId: 'CMD-CROSS-DAY',
      entryDate: DAY_A,
    });
    expect(rows[0].excelAmount).toBeUndefined();

    const dayBResult = await admin.mutation(api.discrepancies.runMatchingForDate, {
      reportDate: DAY_B,
    });
    expect(dayBResult).toMatchObject({
      matched: 0,
      missingInExcel: 0,
      amountMismatch: 0,
      discrepanciesCreated: 0,
    });
  });
});
