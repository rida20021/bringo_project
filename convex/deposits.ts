import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { FilterBuilder, Expression } from 'convex/server';
import type { DataModel, Id } from './_generated/dataModel';
import { requireAdmin, requireAppUser, requireRider, requireSupervisor } from './lib/auth';
import type { DbCtx } from './lib/auth';
import { insertAuditEvent } from './audit';
import { liveEntryDateCasablanca, startOfDayCasablanca } from './lib/dates';

interface DepositExpectation {
  sourceReportDate: number;
  totalCollected: number;
  totalDeposited: number;
  expectedAmount: number;
}

/**
 * Cash expected for a rider's report day, calculated server-side so supervisors
 * cannot edit it. Previous non-rejected deposits for the same rider and day are
 * deducted so each new deposit is compared against the remaining obligation.
 */
async function calculateDepositExpectation(
  ctx: DbCtx,
  riderId: Id<'riders'>,
  reportDate: number
): Promise<DepositExpectation> {
  const sourceReportDate = startOfDayCasablanca(reportDate);

  const collections = await ctx.db
    .query('cashCollections')
    .withIndex('riderId', (q) => q.eq('riderId', riderId))
    .collect();
  const totalCollected = collections
    .filter(
      (collection) =>
        !collection.isReversal && collection.sourceReportDate === sourceReportDate
    )
    .reduce((sum, collection) => sum + collection.amount, 0);

  const deposits = await ctx.db
    .query('bankDeposits')
    .withIndex('riderId', (q) => q.eq('riderId', riderId))
    .collect();
  const totalDeposited = deposits
    .filter(
      (deposit) =>
        deposit.sourceReportDate === sourceReportDate && deposit.status !== 'rejected'
    )
    .reduce((sum, deposit) => sum + deposit.amount, 0);

  return {
    sourceReportDate,
    totalCollected,
    totalDeposited,
    expectedAmount: Math.max(0, totalCollected - totalDeposited),
  };
}

/**
 * Supervisor or Admin records cash physically collected from a rider.
 * `sourceReportDate` is normalized to the start of its Casablanca day so the
 * "Encaissé" KPI can match it against the selected report date.
 */
export const createCashCollection = mutation({
  args: {
    riderId: v.id('riders'),
    amount: v.number(),
    sourceReportDate: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appUser = await requireSupervisor(ctx);

    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
      throw new Error('Amount must be a positive integer number of centimes');
    }
    if (args.sourceReportDate !== undefined && !Number.isFinite(args.sourceReportDate)) {
      throw new Error('Invalid report date');
    }

    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error('Rider not found');

    const now = Date.now();
    const sourceReportDate =
      args.sourceReportDate !== undefined
        ? startOfDayCasablanca(args.sourceReportDate)
        : liveEntryDateCasablanca(now);

    const collectionId = await ctx.db.insert('cashCollections', {
      riderId: args.riderId,
      amount: args.amount,
      collectedAt: now,
      collectedBy: appUser.userId,
      note: args.note?.trim() || undefined,
      sourceReportDate,
      isReversal: false,
      status: 'confirmed',
      cashStatus: 'held_by_supervisor',
      createdAt: now,
    });

    await insertAuditEvent(ctx, {
      actorId: appUser.userId,
      action: 'collection.created',
      targetType: 'cashCollections',
      targetId: collectionId,
      afterSummary: {
        amount: args.amount,
        riderId: args.riderId,
        sourceReportDate,
        status: 'confirmed',
        cashStatus: 'held_by_supervisor',
      },
    });

    return collectionId;
  },
});

/**
 * Supervisor or Admin records a bank deposit tied to a rider.
 * Takes the rider ID, deposit amount in centimes, a single receipt storage ID,
 * and the cash report day the deposit settles. The expected amount is always
 * calculated server-side from confirmed cash collections; it is never supplied
 * by the client. The deposit is inserted with `pending_review` status for
 * admin approval.
 */
