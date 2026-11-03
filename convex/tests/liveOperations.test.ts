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
type TestRole = 'admin' | 'supervisor' | 'rider';

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(
  t: T,
  role: TestRole,
  riderId?: Id<'riders'>
): Promise<{ userId: Id<'users'>; email: string }> {
  const email = `${role}-${Math.random()}@bringo.test`;
  const displayName =
    role === 'admin' ? 'Admin Test' : role === 'supervisor' ? 'Superviseur Test' : 'Livreur Test';

  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert('users', { email });
    await ctx.db.insert('userProfiles', {
      userId: uid,
      role,
      displayName,
      riderId,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return uid;
  });

  return { userId, email };
}

function client(t: T, user: { userId: Id<'users'>; email: string }) {
  return t.withIdentity({ subject: user.userId, email: user.email });
}

function storeReceipt(t: T) {
  return t.run(async (ctx) =>
    ctx.storage.store(new Blob(['receipt'], { type: 'image/png' }))
  );
}

describe('Milestone 6.6: Live Operations & Cash Chain of Custody', () => {
  it('Task 6.6.1: Live Mode Dashboard falls back to liveEntries when no orders exist', async () => {
    const t = makeT();
    const admin = await createProfile(t, 'admin');
    const rider = await createProfile(t, 'rider');
    const today = startOfDayCasablanca(Date.now());

    // Create a market and live entries for today
    const marketId = await t.run(async (ctx) =>
      ctx.db.insert('markets', {
        name: 'Marché Central',
        externalId: 'MKT-1',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await t.run(async (ctx) => {
      // Cash entry: 500 MAD (50000 centimes)
      await ctx.db.insert('liveEntries', {
        riderUserId: rider.userId,
        commandId: 'CMD-LIVE-1',
        commandKey: 'cmd-live-1',
        marketId,
        marketName: 'Marché Central',
        marketExternalId: 'MKT-1',
        amount: 50000,
        paymentMethod: 'cash',
        entryDate: today,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // TPE entry: 300 MAD (30000 centimes)
      await ctx.db.insert('liveEntries', {
        riderUserId: rider.userId,
        commandId: 'CMD-LIVE-2',
        commandKey: 'cmd-live-2',
        marketId,
        marketName: 'Marché Central',
        marketExternalId: 'MKT-1',
        amount: 30000,
        paymentMethod: 'tpe',
        entryDate: today,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const adminClient = client(t, admin);

    // Query supervisor dashboard
    const supervisorData = await adminClient.query(
      api.reconciliation.getSupervisorDashboardData,
      { reportDate: today }
    );

    expect(supervisorData.mode).toBe('live');
    expect(supervisorData.kpis.totalCashDue).toBe(50000);
    expect(supervisorData.kpis.totalCardDue).toBe(30000);
    expect(supervisorData.kpis.cashOutstanding).toBe(50000);
    expect(supervisorData.riders).toHaveLength(1);
    expect(supervisorData.riders[0].cashDue).toBe(50000);

    // Query admin dashboard
    const adminData = await adminClient.query(
      api.reconciliation.getAdminDashboardData,
      { fromDate: today, toDate: today }
    );

    expect(adminData.mode).toBe('live');
    expect(adminData.totals.cashDue).toBe(50000);
    expect(adminData.totals.cardDue).toBe(30000);
  });

  it('Task 6.6.3 & 6.6.4: Cash status transitions from Red to Yellow when supervisor collects cash into vault', async () => {
    const t = makeT();
    const supervisor = await createProfile(t, 'supervisor');

    // Create an Excel rider identity and link to rider profile
    const riderId = await t.run(async (ctx) =>
      ctx.db.insert('riders', {
        canonicalName: 'Livreur Yassine',
        aliases: ['Yassine'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const rider = await createProfile(t, 'rider', riderId);
    const today = startOfDayCasablanca(Date.now());

    const marketId = await t.run(async (ctx) =>
      ctx.db.insert('markets', {
        name: 'Marché Agdal',
        externalId: 'MKT-2',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    // Rider enters cash live entry for 750 MAD
    await t.run(async (ctx) => {
      await ctx.db.insert('liveEntries', {
        riderUserId: rider.userId,
        commandId: 'CMD-YASSINE-1',
        commandKey: 'cmd-yassine-1',
        marketId,
        marketName: 'Marché Agdal',
        marketExternalId: 'MKT-2',
        amount: 75000,
        paymentMethod: 'cash',
        entryDate: today,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const riderClient = client(t, rider);
    const supervisorClient = client(t, supervisor);

    // 1. Rider checks cash status -> RED (owes 750 MAD)
    const statusBefore = await riderClient.query(api.deposits.getRiderCashStatus, {});
    expect(statusBefore).toMatchObject({
      status: 'red',
      amount: 75000,
      cashDue: 75000,
      collected: 0,
    });

    // 2. Supervisor's vault is initially empty
    const vaultBefore = await supervisorClient.query(api.deposits.getSupervisorVault, {});
    expect(vaultBefore.totalHeld).toBe(0);
    expect(vaultBefore.heldCollections).toHaveLength(0);

    // 3. Supervisor collects 750 MAD from rider
    const collectionId = await supervisorClient.mutation(api.deposits.createCashCollection, {
      riderId,
      amount: 75000,
      sourceReportDate: today,
    });

    // Check collection cashStatus
    const colDoc = await t.run(async (ctx) => ctx.db.get(collectionId));
    expect(colDoc).toMatchObject({
      amount: 75000,
      cashStatus: 'held_by_supervisor',
      status: 'confirmed',
    });

    // 4. Supervisor's vault now holds 750 MAD
    const vaultAfter = await supervisorClient.query(api.deposits.getSupervisorVault, {});
    expect(vaultAfter.totalHeld).toBe(75000);
    expect(vaultAfter.heldCollections).toHaveLength(1);
    expect(vaultAfter.heldCollections[0]).toMatchObject({
      collectionId,
      amount: 75000,
      riderName: 'Livreur Yassine',
      cashStatus: 'held_by_supervisor',
    });

    // 5. Rider checks cash status -> turns YELLOW (in supervisor hands, waiting for bank deposit)
    const statusAfter = await riderClient.query(api.deposits.getRiderCashStatus, {});
    expect(statusAfter).toMatchObject({
      status: 'yellow',
      amount: 75000,
      cashDue: 75000,
      collected: 75000,
    });
  });

  it('Task 6.6.5 & 6.6.6: Supervisor creates Bulk Bank Deposit covering multiple riders and Admin approves it', async () => {
    const t = makeT();
    const admin = await createProfile(t, 'admin');
    const supervisor = await createProfile(t, 'supervisor');

    // Create 2 riders
    const riderId1 = await t.run(async (ctx) =>
      ctx.db.insert('riders', {
        canonicalName: 'Rider One',
        aliases: ['One'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const rider1 = await createProfile(t, 'rider', riderId1);

    const riderId2 = await t.run(async (ctx) =>
      ctx.db.insert('riders', {
        canonicalName: 'Rider Two',
        aliases: ['Two'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const rider2 = await createProfile(t, 'rider', riderId2);

    const supervisorClient = client(t, supervisor);
    const adminClient = client(t, admin);
    const rider1Client = client(t, rider1);
    const rider2Client = client(t, rider2);

    // Supervisor collects 10,000 MAD from Rider 1 and 5,000 MAD from Rider 2
    const col1 = await supervisorClient.mutation(api.deposits.createCashCollection, {
      riderId: riderId1,
      amount: 1000000, // 10,000 MAD
    });

    const col2 = await supervisorClient.mutation(api.deposits.createCashCollection, {
      riderId: riderId2,
      amount: 500000, // 5,000 MAD
    });

    // Supervisor creates bulk bank deposit for 15,000 MAD covering both riders
    const storageId = await storeReceipt(t);
    const depositId = await supervisorClient.mutation(api.deposits.createBulkBankDeposit, {
      amount: 1500000, // 15,000 MAD
      storageId,
      collectionIds: [col1, col2],
      bankReference: 'REF-BANK-BULK-001',
    });

    // Verify deposit document
    const depositDoc = await t.run(async (ctx) => ctx.db.get(depositId));
    expect(depositDoc).toMatchObject({
      amount: 1500000,
      expectedAmount: 1500000,
      isBulk: true,
      status: 'pending_review',
      collectionIds: [col1, col2],
    });

    // Verify collections transitioned to 'deposited_pending'
    const col1After = await t.run(async (ctx) => ctx.db.get(col1));
    const col2After = await t.run(async (ctx) => ctx.db.get(col2));
    expect(col1After?.cashStatus).toBe('deposited_pending');
    expect(col2After?.cashStatus).toBe('deposited_pending');
    expect(col1After?.linkedDepositId).toBe(depositId);
    expect(col2After?.linkedDepositId).toBe(depositId);

    // Supervisor vault shows 0 held, 15,000 pending
    const vault = await supervisorClient.query(api.deposits.getSupervisorVault, {});
    expect(vault.totalHeld).toBe(0);
    expect(vault.totalPending).toBe(1500000);

    // Admin pending review queue shows the bulk deposit with chain of custody
    const pendingDeposits = await adminClient.query(api.deposits.listPendingBankDeposits, {});
    const bulkPending = pendingDeposits.find((d) => d.depositId === depositId);
    expect(bulkPending).toBeDefined();
    expect(bulkPending?.isBulk).toBe(true);
    expect(bulkPending?.collections).toHaveLength(2);
    expect(bulkPending?.collections.map((c) => c.riderName)).toEqual(
      expect.arrayContaining(['Rider One', 'Rider Two'])
    );

    // Admin approves the bulk bank deposit
    await adminClient.mutation(api.deposits.reviewBankDeposit, {
      depositId,
      action: 'approve',
    });

    // Deposit is now approved
    const approvedDeposit = await t.run(async (ctx) => ctx.db.get(depositId));
    expect(approvedDeposit?.status).toBe('approved');
    expect(approvedDeposit?.shortfallAmount).toBe(0);

    // Collections are now 'cleared'
    const col1Cleared = await t.run(async (ctx) => ctx.db.get(col1));
    const col2Cleared = await t.run(async (ctx) => ctx.db.get(col2));
    expect(col1Cleared?.cashStatus).toBe('cleared');
    expect(col2Cleared?.cashStatus).toBe('cleared');

    // Riders' cash statuses are now green (cleared)
    const rider1Status = await rider1Client.query(api.deposits.getRiderCashStatus, {});
    const rider2Status = await rider2Client.query(api.deposits.getRiderCashStatus, {});
    expect(rider1Status?.status).toBe('green');
    expect(rider2Status?.status).toBe('green');

    // Supervisor vault is fully cleared (0 held, 0 pending)
    const vaultFinal = await supervisorClient.query(api.deposits.getSupervisorVault, {});
    expect(vaultFinal.totalHeld).toBe(0);
    expect(vaultFinal.totalPending).toBe(0);
  });

  it('Task 6.6.6: Admin rejection reverts collections back to held_by_supervisor in vault', async () => {
    const t = makeT();
    const admin = await createProfile(t, 'admin');
    const supervisor = await createProfile(t, 'supervisor');

    const riderId = await t.run(async (ctx) =>
      ctx.db.insert('riders', {
        canonicalName: 'Rider Rejection Test',
        aliases: ['Rejection'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const supervisorClient = client(t, supervisor);
    const adminClient = client(t, admin);

    const colId = await supervisorClient.mutation(api.deposits.createCashCollection, {
      riderId,
      amount: 400000,
    });

    const storageId = await storeReceipt(t);
    const depositId = await supervisorClient.mutation(api.deposits.createBulkBankDeposit, {
      amount: 400000,
      storageId,
      collectionIds: [colId],
    });

    // Reject the deposit
    await adminClient.mutation(api.deposits.reviewBankDeposit, {
      depositId,
      action: 'reject',
      reason: 'Bordereau illisible',
    });

    // Collection reverts to 'held_by_supervisor' and unlinks
    const colAfterReject = await t.run(async (ctx) => ctx.db.get(colId));
    expect(colAfterReject?.cashStatus).toBe('held_by_supervisor');
    expect(colAfterReject?.linkedDepositId).toBeUndefined();

    // Supervisor vault has the cash back as held
    const vault = await supervisorClient.query(api.deposits.getSupervisorVault, {});
    expect(vault.totalHeld).toBe(400000);
    expect(vault.totalPending).toBe(0);
  });

  it('Task 6.6.2: Rider 360 view includes cashObligation and todayCollections', async () => {
    const t = makeT();
    const admin = await createProfile(t, 'admin');

    const riderId = await t.run(async (ctx) =>
      ctx.db.insert('riders', {
        canonicalName: 'Rider 360 Test',
        aliases: ['360'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const rider = await createProfile(t, 'rider', riderId);

    const supervisor = await createProfile(t, 'supervisor');
    const supervisorClient = client(t, supervisor);

    // Collect cash from rider
    await supervisorClient.mutation(api.deposits.createCashCollection, {
      riderId,
      amount: 35000,
    });

    const adminClient = client(t, admin);
    const profileData = await adminClient.query(api.users.getRiderProfileData, {
      riderUserId: rider.userId,
    });

    expect(profileData).toBeDefined();
    expect(profileData?.cashObligation).toBeDefined();
    expect(profileData?.cashObligation.totalCollected).toBe(35000);
    expect(profileData?.cashObligation.heldBySupervisor).toBe(35000);
    expect(profileData?.todayCollections).toHaveLength(1);
    expect(profileData?.todayCollections[0].amount).toBe(35000);
  });
});
