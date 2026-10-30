/** Upper bound mirrored by the backend: 1,000,000.00 MAD. */
export const MAX_LIVE_AMOUNT_CENTIMES = 100_000_000;

/**
 * Parse a user-entered MAD amount into integer centimes.
 * Accepts "1234", "1234.5", "1 234,56" (spaces and non-breaking spaces).
 * Returns null for empty, malformed, zero, negative, or out-of-range input.
 */
export function parseAmountToCentimes(input: string): number | null {
  const normalized = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;

  const centimes = Math.round(value * 100);
  if (!Number.isSafeInteger(centimes) || centimes <= 0) return null;
  if (centimes > MAX_LIVE_AMOUNT_CENTIMES) return null;

  return centimes;
}
