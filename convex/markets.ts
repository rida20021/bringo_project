import { mutation, query } from './_generated/server';
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
  args: { name: v.string(), externalId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const name = normalize(args.name);
    const externalId = normalize(args.externalId);
    if (!name) throw new Error('Market name is required');
    if (!externalId) throw new Error('External ID is required');

    await assertUniqueMarket(ctx, { name, externalId });

    const now = Date.now();
    return ctx.db.insert('markets', {
      name,
      externalId,
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
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const market = await ctx.db.get(args.marketId);
    if (!market) throw new Error('Market not found');

    const name = args.name === undefined ? undefined : normalize(args.name);
    const externalId = args.externalId === undefined ? undefined : normalize(args.externalId);
    if (name !== undefined && !name) throw new Error('Market name is required');
    if (externalId !== undefined && !externalId) throw new Error('External ID is required');

    await assertUniqueMarket(ctx, { name, externalId }, args.marketId);

    const patch: Partial<Pick<Doc<'markets'>, 'name' | 'externalId' | 'isActive'>> & {
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    if (externalId !== undefined) patch.externalId = externalId;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.marketId, patch);
  },
});

/**
 * Hard delete for now: nothing references markets until live orders land in
 * Milestone 2, at which point this must refuse to delete a referenced market.
 */
export const deleteMarket = mutation({
  args: { marketId: v.id('markets') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const market = await ctx.db.get(args.marketId);
    if (!market) throw new Error('Market not found');

    await ctx.db.delete(args.marketId);
  },
});
