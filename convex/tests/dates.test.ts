import { describe, expect, it } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import {
  CASABLANCA_TZ,
  liveEntryDateCasablanca,
  startOfDayCasablanca,
} from '../lib/dates';

function casablancaTimestamp(value: string): number {
  return fromZonedTime(value, CASABLANCA_TZ).getTime();
}

describe('liveEntryDateCasablanca', () => {
  it('assigns midnight through 02:59:59 to the previous business day', () => {
    const expected = casablancaTimestamp('2026-11-01T00:00:00');

    expect(liveEntryDateCasablanca(casablancaTimestamp('2026-11-02T00:00:00'))).toBe(expected);
    expect(liveEntryDateCasablanca(casablancaTimestamp('2026-11-02T02:59:59'))).toBe(expected);
  });

  it('starts the current business day at exactly 03:00', () => {
    const atThree = casablancaTimestamp('2026-11-02T03:00:00');
    expect(liveEntryDateCasablanca(atThree)).toBe(startOfDayCasablanca(atThree));
  });

  it('uses the current day for normal daytime and evening submissions', () => {
    for (const localTime of ['2026-11-02T12:00:00', '2026-11-02T22:00:00']) {
      const timestamp = casablancaTimestamp(localTime);
      expect(liveEntryDateCasablanca(timestamp)).toBe(startOfDayCasablanca(timestamp));
    }
  });

  it('handles month and year rollovers with calendar arithmetic', () => {
    expect(liveEntryDateCasablanca(casablancaTimestamp('2027-01-01T02:15:00'))).toBe(
      casablancaTimestamp('2026-12-31T00:00:00')
    );
    expect(liveEntryDateCasablanca(casablancaTimestamp('2026-03-01T01:00:00'))).toBe(
      casablancaTimestamp('2026-02-28T00:00:00')
    );
  });
});
