'use node';

import { action } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { extractMarketRows } from './lib/marketParser';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

interface BulkCreateResult {
  created: number;
  skipped: number;
  errors: string[];
}

interface ImportMarketsResult extends BulkCreateResult {
  sheetName: string;
  totalRows: number;
}

/** Parse an uploaded market catalog and atomically create its valid rows. */
export const importMarketsFile = action({
  args: {
    storageId: v.id('_storage'),
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<ImportMarketsResult> => {
    await ctx.runQuery(internal.users.getCallerRole, {});

    const fileName = args.fileName.trim();
    const lowerName = fileName.toLocaleLowerCase('fr');
    if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      throw new Error('Format invalide : utilisez un fichier .xlsx, .xls ou .csv');
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error('Fichier introuvable');
    if (blob.size === 0) throw new Error('Le fichier est vide');
    if (blob.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('Le fichier dépasse la taille maximale de 10 Mo');
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let parsed: ReturnType<typeof extractMarketRows>;
    try {
      parsed = extractMarketRows(bytes, fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        message.startsWith('Colonne obligatoire manquante') ||
        message.startsWith('Format invalide') ||
        message.startsWith('Le fichier')
      ) {
        throw error;
      }
      throw new Error('Le fichier est illisible ou corrompu');
    }

    const result: BulkCreateResult = await ctx.runMutation(
      internal.markets.bulkCreateMarkets,
      { rows: parsed.rows }
    );

    return {
      sheetName: parsed.sheetName,
      totalRows: parsed.rows.length + parsed.errors.length,
      created: result.created,
      skipped: result.skipped + parsed.errors.length,
      errors: [...parsed.errors, ...result.errors],
    };
  },
});