export const createBankDeposit = mutation({
  args: {
    riderId: v.id('riders'),
    amount: v.number(),
    storageId: v.id('_storage'),
    sourceReportDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const appUser = await requireSupervisor(ctx);

    if (args.amount <= 0) throw new Error('Amount must be greater than zero');
    if (args.sourceReportDate !== undefined && !Number.isFinite(args.sourceReportDate)) {
      throw new Error('Invalid report date');
    }

    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error('Rider not found');

    const stored = await ctx.db.system.get('_storage', args.storageId);
    if (!stored) throw new Error('Receipt file not found in storage');

    const sourceReportDate = startOfDayCasablanca(args.sourceReportDate ?? Date.now());
    const expectation = await calculateDepositExpectation(
      ctx,
      args.riderId,
      sourceReportDate
    );

    const depositId = await ctx.db.insert('bankDeposits', {
      amount: args.amount,
      depositDate: Date.now(),
      depositedBy: appUser.userId,
      riderId: args.riderId,
      sourceReportDate,
      expectedAmount: expectation.expectedAmount,
      status: 'pending_review',
      evidenceStorageIds: [args.storageId],
      createdAt: Date.now(),
    });

    await insertAuditEvent(ctx, {
      actorId: appUser.userId,
      action: 'deposit.created',
      targetType: 'bankDeposits',
      targetId: depositId,
      afterSummary: {
        amount: args.amount,
        riderId: args.riderId,
        sourceReportDate,
        expectedAmount: expectation.expectedAmount,
        status: 'pending_review',
      },
    });

    return depositId;
  },
});

/**
 * Server-calculated expectation shown on the Supervisor's deposit form.
 * The amount is derived from `cashCollections`; the client only supplies the
 * rider and report day and cannot override the result.
 */
export const getDepositExpectation = query({
  args: {
    riderId: v.id('riders'),
    sourceReportDate: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);

    if (!Number.isFinite(args.sourceReportDate)) {
      throw new Error('Invalid report date');
    }

    const rider = await ctx.db.get(args.riderId);
    if (!rider) throw new Error('Rider not found');

    return calculateDepositExpectation(ctx, args.riderId, args.sourceReportDate);
  },
});

export const reviewBankDeposit = mutation({
  args: {
    depositId: v.id('bankDeposits'),
    action: v.union(v.literal('approve'), v.literal('reject')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appUser = await requireAdmin(ctx);

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) throw new Error('Deposit not found');
    if (deposit.status !== 'submitted' && deposit.status !== 'pending_review') {
      throw new Error('Deposit is not awaiting review');
    }

    const reason = args.reason?.trim();
    if (args.action === 'reject' && !reason) throw new Error('A rejection reason is required');

    if (args.action === 'approve') {
      const shortfallAmount =
        deposit.expectedAmount === undefined
          ? undefined
          : Math.max(0, deposit.expectedAmount - deposit.amount);

      await ctx.db.patch(args.depositId, {
        status: 'approved',
        reviewedBy: appUser.userId,
        reviewedAt: Date.now(),
        ...(shortfallAmount === undefined ? {} : { shortfallAmount }),
      });

      // Clear all collections covered by this bulk deposit
      if (deposit.collectionIds && deposit.collectionIds.length > 0) {
        for (const colId of deposit.collectionIds) {
          const col = await ctx.db.get(colId);
          if (col) {
            await ctx.db.patch(colId, { cashStatus: 'cleared' });
          }
        }
      }

      if (shortfallAmount !== undefined && shortfallAmount > 0) {
        const supervisorProfile = await ctx.db
          .query('userProfiles')
          .withIndex('userId', (q) => q.eq('userId', deposit.depositedBy))
          .unique();
        if (!supervisorProfile) {
          throw new Error('Depositor profile not found');
        }

        const previousBalance = supervisorProfile.debtBalance ?? 0;
        const debtBalance = previousBalance + shortfallAmount;

        await ctx.db.patch(supervisorProfile._id, {
          debtBalance,
          updatedAt: Date.now(),
        });

        await insertAuditEvent(ctx, {
          actorId: appUser.userId,
          action: 'supervisor.debt_recorded',
          targetType: 'users',
          targetId: deposit.depositedBy,
          reason: 'Écart de dépôt bancaire',
          beforeSummary: { debtBalance: previousBalance },
          afterSummary: {
            debtBalance,
            shortfallAmount,
            expectedAmount: deposit.expectedAmount,
            depositAmount: deposit.amount,
            depositId: deposit._id,
            sourceReportDate: deposit.sourceReportDate,
          },
        });
      }
    } else {
      await ctx.db.patch(args.depositId, {
        status: 'rejected',
        reviewedBy: appUser.userId,
        reviewedAt: Date.now(),
        rejectionReason: reason,
      });

      // Revert collections back to held_by_supervisor for bulk deposit
      if (deposit.collectionIds && deposit.collectionIds.length > 0) {
        for (const colId of deposit.collectionIds) {
          const col = await ctx.db.get(colId);
          if (col) {
            await ctx.db.patch(colId, {
              cashStatus: 'held_by_supervisor',
              linkedDepositId: undefined,
            });
          }
        }
      }
    }
  },
});

