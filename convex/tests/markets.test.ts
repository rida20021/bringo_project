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
    });

    const markets = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({
      name: 'Marché Central',
      externalId: 'MKT-001',
      isActive: true,
    });
  });

  it('trims input and rejects blank values', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId: Id<'markets'> = await admin.mutation(api.markets.createMarket, {
      name: '  Marché Anfa  ',
      externalId: '  MKT-002  ',
    });
    const market = await t.run(async (ctx) => ctx.db.get(marketId));
    expect(market?.name).toBe('Marché Anfa');
    expect(market?.externalId).toBe('MKT-002');

    await expect(
      admin.mutation(api.markets.createMarket, { name: '   ', externalId: 'MKT-003' })
    ).rejects.toThrow(/name is required/);
    await expect(
      admin.mutation(api.markets.createMarket, { name: 'Marché Vide', externalId: '  ' })
    ).rejects.toThrow(/External ID is required/);
  });

  it('rejects duplicate external IDs and duplicate names', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
    });

    await expect(
      admin.mutation(api.markets.createMarket, {
        name: 'Autre Marché',
        externalId: 'MKT-001',
      })
    ).rejects.toThrow(/external ID already exists/);

    await expect(
      admin.mutation(api.markets.createMarket, {
        name: '  marché central ',
        externalId: 'MKT-002',
      })
    ).rejects.toThrow(/name already exists/);
  });

  it('updates a market and toggles its active state', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
    });

    await admin.mutation(api.markets.updateMarket, {
      marketId,
      name: 'Marché Central Rénové',
      isActive: false,
    });

    const all = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(all[0]).toMatchObject({ name: 'Marché Central Rénové', isActive: false });

    const activeOnly = await admin.query(api.markets.listMarkets, {});
    expect(activeOnly).toHaveLength(0);
  });

  it('deletes a market', async () => {
    const t = makeT();
    const admin = await asAdmin(t);

    const marketId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Central',
      externalId: 'MKT-001',
    });

    await admin.mutation(api.markets.deleteMarket, { marketId });

    const all = await admin.query(api.markets.listMarkets, { includeInactive: true });
    expect(all).toHaveLength(0);
  });

  it('lets riders read active markets but not inactive ones or mutate the catalog', async () => {
    const t = makeT();
    const admin = await asAdmin(t);
    const riderId = await createProfile(t, 'rider');
    const rider = t.withIdentity({ subject: riderId, email: 'rider@bringo.test' });

    await admin.mutation(api.markets.createMarket, {
      name: 'Marché Actif',
      externalId: 'MKT-001',
    });
    const inactiveId = await admin.mutation(api.markets.createMarket, {
      name: 'Marché Inactif',
      externalId: 'MKT-002',
    });
    await admin.mutation(api.markets.updateMarket, { marketId: inactiveId, isActive: false });

    const active = await rider.query(api.markets.listMarkets, {});
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Marché Actif');

    await expect(
      rider.query(api.markets.listMarkets, { includeInactive: true })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      rider.mutation(api.markets.createMarket, { name: 'Nouveau', externalId: 'MKT-003' })
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
      })
    ).rejects.toThrow(/Forbidden/);

    await expect(
      supervisor.query(api.markets.listMarkets, { includeInactive: true })
    ).rejects.toThrow(/Forbidden/);
  });
});
