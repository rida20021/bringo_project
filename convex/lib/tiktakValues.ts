import { startOfDayCasablanca } from './dates';

/**
 * Pure value helpers shared by the default (V8) Convex runtime and the Node
 * Excel action. This module must never import `xlsx` (or any Node-only API),
 * otherwise every consumer would bundle the spreadsheet library.
 */

/** Lowercase + trim, used to compare command numbers across sources. */
export function normalizeCommandKey(value: string): string {
  return value.trim().toLocaleLowerCase('fr');
}

/**
 * Parse an amount expressed in MAD and return integer centimes.
 * Accepts numbers and strings such as `375.04`, `375,04` or `1 234,56`.
 */
export function parseAmountToCentimes(value: unknown): number | null {
  let parsed: number | null = null;

  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = parseAmountString(value);
  }

  if (parsed === null || !Number.isFinite(parsed) || parsed < 0) return null;

  const centimes = Math.round(parsed * 100);
  if (!Number.isSafeInteger(centimes)) return null;
  return centimes;
}

function parseAmountString(raw: string): number | null {
  // Drop spaces (including non-breaking ones) and currency text, keeping only
  // digits and separators.
  let cleaned = raw
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[^\d.,-]/g, '');

  if (!cleaned || !/\d/.test(cleaned)) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // The right-most separator is the decimal one, the other groups thousands.
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    cleaned =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    cleaned = cleaned.replace(/,/g, '.');
  }

  if ((cleaned.match(/\./g) ?? []).length > 1) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Parse a TikTak delivery date and return the START OF THE CASABLANCA DAY,
 * matching the convention used by `liveEntries.entryDate` and
 * `orders.deliveryDate`.
 *
 * Supports `Date` instances (as produced by SheetJS with `cellDates: true`),
 * ISO strings, `DD/MM/YYYY`, epoch millis and Excel serial numbers.
 */
export function parseTikTakDate(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) return null;
    return startOfDayCasablanca(time);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Epoch millis (anything after 2001-09-09) is preferred over Excel serials.
    if (value > 1e12) return startOfDayCasablanca(value);
    // Excel serial numbers use 1899-12-30 as day 0.
    if (value >= 1 && value < 2_958_466) {
      const time = Math.round((value - 25569) * 86_400_000);
      if (!Number.isFinite(time)) return null;
      return startOfDayCasablanca(time);
    }
    return null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ISO date only: 2026-10-25
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDate) {
    return utcDayToCasablanca(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3])
    );
  }

  // ISO datetime: 2026-10-25T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const time = Date.parse(trimmed);
    if (Number.isNaN(time)) return null;
    return startOfDayCasablanca(time);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dayFirst) {
    return utcDayToCasablanca(
      Number(dayFirst[3]),
      Number(dayFirst[2]),
      Number(dayFirst[1])
    );
  }

  return null;
}

function utcDayToCasablanca(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  // Reject rolled-over dates such as 31/02/2026.
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return startOfDayCasablanca(time);
}
