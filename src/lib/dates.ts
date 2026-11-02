import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const CASABLANCA_TZ = 'Africa/Casablanca';

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDateInput(value: string): boolean {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Format an instant as its Casablanca calendar date (`YYYY-MM-DD`). */
export function timestampToDateInputValue(ts: number): string {
  const zoned = toZonedTime(new Date(ts), CASABLANCA_TZ);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, '0');
  const day = String(zoned.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's Casablanca calendar date, ready for `<input type="date">`. */
export function todayDateInputValue(now: number = Date.now()): string {
  return timestampToDateInputValue(now);
}

/**
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) to an instant anchored
 * at noon Casablanca time. Noon avoids DST-boundary ambiguity; the backend
 * normalizes it with `startOfDayCasablanca` before querying.
 *
 * Returns null for empty or malformed values. Never parse the raw value with
 * `new Date(value)`: that would be interpreted as UTC midnight and can shift
 * the calendar day.
 */
export function dateInputToTimestamp(value: string): number | null {
  if (!isValidDateInput(value)) return null;
  return fromZonedTime(`${value}T12:00:00`, CASABLANCA_TZ).getTime();
}
