import { describe, expect, it } from 'vitest';
import { dateInputToTimestamp, timestampToDateInputValue, todayDateInputValue } from './dates';

describe('timestampToDateInputValue', () => {
  it('uses the Casablanca calendar day, not UTC', () => {
    // 23:30 UTC on Nov 1 is 00:30 on Nov 2 in Casablanca (UTC+1).
    expect(timestampToDateInputValue(Date.UTC(2026, 10, 1, 23, 30))).toBe('2026-11-02');
    // 22:30 UTC on Nov 1 is still Nov 1 in Casablanca.
    expect(timestampToDateInputValue(Date.UTC(2026, 10, 1, 22, 30))).toBe('2026-11-01');
  });

  it('formats a Casablanca noon instant as the same calendar day', () => {
    expect(timestampToDateInputValue(Date.UTC(2026, 10, 2, 11))).toBe('2026-11-02');
  });
});

describe('dateInputToTimestamp', () => {
  it('anchors the date at noon Casablanca time', () => {
    const ts = dateInputToTimestamp('2026-11-02');
    expect(ts).not.toBeNull();
    expect(new Date(ts!).toISOString()).toBe('2026-11-02T11:00:00.000Z');
  });

  it('round-trips every month of the year', () => {
    const dates = [
      '2026-01-01',
      '2026-02-15',
      '2026-03-01',
      '2026-04-10',
      '2026-05-20',
      '2026-06-30',
      '2026-07-15',
      '2026-08-31',
      '2026-09-01',
      '2026-10-25',
      '2026-11-02',
      '2026-12-31',
    ];

    for (const date of dates) {
      const ts = dateInputToTimestamp(date);
      expect(ts).not.toBeNull();
      expect(timestampToDateInputValue(ts!)).toBe(date);
    }
  });

  it('rejects empty, malformed and impossible dates', () => {
    expect(dateInputToTimestamp('')).toBeNull();
    expect(dateInputToTimestamp('02/11/2026')).toBeNull();
    expect(dateInputToTimestamp('2026-13-01')).toBeNull();
    expect(dateInputToTimestamp('2026-02-30')).toBeNull();
    expect(dateInputToTimestamp('2026-1-2')).toBeNull();
  });
});

describe('todayDateInputValue', () => {
  it('defaults to the Casablanca day for a given instant', () => {
    expect(todayDateInputValue(Date.UTC(2026, 10, 1, 23, 30))).toBe('2026-11-02');
  });
});