export const getBankDeposits = query({
  args: {
    status: v.optional(v.union(v.literal('pending_review'), v.literal('submitted'), v.literal('approved'), v.literal('rejected'))),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const limit = Math.min(args.limit ?? 200, 500);
    const fromDate = args.fromDate;
    const toDate = args.toDate;

    const applyDateFilters = (q: FilterBuilder<DataModel['bankDeposits']>) => {
      const conditions: Expression<boolean>[] = [];
      if (fromDate !== undefined) conditions.push(q.gte(q.field('depositDate'), fromDate));
      if (toDate !== undefined) conditions.push(q.lte(q.field('depositDate'), toDate));
      return conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : q.and(...conditions);
    };

    if (args.status) {
      return ctx.db
        .query('bankDeposits')
        .withIndex('status', (q) => q.eq('status', args.status!))
        .filter(applyDateFilters)
        .order('desc')
        .take(limit);
    }

    return ctx.db.query('bankDeposits').filter(applyDateFilters).order('desc').take(limit);
  },
});

export const getDepositAllocations = query({
  args: { depositId: v.id('bankDeposits') },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    return ctx.db
      .query('depositAllocations')
      .withIndex('depositId', (q) => q.eq('depositId', args.depositId))
      .collect();
  },
});

/**
 * Review queue for supervisor-recorded bank deposits. Supervisors and admins
 * may read it; only admins may approve or reject. Enriches each row with the
 * supervisor/rider names and a signed URL for the receipt.
 */
export const listPendingBankDeposits = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);

    const requestedLimit = args.limit ?? 50;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
      : 50;

    // `reviewBankDeposit` accepts both statuses, and the KPI counts both.
    const statuses = ['pending_review', 'submitted'] as const;
    const deposits = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query('bankDeposits')
            .withIndex('status', (q) => q.eq('status', status))
            .order('desc')
            .take(limit)
        )
      )
    ).flat();

    const rows = await Promise.all(
      deposits.map(async (deposit) => {
        const supervisor = await ctx.db.get(deposit.depositedBy);
        const supervisorProfile = await ctx.db
          .query('userProfiles')
          .withIndex('userId', (q) => q.eq('userId', deposit.depositedBy))
          .unique();
        const rider = deposit.riderId ? await ctx.db.get(deposit.riderId) : null;
        const receiptUrl =
          deposit.evidenceStorageIds.length > 0
            ? await ctx.storage.getUrl(deposit.evidenceStorageIds[0])
            : null;

        const isBulk = deposit.isBulk === true;
        const collections = deposit.collectionIds
          ? (
              await Promise.all(
                deposit.collectionIds.map(async (cid) => {
                  const c = await ctx.db.get(cid);
                  if (!c) return null;
                  const r = await ctx.db.get(c.riderId);
                  return {
                    collectionId: c._id,
                    riderId: c.riderId,
                    riderName: r?.canonicalName ?? 'Livreur inconnu',
                    amount: c.amount,
                    collectedAt: c.collectedAt,
                  };
                })
              )
            ).filter((c): c is NonNullable<typeof c> => c !== null)
          : [];

        return {
          depositId: deposit._id,
          amount: deposit.amount,
          depositDate: deposit.depositDate,
          createdAt: deposit.createdAt,
          status: deposit.status,
          sourceReportDate: deposit.sourceReportDate ?? null,
          expectedAmount: deposit.expectedAmount ?? null,
          shortfallAmount: deposit.shortfallAmount ?? null,
          isBulk,
          receiptUrl,
          collections,
          supervisor: {
            userId: deposit.depositedBy,
            displayName:
              supervisorProfile?.displayName ??
              supervisor?.name ??
              supervisor?.email ??
              'Superviseur',
            email: supervisor?.email ?? null,
          },
          rider: rider ? { riderId: rider._id, name: rider.canonicalName } : null,
        };
      })
    );

    return rows.sort((a, b) => b.depositDate - a.depositDate).slice(0, limit);
  },
});

/**
 * Supervisor records a single bulk bank deposit covering multiple cash collections.
 * Takes the total deposit amount, a single receipt storage ID, and the list of
 * collection IDs covered by this deposit.
 * Transitions all collections from 'held_by_supervisor' to 'deposited_pending'.
 */
