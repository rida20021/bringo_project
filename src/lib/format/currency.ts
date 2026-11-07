const numberFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format integer centimes as Moroccan dirhams, e.g. 2484381 -> "24 843,81 MAD".
 * Amounts are stored in centimes throughout the app to avoid float drift.
 */
export function formatMAD(centimes: number): string {
  if (!Number.isFinite(centimes)) return '—';
  const formatted = numberFormatter.format(centimes / 100).replace(/\u202f/g, '\u00a0');
  return `${formatted} MAD`;
}

/** Format integer centimes without the currency suffix. */
export function formatAmount(centimes: number): string {
  if (!Number.isFinite(centimes)) return '—';
  return numberFormatter.format(centimes / 100).replace(/\u202f/g, '\u00a0');
}