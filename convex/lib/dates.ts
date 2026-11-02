import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const CASABLANCA_TZ = 'Africa/Casablanca';

/** Start of the Casablanca calendar day containing `ts`, as epoch millis. */
export function startOfDayCasablanca(ts: number): number {
  const zoned = toZonedTime(new Date(ts), CASABLANCA_TZ);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, CASABLANCA_TZ).getTime();
}

/**
 * Business day for a rider's live entry. Submissions made from midnight up to,
 * but not including, 03:00 Casablanca time belong to the previous calendar
 * day. Calendar arithmetic is intentional here: subtracting 24 hours would be
 * incorrect across timezone offset changes.
 */
export function liveEntryDateCasablanca(ts: number): number {
  const zoned = toZonedTime(new Date(ts), CASABLANCA_TZ);
  if (zoned.getHours() < 3) zoned.setDate(zoned.getDate() - 1);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, CASABLANCA_TZ).getTime();
}

/** End of the Casablanca calendar day containing `ts`, as epoch millis. */
export function endOfDayCasablanca(ts: number): number {
  const zoned = toZonedTime(new Date(ts), CASABLANCA_TZ);
  zoned.setHours(23, 59, 59, 999);
  return fromZonedTime(zoned, CASABLANCA_TZ).getTime();
}
