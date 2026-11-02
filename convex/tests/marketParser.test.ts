// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { extractMarketRows } from '../lib/marketParser';

function toXlsx(aoa: unknown[][], sheetName = 'Marchés'): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(buffer);
}

describe('extractMarketRows', () => {
  it('parses French Excel headers and keeps source row numbers', () => {
    const bytes = toXlsx([
      ['Nom', 'Identifiant externe', 'Ville'],
      ['Marché Central', 'MKT-001', 'Casablanca'],
      [null, null, null],
      ['Marché Agdal', 'MKT-002', 'Rabat'],
    ]);

    const result = extractMarketRows(bytes, 'marches.xlsx');

    expect(result.sheetName).toBe('Marchés');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        name: 'Marché Central',
        externalId: 'MKT-001',
        city: 'Casablanca',
      },
      {
        rowNumber: 4,
        name: 'Marché Agdal',
        externalId: 'MKT-002',
        city: 'Rabat',
      },
    ]);
  });

  it('parses UTF-8 CSV files with English headers', () => {
    const csv = [
      '\ufeffname,external_id,city',
      'Marché Atlas,MKT-010,Marrakech',
      'Marché Océan,MKT-011,Rabat',
    ].join('\n');

    const result = extractMarketRows(new TextEncoder().encode(csv), 'markets.csv');

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      name: 'Marché Atlas',
      externalId: 'MKT-010',
      city: 'Marrakech',
    });
    expect(result.errors).toEqual([]);
  });

  it('returns row errors while preserving other valid rows', () => {
    const bytes = toXlsx([
      ['name', 'externalId', 'city'],
      ['Sans ville', 'MKT-020', ''],
      ['Valide', 'MKT-021', 'Fès'],
      ['', 'MKT-022', 'Rabat'],
    ]);

    const result = extractMarketRows(bytes, 'markets.xlsx');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Valide');
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/Ligne 2.*ville/);
    expect(result.errors[1]).toMatch(/Ligne 4.*nom/);
  });

  it('rejects files missing a required column', () => {
    const bytes = toXlsx([
      ['nom', 'ville'],
      ['Marché Central', 'Casablanca'],
    ]);

    expect(() => extractMarketRows(bytes, 'marches.xlsx')).toThrow(
      /Colonne obligatoire manquante.*identifiant/
    );
  });

  it('rejects unsupported file extensions', () => {
    expect(() => extractMarketRows(new Uint8Array([1, 2, 3]), 'markets.txt')).toThrow(
      /Format invalide/
    );
  });
});
