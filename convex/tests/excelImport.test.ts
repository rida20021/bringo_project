/// <reference types="vite/client" />
// @vitest-environment node
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
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

const DAY_A = startOfDayCasablanca(Date.UTC(2026, 9, 25, 12));
const HEADERS = [
  'delivery_date_end',
  'number',
  'payment_method',
  'store_internal_name',
  'shopper_name',
  'Total',
  'store_external_id',
  'company',
  'shipping_method',
];

function makeT() {
  return convexTest({ schema, modules });
}

function workbookBytes(
  rows: Array<[string, string, string, string, string, number, (string | number | null)?]>
): Uint8Array {
  const aoa = [
    HEADERS,
    ...rows.map((row) => {
      const [date, command, method, store, rider, total, externalId = 'STORE-1'] = row;
      return [date, command, method, store, rider, total, externalId, 'Bringo', 'standard'];
    }),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), 'Rapport');
  const buffer = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    cellDates: true,
  });
  return new Uint8Array(buffer);
}

async function createProfile(t: T, role: 'admin' | 'rider'): Promise<Id<'users'>> {
  const displayName = role === 'rider' ? 'Livreur Test' : 'Admin Test';
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
      name: displayName,
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

async function seedLiveEntries(
  t: T,
  riderUserId: Id<'users'>
): Promise<{ marketId: Id<'markets'> }> {
  return t.run(async (ctx) => {
    const marketId = await ctx.db.insert('markets', {
      name: 'Marché Central',
      externalId: 'MKT-1',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const entries: Array<[string, number]> = [
      ['CMD-MATCH', 37504],
      ['CMD-MISMATCH', 5000],
      ['CMD-MISSING', 2000],
    ];

    for (const [commandId, amount] of entries) {
      await ctx.db.insert('liveEntries', {
        riderUserId,
        commandId,
        commandKey: commandId.toLowerCase(),
        marketId,
        marketName: 'Marché Central',
        marketExternalId: 'MKT-1',
        amount,
        paymentMethod: 'cash',
        entryDate: DAY_A,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { marketId };
  });
}

async function storeWorkbook(t: T, bytes: Uint8Array): Promise<Id<'_storage'>> {
  const copy = new Uint8Array(bytes);
  return t.run(async (ctx) =>
    ctx.storage.store(
      new Blob([copy], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    )
  );
}

const IMPORT_FILE_NAME = 'Rapport_TIKTAK_2026-10-25.xlsx';

describe('importExcelFile action', () => {
  it('imports the workbook, creates orders and runs matching end to end', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const riderUserId = await createProfile(t, 'rider');
    await seedLiveEntries(t, riderUserId);

    const bytes = workbookBytes([
      ['2026-10-25', 'CMD-MATCH', 'cash', 'Store A', 'Livreur Test', 375.04],
      ['2026-10-25', 'CMD-MISMATCH', 'cash', 'Store A', 'Livreur Test', 40],
    ]);
    const storageId = await storeWorkbook(t, bytes);

    const result = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .action(api.excelImport.importExcelFile, {
        storageId,
        fileName: IMPORT_FILE_NAME,
      });

    expect(result.duplicateFile).toBe(false);
    if (result.duplicateFile) throw new Error('expected a fresh import');

    expect(result).toMatchObject({
      sheetName: 'Rapport',
      reportDate: DAY_A,
      accepted: 2,
      rejected: 0,
      duplicate: 0,
      conflict: 0,
      matched: 1,
      amountMismatch: 1,
      missingInExcel: 1,
      discrepanciesCreated: 2,
    });

    const orders = await t.run(async (ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(2);

    const matchedOrder = orders.find((order) => order.commandId === 'CMD-MATCH');
    expect(matchedOrder).toMatchObject({
      amount: 37504,
      deliveryDate: DAY_A,
      paymentMethod: 'cash',
      rawRiderName: 'Livreur Test',
      store: 'Store A',
    });

    const mismatchedOrder = orders.find((order) => order.commandId === 'CMD-MISMATCH');
    expect(mismatchedOrder).toMatchObject({ amount: 4000, deliveryDate: DAY_A });

    const sourceRows = await t.run(async (ctx) => ctx.db.query('sourceRows').collect());
    expect(sourceRows).toHaveLength(2);
    expect(sourceRows.every((row) => row.validationState === 'valid')).toBe(true);

    const discrepancies = await t.run(async (ctx) =>
      ctx.db.query('discrepancies').collect()
    );
    expect(discrepancies).toHaveLength(2);
    const mismatch = discrepancies.find((row) => row.reason === 'amount_mismatch');
    expect(mismatch).toMatchObject({
      commandId: 'CMD-MISMATCH',
      riderAmount: 5000,
      excelAmount: 4000,
      status: 'open',
    });
    const missing = discrepancies.find((row) => row.reason === 'missing_in_excel');
    expect(missing).toMatchObject({ commandId: 'CMD-MISSING', riderAmount: 2000 });
    expect(missing?.excelAmount).toBeUndefined();
  });

  it('auto-provisions markets from store fields and links orders to them', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');

    const bytes = workbookBytes([
      ['2026-10-25', 'CMD-A', 'cash', 'Store A', 'Livreur Test', 10],
      ['2026-10-25', 'CMD-B', 'cash', 'Store A', 'Livreur Test', 20],
      ['2026-10-25', 'CMD-C', 'cash', 'Store B', 'Livreur Test', 30, 'STORE-2'],
    ]);

    const result = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .action(api.excelImport.importExcelFile, {
        storageId: await storeWorkbook(t, bytes),
        fileName: IMPORT_FILE_NAME,
      });

    expect(result.duplicateFile).toBe(false);
    if (result.duplicateFile) throw new Error('expected a fresh import');
    expect(result.marketsCreated).toBe(2);

    const markets = await t.run(async (ctx) => ctx.db.query('markets').collect());
    expect(markets).toHaveLength(2);

    const storeA = markets.find((market) => market.externalId === 'STORE-1');
    expect(storeA).toMatchObject({ name: 'Store A', isActive: true });
    expect(storeA?.city).toBeUndefined();

    const orders = await t.run(async (ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(3);

    const orderA = orders.find((order) => order.commandId === 'CMD-A');
    const orderB = orders.find((order) => order.commandId === 'CMD-B');
    const orderC = orders.find((order) => order.commandId === 'CMD-C');
    const storeB = markets.find((market) => market.externalId === 'STORE-2');

    expect(orderA?.marketId).toBe(storeA?._id);
    expect(orderB?.marketId).toBe(storeA?._id);
    expect(orderC?.marketId).toBe(storeB?._id);
  });

  it('reuses an existing market with the same external ID', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');

    const existingMarketId = await t.run(async (ctx) =>
      ctx.db.insert('markets', {
        name: 'Existing Store',
        externalId: 'STORE-1',
        city: 'Casablanca',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const bytes = workbookBytes([
      ['2026-10-25', 'CMD-REUSE', 'cash', 'Renamed Store', 'Livreur Test', 10],
    ]);

    const result = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .action(api.excelImport.importExcelFile, {
        storageId: await storeWorkbook(t, bytes),
        fileName: IMPORT_FILE_NAME,
      });

    expect(result.duplicateFile).toBe(false);
    if (result.duplicateFile) throw new Error('expected a fresh import');
    expect(result.marketsCreated).toBe(0);

    const markets = await t.run(async (ctx) => ctx.db.query('markets').collect());
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({ _id: existingMarketId, name: 'Existing Store' });

    const order = await t.run(async (ctx) =>
      ctx.db
        .query('orders')
        .withIndex('commandId', (q) => q.eq('commandId', 'CMD-REUSE'))
        .unique()
    );
    expect(order?.marketId).toBe(existingMarketId);
  });

  it('skips market provisioning when the store name or external ID is missing', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');

    const bytes = workbookBytes([
      ['2026-10-25', 'CMD-NO-ID', 'cash', 'Store A', 'Livreur Test', 10, null],
      ['2026-10-25', 'CMD-NO-NAME', 'cash', '', 'Livreur Test', 20, 'STORE-9'],
    ]);

    const result = await t
      .withIdentity({ subject: adminId, email: 'admin@bringo.test' })
      .action(api.excelImport.importExcelFile, {
        storageId: await storeWorkbook(t, bytes),
        fileName: IMPORT_FILE_NAME,
      });

    expect(result.duplicateFile).toBe(false);
    if (result.duplicateFile) throw new Error('expected a fresh import');
    expect(result.marketsCreated).toBe(0);

    const markets = await t.run(async (ctx) => ctx.db.query('markets').collect());
    expect(markets).toHaveLength(0);

    const orders = await t.run(async (ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(2);
    expect(orders.every((order) => order.marketId === undefined)).toBe(true);
  });

  it('detects a duplicate import of the same bytes and does not duplicate orders', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const riderUserId = await createProfile(t, 'rider');
    await seedLiveEntries(t, riderUserId);

    const bytes = workbookBytes([
      ['2026-10-25', 'CMD-MATCH', 'cash', 'Store A', 'Livreur Test', 375.04],
      ['2026-10-25', 'CMD-MISMATCH', 'cash', 'Store A', 'Livreur Test', 40],
    ]);

    const admin = t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });

    const first = await admin.action(api.excelImport.importExcelFile, {
      storageId: await storeWorkbook(t, bytes),
      fileName: IMPORT_FILE_NAME,
    });
    expect(first.duplicateFile).toBe(false);
    if (first.duplicateFile) throw new Error('expected a fresh import');

    // Same content uploaded again (new storage object, same sha256 hash).
    const second = await admin.action(api.excelImport.importExcelFile, {
      storageId: await storeWorkbook(t, bytes),
      fileName: IMPORT_FILE_NAME,
    });
    expect(second.duplicateFile).toBe(true);
    expect(second.batchId).toEqual(first.batchId);
    if (!second.duplicateFile) throw new Error('expected a duplicate import');
    expect(second.reportDate).toBe(DAY_A);
    expect(second.summary.acceptedRows).toBe(2);

    const orders = await t.run(async (ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(2);

    const batches = await t.run(async (ctx) => ctx.db.query('importBatches').collect());
    expect(batches).toHaveLength(1);
  });

  it('rejects non-admin callers', async () => {
    const t = makeT();
    const riderUserId = await createProfile(t, 'rider');
    await seedLiveEntries(t, riderUserId);

    const bytes = workbookBytes([
      ['2026-10-25', 'CMD-MATCH', 'cash', 'Store A', 'Livreur Test', 375.04],
    ]);

    await expect(
      t
        .withIdentity({ subject: riderUserId, email: 'rider@bringo.test' })
        .action(api.excelImport.importExcelFile, {
          storageId: await storeWorkbook(t, bytes),
          fileName: IMPORT_FILE_NAME,
        })
    ).rejects.toThrow(/Forbidden/);

    const orders = await t.run(async (ctx) => ctx.db.query('orders').collect());
    expect(orders).toHaveLength(0);
  });
});
