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

    return markets.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
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
