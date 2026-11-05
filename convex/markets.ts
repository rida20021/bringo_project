import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { requireAdmin, requireAppUser } from './lib/auth';

function normalize(value: string): string {
  return value.trim();
}

function comparable(value: string): string {
  return value.trim().toLocaleLowerCase('fr');
}

async function assertUniqueMarket(
  ctx: MutationCtx,
  args: { name?: string; externalId?: string },
  currentId?: Id<'markets'>
): Promise<void> {
  if (args.externalId !== undefined) {
    const externalId = args.externalId;
    const byExternalId = await ctx.db
      .query('markets')
      .withIndex('externalId', (q) => q.eq('externalId', externalId))
      .unique();
    if (byExternalId && byExternalId._id !== currentId) {
      throw new Error('A market with this external ID already exists');
    }
  }

  if (args.name !== undefined) {
    // Market names are compared case-insensitively; the catalog stays small.
    const markets = await ctx.db.query('markets').collect();
    const wanted = comparable(args.name);
    const duplicate = markets.find(
      (market) => market._id !== currentId && comparable(market.name) === wanted
    );
    if (duplicate) throw new Error('A market with this name already exists');
  }
}

/**
 * Riders need the active catalog for their entry dropdown, so any provisioned
 * user can read it. Inactive markets are admin-only.
 */
export const listMarkets = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const appUser = await requireAppUser(ctx);
    const includeInactive = args.includeInactive === true;

    if (includeInactive && appUser.role !== 'admin') {
      throw new Error('Forbidden: insufficient role');
    }

    const markets = includeInactive
      ? await ctx.db.query('markets').collect()
      : await ctx.db
          .query('markets')
          .filter((q) => q.eq(q.field('isActive'), true))
          .collect();

    // Calculate unique rider count per market from both orders and liveEntries
    const marketIds = markets.map((m) => m._id);
    const riderCountMap = new Map<Id<'markets'>, number>();

    // Initialize all markets with 0
    for (const marketId of marketIds) {
      riderCountMap.set(marketId, 0);
    }

    // Collect unique rider IDs from orders (riderId field)
    const ordersRidersMap = new Map<Id<'markets'>, Set<Id<'riders'>>>();
    for (const marketId of marketIds) {
      ordersRidersMap.set(marketId, new Set());
    }

    const orders = await ctx.db.query('orders').collect();
    for (const order of orders) {
      if (order.marketId && ordersRidersMap.has(order.marketId)) {
        ordersRidersMap.get(order.marketId)!.add(order.riderId);
      }
    }

    // Collect unique rider user IDs from liveEntries (riderUserId field)
    const liveEntriesRidersMap = new Map<Id<'markets'>, Set<Id<'users'>>>();
    for (const marketId of marketIds) {
      liveEntriesRidersMap.set(marketId, new Set());
    }

    const liveEntries = await ctx.db.query('liveEntries').collect();
    for (const entry of liveEntries) {
      if (liveEntriesRidersMap.has(entry.marketId)) {
        liveEntriesRidersMap.get(entry.marketId)!.add(entry.riderUserId);
      }
    }

    // Combine both counts: total unique riders = orders riders + live entries riders
    // Note: riderId and riderUserId are different ID types, so we count both sets
    for (const marketId of marketIds) {
      const ordersRidersCount = ordersRidersMap.get(marketId)!.size;
      const liveEntriesRidersCount = liveEntriesRidersMap.get(marketId)!.size;
      riderCountMap.set(marketId, ordersRidersCount + liveEntriesRidersCount);
    }

    // Add riderCount to each market
    const marketsWithRiderCount = markets.map((market) => ({
      ...market,
      riderCount: riderCountMap.get(market._id) ?? 0,
    }));

    return marketsWithRiderCount.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  },
});