export const createBulkBankDeposit = mutation({
  args: {
    amount: v.number(),
    storageId: v.id('_storage'),
    collectionIds: v.array(v.id('cashCollections')),
    bankReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appUser = await requireSupervisor(ctx);

    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
      throw new Error('Le montant du dépôt doit être supérieur à 0');
    }

    const uniqueCollectionIds = Array.from(new Set(args.collectionIds));
    if (uniqueCollectionIds.length === 0) {
      throw new Error('Sélectionnez au moins un encaissement');
    }

    const stored = await ctx.db.system.get('_storage', args.storageId);
    if (!stored) throw new Error('Receipt file not found in storage');

    // Fetch and validate each collection
    const collections = await Promise.all(
      uniqueCollectionIds.map(async (id) => {
        const col = await ctx.db.get(id);
        if (!col) throw new Error(`Encaissement introuvable`);
        if (col.isReversal) throw new Error('Impossible d’inclure une annulation dans un dépôt');
        if (col.cashStatus && col.cashStatus !== 'held_by_supervisor') {
          throw new Error('Certains encaissements sélectionnés ne sont plus disponibles en caisse');
        }
        return col;
      })
    );

    const expectedAmount = collections.reduce((sum, c) => sum + c.amount, 0);
    const riderIds = Array.from(new Set(collections.map((c) => c.riderId)));
    const now = Date.now();

    const depositId = await ctx.db.insert('bankDeposits', {
      amount: args.amount,
      depositDate: now,
      depositedBy: appUser.userId,
      riderId: riderIds.length === 1 ? riderIds[0] : undefined,
      riderIds,
      collectionIds: uniqueCollectionIds,
      isBulk: true,
      expectedAmount,
      bankReference: args.bankReference?.trim() || undefined,
      status: 'pending_review',
      evidenceStorageIds: [args.storageId],
      createdAt: now,
    });

    for (const col of collections) {
      await ctx.db.patch(col._id, {
        cashStatus: 'deposited_pending',
        linkedDepositId: depositId,
      });
    }

    await insertAuditEvent(ctx, {
      actorId: appUser.userId,
      action: 'supervisor.bulk_deposit_created',
      targetType: 'bankDeposits',
      targetId: depositId,
      afterSummary: {
        amount: args.amount,
        expectedAmount,
        collectionCount: collections.length,
        riderCount: riderIds.length,
        isBulk: true,
      },
    });

    return depositId;
  },
});

/**
 * Returns the Supervisor's physical Vault: all collections currently held by
 * this supervisor (`held_by_supervisor`) and any pending bank deposits
 * (`deposited_pending`).
 */
export const getSupervisorVault = query({
  args: {},
  handler: async (ctx) => {
    const appUser = await requireSupervisor(ctx);

    const allCollections = await ctx.db
      .query('cashCollections')
      .withIndex('collectedBy', (q) => q.eq('collectedBy', appUser.userId))
      .collect();

    const activeCollections = allCollections.filter(
      (c) =>
        !c.isReversal &&
        (c.cashStatus === 'held_by_supervisor' ||
          c.cashStatus === 'deposited_pending' ||
          (c.cashStatus === undefined && c.status === 'confirmed'))
    );

    const enriched = await Promise.all(
      activeCollections.map(async (c) => {
        const rider = await ctx.db.get(c.riderId);
        return {
          collectionId: c._id,
          riderId: c.riderId,
          riderName: rider?.canonicalName ?? 'Livreur inconnu',
          amount: c.amount,
          collectedAt: c.collectedAt,
          sourceReportDate: c.sourceReportDate,
          cashStatus: (c.cashStatus ?? 'held_by_supervisor') as
            | 'held_by_supervisor'
            | 'deposited_pending'
            | 'cleared',
          linkedDepositId: c.linkedDepositId ?? null,
          note: c.note ?? null,
        };
      })
    );

    const heldCollections = enriched.filter((c) => c.cashStatus === 'held_by_supervisor');
    const pendingCollections = enriched.filter((c) => c.cashStatus === 'deposited_pending');

    const totalHeld = heldCollections.reduce((sum, c) => sum + c.amount, 0);
    const totalPending = pendingCollections.reduce((sum, c) => sum + c.amount, 0);

    return {
      totalHeld,
      totalPending,
      heldCollections: heldCollections.sort((a, b) => b.collectedAt - a.collectedAt),
      pendingCollections: pendingCollections.sort((a, b) => b.collectedAt - a.collectedAt),
      allVaultItems: enriched.sort((a, b) => b.collectedAt - a.collectedAt),
    };
  },
});

/**
 * Dynamic cash obligation status for the current logged-in rider.
 * Computes:
 * - Red banner: Rider owes physical cash to company (orders/live entries > collections)
 * - Yellow banner: Cash handed to supervisor, awaiting bank deposit or admin approval
 * - Green / Hidden: Fully cleared
 */
