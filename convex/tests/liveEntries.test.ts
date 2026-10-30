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
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: `${role}-${Math.random()}@bringo.test`,
    });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName: `${role} Test`,
      isActive,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

async function asRider(t: T) {
  const userId = await createProfile(t, 'rider');
  return {
    userId,
    client: t.withIdentity({ subject: userId, email: 'rider@bringo.test' }),
  };
}

async function createMarket(
  t: T,
  overrides: { name?: string; externalId?: string; isActive?: boolean } = {}
): Promise<Id<'markets'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('markets', {
      name: overrides.name ?? 'Marché Central',
      externalId: overrides.externalId ?? `MKT-${Math.random()}`,
      isActive: overrides.isActive ?? true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function storeFile(
  t: T,
  content = 'receipt',
  contentType = 'image/png'
): Promise<Id<'_storage'>> {
  return t.run(async (ctx) => {
    const blob = new Blob([content], { type: contentType });
    return ctx.storage.store(blob);
  });
}

const validReceiptFor = (storageId: Id<'_storage'>) => ({
  kind: 'tpe' as const,
  storageId,
  fileName: 'ticket.png',
  mimeType: 'image/png',
  size: 7,
});

describe('createLiveOrder', () => {
  it('creates a cash entry without a receipt and lists it for the rider', async () => {
    const t = makeT();
    const { client } = await asRider(t);
    const marketId = await createMarket(t, { name: 'Marché Anfa' });

    const result = await client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-001',
      marketId,
      amount: 12550,
      paymentMethod: 'cash',
    });

    expect(result.receiptId).toBeNull();

    const entries = await client.query(api.orders.getMyLiveEntries, {});
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      commandId: 'CMD-001',
      marketName: 'Marché Anfa',
      amount: 12550,
      paymentMethod: 'cash',
      receipts: [],
    });
  });

  it('requires a TPE receipt and stores it as pending review', async () => {
    const t = makeT();
    const { client } = await asRider(t);
    const marketId = await createMarket(t);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-TPE-1',
        marketId,
        amount: 5000,
        paymentMethod: 'tpe',
      })
    ).rejects.toThrow(/TPE receipt is required/);

    const storageId = await storeFile(t);
    await client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-TPE-1',
      marketId,
      amount: 5000,
      paymentMethod: 'tpe',
      receipt: validReceiptFor(storageId),
    });

    const entries = await client.query(api.orders.getMyLiveEntries, {});
    expect(entries[0].receipts).toHaveLength(1);
    expect(entries[0].receipts[0]).toMatchObject({
      kind: 'tpe',
      status: 'pending_review',
      fileName: 'ticket.png',
    });
  });

  it('accepts an optional bank deposit receipt for cash', async () => {
    const t = makeT();
    const { client } = await asRider(t);
    const marketId = await createMarket(t);
    const storageId = await storeFile(t);

    await client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-CASH-1',
      marketId,
      amount: 8000,
      paymentMethod: 'cash',
      receipt: {
        kind: 'bank_deposit',
        storageId,
        fileName: 'depot.png',
        mimeType: 'image/png',
        size: 7,
      },
    });

    const entries = await client.query(api.orders.getMyLiveEntries, {});
    expect(entries[0].receipts[0]).toMatchObject({ kind: 'bank_deposit' });
  });

  it('rejects mismatched receipt kinds and card receipts', async () => {
    const t = makeT();
    const { client } = await asRider(t);
    const marketId = await createMarket(t);
    const storageId = await storeFile(t);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-BAD-1',
        marketId,
        amount: 5000,
        paymentMethod: 'tpe',
        receipt: {
          kind: 'bank_deposit',
          storageId,
          fileName: 'depot.png',
          mimeType: 'image/png',
          size: 7,
        },
      })
    ).rejects.toThrow(/TPE payments require a TPE receipt/);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-BAD-2',
        marketId,
        amount: 5000,
        paymentMethod: 'card',
        receipt: validReceiptFor(storageId),
      })
    ).rejects.toThrow(/do not carry a receipt/);
  });

  it('validates amount, command, market state, and file metadata', async () => {
    const t = makeT();
    const { client } = await asRider(t);
    const activeMarket = await createMarket(t);
    const inactiveMarket = await createMarket(t, { isActive: false });
    const storageId = await storeFile(t);
    const unsupportedStorageId = await storeFile(t, 'receipt', 'text/plain');

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-1',
        marketId: activeMarket,
        amount: 0,
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-2',
        marketId: activeMarket,
        amount: 10.5,
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: '   ',
        marketId: activeMarket,
        amount: 1000,
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/Command number is required/);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-3',
        marketId: inactiveMarket,
        amount: 1000,
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/inactive/);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-4',
        marketId: activeMarket,
        amount: 1000,
        paymentMethod: 'tpe',
        receipt: { ...validReceiptFor(unsupportedStorageId), mimeType: 'text/plain' },
      })
    ).rejects.toThrow(/Unsupported receipt file type/);

    await expect(
      client.mutation(api.orders.createLiveOrder, {
        commandId: 'CMD-5',
        marketId: activeMarket,
        amount: 1000,
        paymentMethod: 'tpe',
        receipt: { ...validReceiptFor(storageId), size: 11 * 1024 * 1024 },
      })
    ).rejects.toThrow(/larger than 10 MB/);
  });

  it('blocks duplicate commands per rider and day, but not across riders', async () => {
    const t = makeT();
    const riderA = await asRider(t);
    const riderB = await asRider(t);
    const marketId = await createMarket(t);

    await riderA.client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-DUP',
      marketId,
      amount: 1000,
      paymentMethod: 'cash',
    });

    await expect(
      riderA.client.mutation(api.orders.createLiveOrder, {
        commandId: ' cmd-dup ',
        marketId,
        amount: 2000,
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/already been entered today/);

    await riderB.client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-DUP',
      marketId,
      amount: 1000,
      paymentMethod: 'cash',
    });

    expect(await riderB.client.query(api.orders.getMyLiveEntries, {})).toHaveLength(1);
  });

  it('keeps entries private to their rider', async () => {
    const t = makeT();
    const riderA = await asRider(t);
    const riderB = await asRider(t);
    const marketId = await createMarket(t);

    await riderA.client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-PRIVATE',
      marketId,
      amount: 3000,
      paymentMethod: 'cash',
    });

    expect(await riderB.client.query(api.orders.getMyLiveEntries, {})).toHaveLength(0);
  });

  it('rejects supervisors and admins from creating live entries', async () => {
    const t = makeT();
    const marketId = await createMarket(t);
    const supervisorId = await createProfile(t, 'supervisor');
    const adminId = await createProfile(t, 'admin');

    for (const actor of [
      t.withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' }),
      t.withIdentity({ subject: adminId, email: 'admin@bringo.test' }),
    ]) {
      await expect(
        actor.mutation(api.orders.createLiveOrder, {
          commandId: 'CMD-ROLE',
          marketId,
          amount: 1000,
          paymentMethod: 'cash',
        })
      ).rejects.toThrow(/Forbidden/);
    }
  });
});

