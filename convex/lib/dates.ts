import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const CASABLANCA_TZ = 'Africa/Casablanca';

/** Start of the Casablanca calendar day containing `ts`, as epoch millis. */
export function startOfDayCasablanca(ts: number): number {
  const zoned = toZonedTime(new Date(ts), CASABLANCA_TZ);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, CASABLANCA_TZ).getTime();
}

/** End of the Casablanca calendar day containing `ts`, as epoch millis. */
export function endOfDayCasablanca(ts: number): number {
  const zoned = toZonedTime(new Date(ts), CASABLANCA_TZ);
  zoned.setHours(23, 59, 59, 999);
  return fromZonedTime(zoned, CASABLANCA_TZ).getTime();
}
