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

async function createProfile(t: T, role: TestRole): Promise<Id<'users'>> {
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
      isActive: true,
      debtBalance: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return userId;
  });
}

function getProfile(t: T, userId: Id<'users'>) {
  return t.run(async (ctx) =>
    ctx.db.query('userProfiles').withIndex('userId', (q) => q.eq('userId', userId)).unique()
  );
}

function client(t: T, userId: Id<'users'>, email: string) {
  return t.withIdentity({ subject: userId, email });
}

describe('recordRiderLoss', () => {
  it('adds a loss to the rider debt balance and writes an audit event', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const riderId = await createProfile(t, 'rider');
    const admin = client(t, adminId, 'admin@bringo.test');
    const reportInstant = Date.UTC(2026, 10, 2, 18, 45);

    const result = await admin.mutation(api.debt.recordRiderLoss, {
      riderUserId: riderId,
      amount: 12500,
      reason: '  Espèces perdues  ',
      sourceReportDate: reportInstant,
    });

    expect(result.debtBalance).toBe(12500);
    expect(await getProfile(t, riderId)).toMatchObject({ debtBalance: 12500 });

    const events = await admin.query(api.audit.getAuditEvents, {
      targetType: 'users',
      targetId: riderId,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'rider.debt_recorded',
      actorId: adminId,
      targetId: riderId,
      reason: 'Espèces perdues',
      beforeSummary: { debtBalance: 0 },
      afterSummary: {
        debtBalance: 12500,
        amount: 12500,
        sourceReportDate: startOfDayCasablanca(reportInstant),
      },
    });
  });

  it('accumulates multiple losses and exposes the balance in the team directory', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const riderId = await createProfile(t, 'rider');
    const admin = client(t, adminId, 'admin@bringo.test');
    const sourceReportDate = Date.UTC(2026, 10, 2, 12);

    await admin.mutation(api.debt.recordRiderLoss, {
      riderUserId: riderId,
      amount: 4000,
      reason: 'Première perte',
      sourceReportDate,
    });
    await admin.mutation(api.debt.recordRiderLoss, {
      riderUserId: riderId,
      amount: 2500,
      reason: 'Deuxième perte',
      sourceReportDate,
    });

    expect((await getProfile(t, riderId))?.debtBalance).toBe(6500);

    const members = await admin.query(api.users.listTeamMembers, {});
    expect(members.find((member) => member.userId === riderId)?.debtBalance).toBe(6500);
  });

  it('rejects supervisors, non-riders, invalid amounts and blank reasons', async () => {
    const t = makeT();
    const adminId = await createProfile(t, 'admin');
    const supervisorId = await createProfile(t, 'supervisor');
    const riderId = await createProfile(t, 'rider');
    const admin = client(t, adminId, 'admin@bringo.test');
    const supervisor = client(t, supervisorId, 'supervisor@bringo.test');
    const sourceReportDate = Date.UTC(2026, 10, 2, 12);

    await expect(
      supervisor.mutation(api.debt.recordRiderLoss, {
        riderUserId: riderId,
        amount: 1000,
        reason: 'Non autorisé',
        sourceReportDate,
      })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      admin.mutation(api.debt.recordRiderLoss, {
        riderUserId: supervisorId,
        amount: 1000,
        reason: 'Mauvais rôle',
        sourceReportDate,
      })
    ).rejects.toThrow(/rider/);

    await expect(
      admin.mutation(api.debt.recordRiderLoss, {
        riderUserId: riderId,
        amount: 0,
        reason: 'Montant nul',
        sourceReportDate,
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      admin.mutation(api.debt.recordRiderLoss, {
        riderUserId: riderId,
        amount: 12.5,
        reason: 'Montant fractionnaire',
        sourceReportDate,
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      admin.mutation(api.debt.recordRiderLoss, {
        riderUserId: riderId,
        amount: 1000,
        reason: '   ',
        sourceReportDate,
      })
    ).rejects.toThrow(/reason/);

    expect((await getProfile(t, riderId))?.debtBalance).toBe(0);
  });
});
