/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { liveEntryDateCasablanca } from '../lib/dates';

const modules = import.meta.glob([
  '../**/*.ts',
  '!../**/*.test.ts',
  '!../auth.config.ts',
  '!../http.ts',
  '!../index.ts',
]);

type T = ReturnType<typeof makeT>;
type TestRole = 'supervisor' | 'admin' | 'rider';

function makeT() {
  return convexTest({ schema, modules });
}

async function createProfile(
  t: T,
  role: TestRole,
  options: {
    displayName?: string;
    debtBalance?: number;
    isActive?: boolean;
    isArchived?: boolean;
    withPasswordAccount?: boolean;
  } = {}
): Promise<Id<'users'>> {
  return t.run(async (ctx) => {
    const email = `${role}-${Math.random()}@bringo.test`;
    const userId = await ctx.db.insert('users', { email });
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      displayName: options.displayName ?? `${role} Test`,
      isActive: options.isActive ?? true,
      isArchived: options.isArchived,
      debtBalance: options.debtBalance,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (options.withPasswordAccount) {
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: `Original.Case.${email}`,
        secret: 'test-hash',
      });
    }
    return userId;
  });
}

async function asAdmin(t: T) {
  const adminId = await createProfile(t, 'admin');
  return {
    adminId,
    client: t.withIdentity({ subject: adminId, email: 'admin@bringo.test' }),
  };
}

