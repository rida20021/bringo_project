import * as XLSX from 'xlsx';
import { parseTikTakDate } from './tiktakValues';

/**
 * Columns the TikTak export must contain. Header cells are trimmed before
 * being compared, so trailing spaces in the generated file are tolerated.
 */
export const TIKTAK_REQUIRED_COLUMNS = [
  'delivery_date_end',
  'number',
  'payment_method',
  'store_internal_name',
  'shopper_name',
  'Total',
] as const;

export interface ExtractedTikTakRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

/**
 * Read the first worksheet of a TikTak Excel export.
 *
 * `rowNumber` is the original 1-based Excel row (the header is row 1, so the
 * first data row is row 2). Entirely blank rows are skipped.
 */
export function extractTikTakRows(data: ArrayBuffer | Uint8Array): {
  rows: ExtractedTikTakRow[];
  reportDate: number | null;
  sheetName: string;
} {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Le fichier ne contient aucune feuille');

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Le fichier ne contient aucune feuille');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });

  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((cell) =>
    cell === null || cell === undefined ? '' : String(cell).trim()
  );

  for (const column of TIKTAK_REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      throw new Error(`Colonne obligatoire manquante: ${column}`);
    }
  }

  const rows: ExtractedTikTakRow[] = [];
  let reportDate: number | null = null;

  for (let index = 1; index < matrix.length; index++) {
    const cells = matrix[index];
    if (!cells) continue;

    const record: Record<string, unknown> = {};
    for (let column = 0; column < headers.length; column++) {
      const header = headers[column];
      if (!header) continue;
      record[header] = cells[column] ?? null;
    }

    const hasCommand = hasValue(record.number);
    const hasTotal = hasValue(record.Total);
    if (!hasCommand && !hasTotal) continue;

    if (reportDate === null) {
      reportDate = parseTikTakDate(record.delivery_date_end);
    }

    rows.push({ rowNumber: index + 1, data: record });
  }

  return { rows, reportDate, sheetName };
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
}
