import { convexTest } from 'convex-test';
import type { Id } from '../../_generated/dataModel';
import schema from '../../schema';

type TestModules = Record<string, () => Promise<unknown>>;

export type TestRole = 'admin' | 'supervisor' | 'rider';
export type DepositStatus = 'pending_review' | 'submitted' | 'approved' | 'rejected';
export type TpeStatus = 'pending_review' | 'approved' | 'rejected';

export function makeT(modules: TestModules) {
  return convexTest({ schema, modules });
}

export type T = ReturnType<typeof makeT>;

export interface World {
  adminId: Id<'users'>;
  riderUserId: Id<'users'>;
  riderId: Id<'riders'>;
  marketId: Id<'markets'>;
  batchId: Id<'importBatches'>;
  sourceRowId: Id<'sourceRows'>;
  reportDate: number;
}

export async function createProfile(t: T, role: TestRole): Promise<Id<'users'>> {
  const displayName =
    role === 'rider' ? 'Livreur Test' : role === 'admin' ? 'Admin Test' : 'Supervisor Test';

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

export async function seedWorld(t: T, reportDate: number): Promise<World> {
  const adminId = await createProfile(t, 'admin');
  const riderUserId = await createProfile(t, 'rider');

  return t.run(async (ctx) => {
    const marketId = await ctx.db.insert('markets', {
      name: 'Marché Central',
      externalId: 'MKT-1',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const riderId = await ctx.db.insert('riders', {
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
      reportDate,
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

    return {
      adminId,
      riderUserId,
      riderId,
      marketId,
      batchId,
      sourceRowId,
      reportDate,
    };
  });
}

export async function addOrder(
  t: T,
  world: World,
  commandId: string,
  amount: number,
  deliveryDate = world.reportDate,
  paymentMethod: 'cash' | 'card' | 'online_payment' = 'cash'
): Promise<Id<'orders'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('orders', {
      commandId,
      deliveryDate,
      riderId: world.riderId,
      rawRiderName: 'Livreur Test',
      paymentMethod,
      amount,
      sourceRowId: world.sourceRowId,
      importBatchId: world.batchId,
      eligibilityStatus: 'eligible',
      createdAt: Date.now(),
    })
  );
}

export async function addCollection(
  t: T,
  world: World,
  amount: number,
  sourceReportDate: number,
  collectedAt: number
): Promise<Id<'cashCollections'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('cashCollections', {
      riderId: world.riderId,
      amount,
      collectedAt,
      collectedBy: world.adminId,
      sourceReportDate,
      isReversal: false,
      createdAt: Date.now(),
    })
  );
}

export async function addDeposit(
  t: T,
  world: World,
  amount: number,
  depositDate: number,
  status: DepositStatus
): Promise<Id<'bankDeposits'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('bankDeposits', {
      amount,
      depositDate,
      depositedBy: world.adminId,
      status,
      evidenceStorageIds: [],
      createdAt: Date.now(),
    })
  );
}

export async function addTpe(
  t: T,
  world: World,
  amount: number,
  receiptDate: number,
  status: TpeStatus
): Promise<Id<'tpeReceipts'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('tpeReceipts', {
      claimedAmount: amount,
      receiptDate,
      uploadedBy: world.adminId,
      status,
      evidenceStorageIds: [],
      createdAt: Date.now(),
    })
  );
}

export async function addLiveEntry(
  t: T,
  world: World,
  commandId: string,
  amount: number,
  entryDate = world.reportDate,
  paymentMethod: 'cash' | 'tpe' | 'card' = 'cash'
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
      paymentMethod,
      entryDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

export async function addLiveTpeReceipt(
  t: T,
  world: World,
  liveEntryId: Id<'liveEntries'>,
  status: TpeStatus
): Promise<Id<'liveEntryReceipts'>> {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['receipt'], { type: 'image/png' }));
    return ctx.db.insert('liveEntryReceipts', {
      liveEntryId,
      riderUserId: world.riderUserId,
      kind: 'tpe',
      storageId,
      fileName: 'ticket.png',
      mimeType: 'image/png',
      size: 7,
      status,
      createdAt: Date.now(),
    });
  });
}

export function adminClient(t: T, world: World) {
  return t.withIdentity({ subject: world.adminId, email: 'admin@bringo.test' });
}
