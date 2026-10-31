// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  normalizeCommandKey,
  parseAmountToCentimes,
  parseTikTakDate,
} from '../lib/tiktakValues';
import { extractTikTakRows } from '../lib/tiktakParser';
import { startOfDayCasablanca } from '../lib/dates';

const REPORT_DAY = startOfDayCasablanca(Date.UTC(2026, 9, 25));

function toXlsx(aoa: unknown[][], sheetName = 'Rapport'): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellDates: true });
  return new Uint8Array(buffer);
}

const HEADERS = [
  'delivery_date_end',
  'number',
  'payment_method',
  'store_internal_name',
  'shopper_name',
  'Total',
];

describe('parseAmountToCentimes', () => {
  it('converts numbers and localized strings to integer centimes', () => {
    expect(parseAmountToCentimes(375.04)).toBe(37504);
    expect(parseAmountToCentimes('375,04')).toBe(37504);
    expect(parseAmountToCentimes('1 234,56')).toBe(123456);
    expect(parseAmountToCentimes('375.04 MAD')).toBe(37504);
  });

  it('absorbs floating point artifacts', () => {
    expect(parseAmountToCentimes(24843.81000000001)).toBe(2484381);
  });

  it('rejects negative, non-numeric, empty and overflowing inputs', () => {
    expect(parseAmountToCentimes(-1)).toBeNull();
    expect(parseAmountToCentimes('-375,04')).toBeNull();
    expect(parseAmountToCentimes(NaN)).toBeNull();
    expect(parseAmountToCentimes('abc')).toBeNull();
    expect(parseAmountToCentimes('')).toBeNull();
    expect(parseAmountToCentimes('   ')).toBeNull();
    expect(parseAmountToCentimes(null)).toBeNull();
    expect(parseAmountToCentimes(undefined)).toBeNull();
    // 1e20 MAD overflows the safe integer range once converted to centimes.
    expect(parseAmountToCentimes(1e20)).toBeNull();
  });
});

describe('parseTikTakDate', () => {
  it('normalizes ISO dates to the start of the Casablanca day', () => {
    expect(parseTikTakDate('2026-10-25')).toBe(
      startOfDayCasablanca(Date.UTC(2026, 9, 25))
    );
  });

  it('normalizes Date instances at UTC midnight to the same day start', () => {
    expect(parseTikTakDate(new Date(Date.UTC(2026, 9, 25)))).toBe(REPORT_DAY);
  });

  it('parses DD/MM/YYYY like the ISO form', () => {
    expect(parseTikTakDate('25/10/2026')).toBe(REPORT_DAY);
  });

  it('rejects invalid dates', () => {
    expect(parseTikTakDate('not-a-date')).toBeNull();
    expect(parseTikTakDate(null)).toBeNull();
    expect(parseTikTakDate('31/02/2026')).toBeNull();
  });
});

describe('normalizeCommandKey', () => {
  it('trims and lowercases command ids', () => {
    expect(normalizeCommandKey(' CMD-001 ')).toBe('cmd-001');
  });
});

describe('extractTikTakRows', () => {
  it('extracts rows, preserves original row numbers and skips blank rows', () => {
    const bytes = toXlsx([
      HEADERS,
      ['2026-10-25', 'CMD-001', 'cash', 'Store A', 'Rider A', 375.04],
      [null, null, null, null, null, null],
      ['2026-10-25', 'CMD-002', 'card', 'Store B', 'Rider B', 40],
    ]);

    const result = extractTikTakRows(bytes);

    expect(result.sheetName).toBe('Rapport');
    expect(result.reportDate).toBe(REPORT_DAY);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);

    expect(result.rows[0].data).toMatchObject({
      delivery_date_end: '2026-10-25',
      number: 'CMD-001',
      payment_method: 'cash',
      store_internal_name: 'Store A',
      shopper_name: 'Rider A',
      Total: 375.04,
    });
    expect(result.rows[1].data).toMatchObject({
      number: 'CMD-002',
      payment_method: 'card',
      Total: 40,
    });
  });

  it('tolerates whitespace around header names', () => {
    const bytes = toXlsx([
      HEADERS.map((header) => `  ${header} `),
      ['2026-10-25', 'CMD-001', 'cash', 'Store A', 'Rider A', 10],
    ]);

    const result = extractTikTakRows(bytes);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].data.number).toBe('CMD-001');
    expect(result.rows[0].data.delivery_date_end).toBe('2026-10-25');
  });

  it('throws when a required column is missing', () => {
    const headers = HEADERS.filter((header) => header !== 'shopper_name');
    const bytes = toXlsx([headers, ['2026-10-25', 'CMD-001', 'cash', 'Store A', 10]]);

    expect(() => extractTikTakRows(bytes)).toThrow(/Colonne obligatoire manquante/);
    expect(() => extractTikTakRows(bytes)).toThrow(/shopper_name/);
  });

  it('throws a clear error for an empty sheet', () => {
    const bytes = toXlsx([]);

    expect(() => extractTikTakRows(bytes)).toThrow(/Colonne obligatoire manquante/);
  });
});