export const createMarket = mutation({
  args: { name: v.string(), externalId: v.string(), city: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const name = normalize(args.name);
    const externalId = normalize(args.externalId);
    const city = normalize(args.city);
    if (!name) throw new Error('Market name is required');
    if (!externalId) throw new Error('External ID is required');
    if (!city) throw new Error('City is required');

    await assertUniqueMarket(ctx, { name, externalId });

    const now = Date.now();
    return ctx.db.insert('markets', {
      name,
      externalId,
      city,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMarket = mutation({
  args: {
    marketId: v.id('markets'),
    name: v.optional(v.string()),
    externalId: v.optional(v.string()),
    city: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const market = await ctx.db.get(args.marketId);
    if (!market) throw new Error('Market not found');

    const name = args.name === undefined ? undefined : normalize(args.name);
    const externalId = args.externalId === undefined ? undefined : normalize(args.externalId);
    const city = args.city === undefined ? undefined : normalize(args.city);
    if (name !== undefined && !name) throw new Error('Market name is required');
    if (externalId !== undefined && !externalId) throw new Error('External ID is required');
    if (city !== undefined && !city) throw new Error('City is required');

    await assertUniqueMarket(ctx, { name, externalId }, args.marketId);

    const patch: Partial<Pick<Doc<'markets'>, 'name' | 'externalId' | 'city' | 'isActive'>> & {
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    if (externalId !== undefined) patch.externalId = externalId;
    if (city !== undefined) patch.city = city;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.marketId, patch);
  },
});

/**
 * Insert a parsed market file in one transaction. Existing and in-file
 * duplicates are skipped: names are case-insensitive, while external IDs are
 * compared exactly after trimming.
 */
export const bulkCreateMarkets = internalMutation({
  args: {
    rows: v.array(
      v.object({
        rowNumber: v.optional(v.number()),
        name: v.string(),
        externalId: v.string(),
        city: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existingMarkets = await ctx.db.query('markets').collect();
    const knownNames = new Set(existingMarkets.map((market) => comparable(market.name)));
    const knownExternalIds = new Set(existingMarkets.map((market) => market.externalId));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let index = 0; index < args.rows.length; index += 1) {
      const row = args.rows[index];
      const rowLabel = `Ligne ${row.rowNumber ?? index + 2}`;
      const name = normalize(row.name);
      const externalId = normalize(row.externalId);
      const city = normalize(row.city);

      if (!name || !externalId || !city) {
        skipped += 1;
        errors.push(`${rowLabel} : nom, identifiant externe et ville sont obligatoires.`);
        continue;
      }

      const nameKey = comparable(name);
      if (knownNames.has(nameKey)) {
        skipped += 1;
        errors.push(`${rowLabel} : le marché « ${name} » existe déjà.`);
        continue;
      }
      if (knownExternalIds.has(externalId)) {
        skipped += 1;
        errors.push(`${rowLabel} : l’identifiant « ${externalId} » existe déjà.`);
        continue;
      }

      const now = Date.now();
      await ctx.db.insert('markets', {
        name,
        externalId,
        city,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      knownNames.add(nameKey);
      knownExternalIds.add(externalId);
      created += 1;
    }

    return { created, skipped, errors };
  },
});

export const bulkAssignCityToMarkets = mutation({
  args: {
    marketIds: v.array(v.id('markets')),
    city: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const city = normalize(args.city);
    if (!city) throw new Error('City is required');

    const now = Date.now();
    let updated = 0;

    for (const marketId of args.marketIds) {
      const market = await ctx.db.get(marketId);
      if (market) {
        await ctx.db.patch(marketId, { city, updatedAt: now });
        updated += 1;
      }
    }

    return { updated };
  },
});

/** @deprecated Use updateMarket({ isActive: false }). Kept as a soft-delete compatibility API. */
export const deleteMarket = mutation({
  args: { marketId: v.id('markets') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const market = await ctx.db.get(args.marketId);
    if (!market) throw new Error('Market not found');
    await ctx.db.patch(args.marketId, { isActive: false, updatedAt: Date.now() });
  },
});