describe('receipts', () => {
  it('hands upload URLs only to riders', async () => {
    const t = makeT();
    const rider = await asRider(t);
    const supervisorId = await createProfile(t, 'supervisor');

    const url = await rider.client.mutation(api.receipts.generateUploadUrl, {});
    expect(typeof url).toBe('string');

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .mutation(api.receipts.generateUploadUrl, {})
    ).rejects.toThrow(/Forbidden/);
  });

  it('attaches a cash deposit receipt later and enforces ownership', async () => {
    const t = makeT();
    const riderA = await asRider(t);
    const riderB = await asRider(t);
    const marketId = await createMarket(t);
    const storageId = await storeFile(t);

    const { liveEntryId } = await riderA.client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-LATER',
      marketId,
      amount: 7000,
      paymentMethod: 'cash',
    });

    await expect(
      riderB.client.mutation(api.receipts.uploadReceipt, {
        liveEntryId,
        kind: 'bank_deposit',
        storageId,
        fileName: 'depot.png',
        mimeType: 'image/png',
        size: 7,
      })
    ).rejects.toThrow(/not found/);

    await riderA.client.mutation(api.receipts.uploadReceipt, {
      liveEntryId,
      kind: 'bank_deposit',
      storageId,
      fileName: 'depot.png',
      mimeType: 'image/png',
      size: 7,
    });

    const entries = await riderA.client.query(api.orders.getMyLiveEntries, {});
    expect(entries[0].receipts).toHaveLength(1);
    expect(entries[0].receipts[0].kind).toBe('bank_deposit');

    const url = await riderA.client.query(api.receipts.getReceiptUrl, {
      receiptId: entries[0].receipts[0]._id,
    });
    expect(typeof url === 'string' || url === null).toBe(true);

    await expect(
      riderB.client.query(api.receipts.getReceiptUrl, {
        receiptId: entries[0].receipts[0]._id,
      })
    ).rejects.toThrow(/Forbidden/);
  });

  it('allows only one TPE receipt per entry', async () => {
    const t = makeT();
    const rider = await asRider(t);
    const marketId = await createMarket(t);
    const storageId = await storeFile(t);

    const { liveEntryId } = await rider.client.mutation(api.orders.createLiveOrder, {
      commandId: 'CMD-TPE-2',
      marketId,
      amount: 5000,
      paymentMethod: 'tpe',
      receipt: validReceiptFor(storageId),
    });

    await expect(
      rider.client.mutation(api.receipts.uploadReceipt, {
        liveEntryId,
        kind: 'tpe',
        storageId,
        fileName: 'second.png',
        mimeType: 'image/png',
        size: 7,
      })
    ).rejects.toThrow(/already attached/);
  });
});
