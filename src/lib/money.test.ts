import { describe, expect, it } from 'vitest';
import { MAX_LIVE_AMOUNT_CENTIMES, parseAmountToCentimes } from './money';

describe('parseAmountToCentimes', () => {
  it('parses whole dirhams and decimals', () => {
    expect(parseAmountToCentimes('1234')).toBe(123400);
    expect(parseAmountToCentimes('1234.5')).toBe(123450);
    expect(parseAmountToCentimes('1234,56')).toBe(123456);
    expect(parseAmountToCentimes('0,50')).toBe(50);
  });

  it('ignores grouping spaces and non-breaking spaces', () => {
    expect(parseAmountToCentimes('1 234,56')).toBe(123456);
    expect(parseAmountToCentimes('1\u00a0234,56')).toBe(123456);
    expect(parseAmountToCentimes('1\u202f234,56')).toBe(123456);
  });

  it('rejects malformed, empty, zero, and negative values', () => {
    expect(parseAmountToCentimes('')).toBeNull();
    expect(parseAmountToCentimes('   ')).toBeNull();
    expect(parseAmountToCentimes('0')).toBeNull();
    expect(parseAmountToCentimes('-12')).toBeNull();
    expect(parseAmountToCentimes('abc')).toBeNull();
    expect(parseAmountToCentimes('12.345')).toBeNull();
    expect(parseAmountToCentimes('1,2,3')).toBeNull();
  });

  it('rejects amounts above the backend ceiling', () => {
    expect(parseAmountToCentimes('1000000')).toBe(MAX_LIVE_AMOUNT_CENTIMES);
    expect(parseAmountToCentimes('1000000,01')).toBeNull();
  });
});
