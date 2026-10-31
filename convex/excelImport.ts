'use node';

import { createHash } from 'node:crypto';
import { action } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { startOfDayCasablanca } from './lib/dates';
import { extractTikTakRows } from './lib/tiktakParser';
import type { ExtractedTikTakRow } from './lib/tiktakParser';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

interface BatchSummary {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'needs_review';
  reportDate: number;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  conflictRows: number;
  completedAt: number | null;
  errorSummary: string | null;
}

interface ImportSummary {
  accepted: number;
  rejected: number;
  duplicate: number;
  conflict: number;
}

interface MatchingSummary {
  matched: number;
  missingInExcel: number;
  amountMismatch: number;
  discrepanciesCreated: number;
  discrepanciesUpdated: number;
}

/**
 * Convex values do not support `Date`, so date cells are converted to epoch
 * millis before being handed to the ingestion mutation.
 */
function toConvexRows(rows: ExtractedTikTakRow[]): Record<string, unknown>[] {
  return rows.map(({ data }) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      clean[key] = value instanceof Date ? value.getTime() : value;
    }
    return clean;
  });
}

type ImportExcelResult =
  | {
      batchId: Id<'importBatches'>;
      duplicateFile: true;
      reportDate: number;
      summary: BatchSummary;
    }
  | {
      batchId: Id<'importBatches'>;
      duplicateFile: false;
      sheetName: string;
      reportDate: number;
      accepted: number;
      rejected: number;
      duplicate: number;
      conflict: number;
      matched: number;
      missingInExcel: number;
      amountMismatch: number;
      discrepanciesCreated: number;
      discrepanciesUpdated: number;
    };

/**
 * Ingest a manually uploaded TikTak Excel file and immediately run the
 * next-day matching engine for its report date.
 *
 * Upload flow: `api.imports.generateAdminUploadUrl` -> POST file to the URL ->
 * call this action with the returned `storageId` and the original file name.
 */
export const importExcelFile = action({
  args: {
    storageId: v.id('_storage'),
    fileName: v.string(),
    reportDate: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ImportExcelResult> => {
    const me = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!me || me.role !== 'admin') throw new Error('Forbidden: insufficient role');

    if (args.reportDate !== undefined && !Number.isFinite(args.reportDate)) {
      throw new Error('Date de rapport invalide');
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error('Fichier introuvable');
    if (blob.size === 0) throw new Error('Le fichier est vide');
    if (blob.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('Le fichier dépasse la taille maximale de 20 Mo');
    }

    const fileName = args.fileName.trim();
    const lowerName = fileName.toLocaleLowerCase('fr');
    if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      throw new Error('Format invalide: seuls les fichiers .xlsx et .xls sont acceptés');
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = createHash('sha256').update(bytes).digest('hex');

    let parsed: ReturnType<typeof extractTikTakRows>;
    try {
      parsed = extractTikTakRows(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Column/sheet validation messages are already user-facing.
      if (message.startsWith('Colonne obligatoire manquante') || message.startsWith('Le fichier')) {
        throw error;
      }
      throw new Error('Fichier Excel illisible ou corrompu');
    }

    const { rows, reportDate, sheetName } = parsed;
    if (rows.length === 0) {
      throw new Error('Le fichier ne contient aucune ligne exploitable');
    }

    const effectiveReportDate =
      args.reportDate ?? reportDate ?? startOfDayCasablanca(Date.now());

    const { batchId, isDuplicate }: { batchId: Id<'importBatches'>; isDuplicate: boolean } =
      await ctx.runMutation(internal.imports.createImportBatch, {
        gmailMessageId: `manual:${hash}`,
        attachmentName: fileName,
        attachmentHash: hash,
        reportDate: effectiveReportDate,
        storageId: args.storageId,
      });

    if (isDuplicate) {
      const summary: BatchSummary = await ctx.runQuery(
        internal.imports.getImportBatchSummary,
        { batchId }
      );
      return {
        batchId,
        duplicateFile: true,
        reportDate: effectiveReportDate,
        summary,
      };
    }

    const summary: ImportSummary = await ctx.runMutation(
      internal.imports.processImportBatch,
      {
        batchId,
        rows: toConvexRows(rows),
        rowNumbers: rows.map((row) => row.rowNumber),
      }
    );

    const matching: MatchingSummary = await ctx.runMutation(
      internal.discrepancies.runMatchingForBatch,
      {
        batchId,
        reportDate: effectiveReportDate,
      }
    );

    return {
      batchId,
      duplicateFile: false,
      sheetName,
      reportDate: effectiveReportDate,
      ...summary,
      ...matching,
    };
  },
});