export const getRiderCashStatus = query({
  args: {},
  handler: async (ctx) => {
    const appUser = await requireRider(ctx);
    const profile = appUser.profile;
    if (!profile) return null;

    const riderId = profile.riderId;

    // 1. Calculate total cash due from orders if riderId exists
    let totalCashOrders = 0;
    const datesWithOrders = new Set<number>();

    if (riderId) {
      const orders = await ctx.db
        .query('orders')
        .withIndex('riderId', (q) => q.eq('riderId', riderId))
        .filter((q) =>
          q.and(
            q.eq(q.field('paymentMethod'), 'cash'),
            q.eq(q.field('eligibilityStatus'), 'eligible')
          )
        )
        .collect();

      for (const order of orders) {
        totalCashOrders += order.amount;
        datesWithOrders.add(order.deliveryDate);
      }
    }

    // 2. Add cash from liveEntries for days that do NOT have orders imported yet (e.g. today)
    const liveEntries = await ctx.db
      .query('liveEntries')
      .withIndex('riderUserId', (q) => q.eq('riderUserId', appUser.userId))
      .filter((q) => q.eq(q.field('paymentMethod'), 'cash'))
      .collect();

    let liveCashWithoutOrders = 0;
    for (const entry of liveEntries) {
      if (!datesWithOrders.has(entry.entryDate)) {
        liveCashWithoutOrders += entry.amount;
      }
    }

    const totalCashDue = totalCashOrders + liveCashWithoutOrders;

    // 3. Calculate collections for this rider
    let totalCollected = 0;
    let pendingSupervisorCash = 0;
    let pendingBankCash = 0;

    if (riderId) {
      const collections = await ctx.db
        .query('cashCollections')
        .withIndex('riderId', (q) => q.eq('riderId', riderId))
        .filter((q) => q.eq(q.field('isReversal'), false))
        .collect();

      for (const col of collections) {
        totalCollected += col.amount;
        if (col.cashStatus === 'held_by_supervisor') {
          pendingSupervisorCash += col.amount;
        } else if (col.cashStatus === 'deposited_pending') {
          pendingBankCash += col.amount;
        }
      }
    }

    const cashOwed = Math.max(0, totalCashDue - totalCollected);
    const totalPending = pendingSupervisorCash + pendingBankCash;

    if (cashOwed > 0) {
      return {
        status: 'red' as const,
        amount: cashOwed,
        message: 'Vous devez remettre l’espèce à votre superviseur.',
        cashDue: totalCashDue,
        collected: totalCollected,
      };
    }

    if (totalPending > 0) {
      const message =
        pendingBankCash > 0
          ? 'Remis au superviseur · Dépôt bancaire en cours de validation.'
          : 'Remis au superviseur · En attente du dépôt bancaire.';
      return {
        status: 'yellow' as const,
        amount: totalPending,
        message,
        cashDue: totalCashDue,
        collected: totalCollected,
      };
    }

    return {
      status: 'green' as const,
      amount: 0,
      message: 'Situation soldée.',
      cashDue: totalCashDue,
      collected: totalCollected,
    };
  },
});

/** Detailed view of a bulk deposit for admin review modal / audit */
export const getBulkDepositDetails = query({
  args: { depositId: v.id('bankDeposits') },
  handler: async (ctx, args) => {
    await requireSupervisor(ctx);

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) throw new Error('Deposit not found');

    const supervisor = await ctx.db.get(deposit.depositedBy);
    const supervisorProfile = await ctx.db
      .query('userProfiles')
      .withIndex('userId', (q) => q.eq('userId', deposit.depositedBy))
      .unique();

    const collections = deposit.collectionIds
      ? (
          await Promise.all(
            deposit.collectionIds.map(async (cid) => {
              const c = await ctx.db.get(cid);
              if (!c) return null;
              const r = await ctx.db.get(c.riderId);
              return {
                collectionId: c._id,
                riderId: c.riderId,
                riderName: r?.canonicalName ?? 'Livreur inconnu',
                amount: c.amount,
                collectedAt: c.collectedAt,
                cashStatus: c.cashStatus,
              };
            })
          )
        ).filter((c): c is NonNullable<typeof c> => c !== null)
      : [];

    const receiptUrl =
      deposit.evidenceStorageIds.length > 0
        ? await ctx.storage.getUrl(deposit.evidenceStorageIds[0])
        : null;

    return {
      deposit: {
        _id: deposit._id,
        amount: deposit.amount,
        expectedAmount: deposit.expectedAmount,
        shortfallAmount: deposit.shortfallAmount,
        status: deposit.status,
        depositDate: deposit.depositDate,
        bankReference: deposit.bankReference,
        isBulk: deposit.isBulk === true,
        receiptUrl,
        supervisorName:
          supervisorProfile?.displayName ?? supervisor?.name ?? supervisor?.email ?? 'Superviseur',
      },
      collections,
    };
  },
});

