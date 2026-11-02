/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from '../schema';
import { api, internal } from '../_generated/api';
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
    const userId = await ctx.db.insert('users', { email: `${role}-${Math.random()}@bringo.test` });
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

async function asAdmin(t: T) {
  const adminId = await createProfile(t, 'admin');
  return t.withIdentity({ subject: adminId, email: 'admin@bringo.test' });
}

describe('markets catalog', () => {
  it('lets an admin create and list markets', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });

    const markets = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
      isActive: true,
    });
  });

  it('trims input and rejects blank values', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId: Id<'markets'> = await admin.mutation(api.markets.createMarket, {
      name: '  Marché Anfa  ',
      externalId: '  MKT-002  ',
      city: '  Casablanca  ',
    });
    const market = await t.run(async (ctx) => ctx.db.get(marketId));
    expect(market?.name).toBe('Marché Anfa');
    expect(market?.externalId).toBe('MKT-002');
    expect(market?.city).toBe('Casablanca');

    await expect(
      admin.mutation(api.markets.createMarket, {
        name: '   ',
        externalId: 'MKT-003',
        city: 'Casablanca',
      })
    ).rejects.toThrow(/name is required/);
    await expect(
      admin.mutation(api.markets.createMarket, {
        name: 'Marché Vide',
        externalId: '  ',
        city: 'Casablanca',
      })
    ).rejects.toThrow(/External ID is required/);
    await expect(
      admin.mutation(api.markets.createMarket, {
        name: 'Marché Sans Ville',
        externalId: 'MKT-004',
        city: '  ',
      })
    ).rejects.toThrow(/City is required/);
  });

  it('rejects duplicate external IDs and duplicate names', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });

    await expect(
      admin.mutation(api.markets.createMarket, {
        name: 'Autre Marché',
        externalId: 'MKT-001',
        city: 'Rabat',
      })
    ).rejects.toThrow(/external ID already exists/);

    await expect(
      admin.mutation(api.markets.createMarket, {
        name: '  marché central ',
        externalId: 'MKT-002',
        city: 'Rabat',
      })
    ).rejects.toThrow(/name already exists/);
  });

  it('updates a market and toggles its active state', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });

    await admin.mutation(api.markets.updateMarket, {
      marketId,
      name: 'Marché Central Rénové',
      city: 'Rabat',
      isActive: false,
    });

    const all = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(all[0]).toMatchObject({
      name: 'Marché Central Rénové',
      city: 'Rabat',
      isActive: false,
    });

    const activeOnly = await admin.query(api.markets.listMarkets, {});
    expect(activeOnly).toHaveLength(0);
  });

  it('soft-archives a market through the legacy delete endpoint', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });

    await admin.mutation(api.markets.deleteMarket, { marketId });

    const all = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(all).toHaveLength(1);
    expect(all[0].isActive).toBe(false);
  });

  it('soft-archives a market referenced by a live entry without losing history', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });
    const riderId = await createProfile(t, 'rider');

    await t.run(async (ctx) =>
      ctx.db.insert('liveEntries', {
        riderUserId: riderId,
        commandId: 'CMD-001',
        commandKey: 'cmd-001',
        marketId,
        marketName: 'Marché Central',
        marketExternalId: 'MKT-001',
        amount: 1000,
        paymentMethod: 'cash',
        entryDate: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await admin.mutation(api.markets.deleteMarket, { marketId });
    const archived = await t.run(async (ctx) => ctx.db.get(marketId));
    expect(archived?.isActive).toBe(false);
  });

  it('lets riders read active markets but not inactive ones or mutate the catalog', async () => {
    const t = makeT();
    const admin = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await admin.mutation(api.markets.createMarket, {
      name: 'Marché Actif',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });
    const inactiveId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Inactif',
      externalId: 'MKT-002',
      city: 'Rabat',
    });
    await admin.mutation(api.markets.updateMarket, { marketId: inactiveId, isActive: false });

    const active = await rider.query(api.markets.listMarkets, {});
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Marché Actif');

    await expect(
      rider.query(api.markets.listMarkets, { includeInactive: true })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      rider.mutation(api.markets.createMarket, {
        name: 'Nouveau',
        externalId: 'MKT-003',
        city: 'Rabat',
      })
    ).rejects.toThrow(/Forbidden/);
  });

  it('keeps the catalog read-only for supervisors', async () => {
    const t = makeT();
    const supervisorId = await createProfile(t, 'supervisor');
    const supervisor = t.withIdentity({
      subject: supervisorId,
      email: 'supervisor@bringo.test',
    });

    await expect(
      supervisor.mutation(api.markets.createMarket, {
        name: 'Marché Central',
        externalId: 'MKT-001',
        city: 'Casablanca',
      })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      supervisor.query(api.markets.listMarkets, { includeInactive: true })
    ).rejects.toThrow(/Forbidden/);
  });

  it('bulk creates valid rows and skips existing or in-file duplicates', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
      city: 'Casablanca',
    });

    const result = await t.mutation(internal.markets.bulkCreateMarkets, {
      rows: [
        {
          rowNumber: 2,
          name: 'marché central',
          externalId: 'MKT-100',
          city: 'Rabat',
        },
        {
          rowNumber: 3,
          name: 'Marché Rabat',
          externalId: 'MKT-001',
          city: 'Rabat',
        },
        {
          rowNumber: 4,
          name: 'Marché Anfa',
          externalId: 'MKT-002',
          city: 'Casablanca',
        },
        {
          rowNumber: 5,
          name: '  MARCHÉ ANFA  ',
          externalId: 'MKT-003',
          city: 'Casablanca',
        },
        {
          rowNumber: 6,
          name: 'Marché Fès',
          externalId: 'MKT-002',
          city: 'Fès',
        },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(4);
    expect(result.errors).toHaveLength(4);

    const markets = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(markets).toHaveLength(2);
    expect(markets.find((market) => market.externalId === 'MKT-002')).toMatchObject({
      name: 'Marché Anfa',
      city: 'Casablanca',
    });
  });

  it('compares bulk external IDs exactly after trimming', async () => {
    const t = makeT();

    const result = await t.mutation(internal.markets.bulkCreateMarkets, {
      rows: [
        { name: 'Marché Un', externalId: ' MKT-001 ', city: 'Casablanca' },
        { name: 'Marché Deux', externalId: 'mkt-001', city: 'Rabat' },
      ],
    });

    expect(result).toMatchObject({ created: 2, skipped: 0 });
  });
});