async function createMarket(t: T): Promise<Id<'markets'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('markets', {
      name: 'Marché Central',
      externalId: `MKT-${Math.random()}`,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function createEntry(
  t: T,
  riderUserId: Id<'users'>,
  marketId: Id<'markets'>,
  values: {
    commandId: string;
    amount: number;
    paymentMethod: 'cash' | 'tpe' | 'card';
    entryDate?: number;
  }
): Promise<Id<'liveEntries'>> {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert('liveEntries', {
      riderUserId,
      commandId: values.commandId,
      commandKey: values.commandId.toLocaleLowerCase('fr'),
      marketId,
      marketName: 'Marché Central',
      marketExternalId: 'MKT-360',
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      entryDate: values.entryDate ?? liveEntryDateCasablanca(now),
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function attachReceipt(
  t: T,
  riderUserId: Id<'users'>,
  liveEntryId: Id<'liveEntries'>,
  kind: 'tpe' | 'bank_deposit',
  fileName: string
): Promise<Id<'liveEntryReceipts'>> {
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob([fileName], { type: 'image/png' }))
  );
  return t.run(async (ctx) =>
    ctx.db.insert('liveEntryReceipts', {
      liveEntryId,
      riderUserId,
      kind,
      storageId,
      fileName,
      mimeType: 'image/png',
      size: fileName.length,
      status: 'pending_review',
      createdAt: Date.now(),
    })
  );
}

describe('getRiderProfileData', () => {
  it('returns profile, debt, current business-day totals, entries, and TPE evidence', async () => {
    const t = makeT();
    const { client } = await asAdmin(t);
    const riderUserId = await createProfile(t, 'rider', {
      displayName: 'Nadia Livreuse',
      debtBalance: 12500,
    });
    const marketId = await createMarket(t);
    const businessDate = liveEntryDateCasablanca(Date.now());

    const cashEntry = await createEntry(t, riderUserId, marketId, {
      commandId: 'CMD-CASH',
      amount: 10000,
      paymentMethod: 'cash',
    });
    const tpeEntry = await createEntry(t, riderUserId, marketId, {
      commandId: 'CMD-TPE',
      amount: 7500,
      paymentMethod: 'tpe',
    });
    await createEntry(t, riderUserId, marketId, {
      commandId: 'CMD-CARD',
      amount: 5000,
      paymentMethod: 'card',
    });
    await createEntry(t, riderUserId, marketId, {
      commandId: 'CMD-OLD',
      amount: 99900,
      paymentMethod: 'cash',
      entryDate: businessDate - 7 * 24 * 60 * 60 * 1000,
    });

    await attachReceipt(t, riderUserId, cashEntry, 'bank_deposit', 'depot.png');
    const tpeReceiptId = await attachReceipt(t, riderUserId, tpeEntry, 'tpe', 'tpe.png');

    const data = await client.query(api.users.getRiderProfileData, { riderUserId });
    expect(data).not.toBeNull();
    expect(data?.profile).toMatchObject({
      userId: riderUserId,
      name: 'Nadia Livreuse',
      role: 'rider',
      debtBalance: 12500,
      isActive: true,
      isArchived: false,
    });
    expect(data?.businessDate).toBe(businessDate);
    expect(data?.stats).toEqual({
      entryCount: 3,
      totalAmount: 22500,
      cashAmount: 10000,
      tpeAmount: 7500,
      cardAmount: 5000,
    });
    expect(data?.liveEntries.map((entry) => entry.commandId).sort()).toEqual([
      'CMD-CARD',
      'CMD-CASH',
      'CMD-TPE',
    ]);
    expect(data?.recentTpeReceipts).toHaveLength(1);
    expect(data?.recentTpeReceipts[0]).toMatchObject({
      receiptId: tpeReceiptId,
      fileName: 'tpe.png',
      entry: { commandId: 'CMD-TPE', amount: 7500 },
    });
    expect(typeof data?.recentTpeReceipts[0].url === 'string' || data?.recentTpeReceipts[0].url === null).toBe(true);
  });

  it('returns only the ten newest rider TPE receipts', async () => {
    const t = makeT();
    const { client } = await asAdmin(t);
    const riderUserId = await createProfile(t, 'rider');
    const marketId = await createMarket(t);
    const entryId = await createEntry(t, riderUserId, marketId, {
      commandId: 'CMD-MANY',
      amount: 2500,
      paymentMethod: 'tpe',
    });

    for (let index = 0; index < 12; index += 1) {
      await attachReceipt(t, riderUserId, entryId, 'tpe', `ticket-${index}.png`);
    }
    await attachReceipt(t, riderUserId, entryId, 'bank_deposit', 'not-tpe.png');

    const data = await client.query(api.users.getRiderProfileData, { riderUserId });
    expect(data?.recentTpeReceipts).toHaveLength(10);
    expect(data?.recentTpeReceipts[0].fileName).toBe('ticket-11.png');
    expect(data?.recentTpeReceipts.some((receipt) => receipt.fileName === 'ticket-0.png')).toBe(false);
    expect(data?.recentTpeReceipts.some((receipt) => receipt.fileName === 'not-tpe.png')).toBe(false);
  });

  it('keeps archived riders viewable and defaults missing debt to zero', async () => {
    const t = makeT();
    const { client } = await asAdmin(t);
    const riderUserId = await createProfile(t, 'rider', { isActive: false, isArchived: true });

    const data = await client.query(api.users.getRiderProfileData, { riderUserId });
    expect(data?.profile).toMatchObject({ debtBalance: 0, isActive: false, isArchived: true });
  });

  it('returns null for missing or non-rider profiles', async () => {
    const t = makeT();
    const { client } = await asAdmin(t);
    const supervisorId = await createProfile(t, 'supervisor');
    const orphanId = await t.run(async (ctx) =>
      ctx.db.insert('users', { email: 'orphan@bringo.test' })
    );

    expect(
      await client.query(api.users.getRiderProfileData, { riderUserId: supervisorId })
    ).toBeNull();
    expect(await client.query(api.users.getRiderProfileData, { riderUserId: orphanId })).toBeNull();
  });

  it('is restricted to admins', async () => {
    const t = makeT();
    const riderUserId = await createProfile(t, 'rider');
    const supervisorId = await createProfile(t, 'supervisor');

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .query(api.users.getRiderProfileData, { riderUserId })
    ).rejects.toThrow(/Forbidden/);
    await expect(t.query(api.users.getRiderProfileData, { riderUserId })).rejects.toThrow(
      /Unauthorized|Forbidden/
    );
  });
});

describe('rider password reset authorization', () => {
  it('resolves the exact password-provider account for an admin', async () => {
    const t = makeT();
    const { adminId, client } = await asAdmin(t);
    const riderUserId = await createProfile(t, 'rider', { withPasswordAccount: true });

    const context = await client.query(internal.users.getRiderPasswordResetContext, {
      riderUserId,
    });
    expect(context).toMatchObject({
      adminUserId: adminId,
      riderUserId,
    });
    expect(context.providerAccountId).toMatch(/^Original\.Case\./);
  });

  it('rejects supervisors, archived riders, non-riders, and missing password accounts', async () => {
    const t = makeT();
    const { client } = await asAdmin(t);
    const supervisorId = await createProfile(t, 'supervisor', { withPasswordAccount: true });
    const riderWithoutPassword = await createProfile(t, 'rider');
    const archivedRider = await createProfile(t, 'rider', {
      isActive: false,
      isArchived: true,
      withPasswordAccount: true,
    });

    await expect(
      client.query(internal.users.getRiderPasswordResetContext, { riderUserId: supervisorId })
    ).rejects.toThrow(/not found/);
    await expect(
      client.query(internal.users.getRiderPasswordResetContext, {
        riderUserId: riderWithoutPassword,
      })
    ).rejects.toThrow(/Password account/);
    await expect(
      client.query(internal.users.getRiderPasswordResetContext, { riderUserId: archivedRider })
    ).rejects.toThrow(/Archived/);

    await expect(
      t
        .withIdentity({ subject: supervisorId, email: 'supervisor@bringo.test' })
        .query(internal.users.getRiderPasswordResetContext, {
          riderUserId: riderWithoutPassword,
        })
    ).rejects.toThrow(/Forbidden/);
  });

  it('rejects weak temporary passwords before changing credentials', async () => {
    const t = makeT();
    const { client } = await asAdmin(t);
    const riderUserId = await createProfile(t, 'rider', { withPasswordAccount: true });

    await expect(
      client.action(api.users.resetRiderPassword, {
        riderUserId,
        temporaryPassword: 'short',
      })
    ).rejects.toThrow(/between 12 and 128/);

    await expect(
      client.action(api.users.resetRiderPassword, {
        riderUserId,
        temporaryPassword: 'onlylowercase123',
      })
    ).rejects.toThrow(/uppercase, lowercase, number, and symbol/);
  });

  it('changes the password hash, invalidates sessions, and writes an audit event', async () => {
    const t = makeT();
    const { adminId, client } = await asAdmin(t);
    const riderUserId = await createProfile(t, 'rider', { withPasswordAccount: true });
    await t.run(async (ctx) =>
      ctx.db.insert('authSessions', {
        userId: riderUserId,
        expirationTime: Date.now() + 60_000,
      })
    );

    const result = await client.action(api.users.resetRiderPassword, {
      riderUserId,
      temporaryPassword: 'Strong!Temporary9',
    });
    expect(result).toEqual({ success: true });

    const state = await t.run(async (ctx) => {
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) =>
          q.eq('userId', riderUserId).eq('provider', 'password')
        )
        .unique();
      const sessions = await ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', riderUserId))
        .collect();
      const audit = await ctx.db
        .query('auditEvents')
        .withIndex('target', (q) => q.eq('targetType', 'users').eq('targetId', riderUserId))
        .first();
      return { account, sessions, audit };
    });

    expect(state.account?.secret).not.toBe('test-hash');
    expect(state.sessions).toHaveLength(0);
    expect(state.audit).toMatchObject({
      actorId: adminId,
      action: 'rider.password_reset',
      targetId: riderUserId,
    });
  });
});
