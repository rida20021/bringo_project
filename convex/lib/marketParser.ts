'use node';

import * as XLSX from 'xlsx';

export interface ParsedMarketRow {
  rowNumber: number;
  name: string;
  externalId: string;
  city: string;
}

export interface MarketParseResult {
  rows: ParsedMarketRow[];
  errors: string[];
  sheetName: string;
}

const HEADER_ALIASES = {
  name: new Set(['name', 'nom', 'market_name', 'nom_marche', 'nom_du_marche', 'marche']),
  externalId: new Set([
    'externalid',
    'external_id',
    'identifiant',
    'identifiant_externe',
    'id_externe',
  ]),
  city: new Set(['city', 'ville']),
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\ufeff/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function findColumn(headers: string[], aliases: Set<string>, label: string): number {
  const index = headers.findIndex((header) => aliases.has(header));
  if (index === -1) throw new Error(`Colonne obligatoire manquante : ${label}`);
  return index;
}

/** Parse the first worksheet of an Excel or CSV market catalog. */
export function extractMarketRows(
  data: ArrayBuffer | Uint8Array,
  fileName: string
): MarketParseResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const lowerName = fileName.trim().toLocaleLowerCase('fr');

  let workbook: XLSX.WorkBook;
  if (lowerName.endsWith('.csv')) {
    const csv = new TextDecoder('utf-8').decode(bytes).replace(/^\ufeff/, '');
    workbook = XLSX.read(csv, { type: 'string' });
  } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    workbook = XLSX.read(bytes, { type: 'array' });
  } else {
    throw new Error('Format invalide : utilisez un fichier .xlsx, .xls ou .csv');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Le fichier ne contient aucune feuille');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Le fichier ne contient aucune feuille');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: true,
  });
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const nameColumn = findColumn(headers, HEADER_ALIASES.name, 'nom / name');
  const externalIdColumn = findColumn(
    headers,
    HEADER_ALIASES.externalId,
    'identifiant / external_id'
  );
  const cityColumn = findColumn(headers, HEADER_ALIASES.city, 'ville / city');

  const rows: ParsedMarketRow[] = [];
  const errors: string[] = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? [];
    const name = cellText(cells[nameColumn]);
    const externalId = cellText(cells[externalIdColumn]);
    const city = cellText(cells[cityColumn]);
    if (!name && !externalId && !city) continue;

    const missing: string[] = [];
    if (!name) missing.push('nom');
    if (!externalId) missing.push('identifiant externe');
    if (!city) missing.push('ville');
    if (missing.length > 0) {
      errors.push(`Ligne ${index + 1} : ${missing.join(', ')} manquant(s).`);
      continue;
    }

    rows.push({ rowNumber: index + 1, name, externalId, city });
  }

  return { rows, errors, sheetName };
}
