const CASABLANCA_TIME_ZONE = 'Africa/Casablanca';

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

const longDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: CASABLANCA_TIME_ZONE,
});

const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: CASABLANCA_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: CASABLANCA_TIME_ZONE,
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** e.g. "Jeudi 29 octobre 2026" (Casablanca). */
export function formatLongDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '—';
  return capitalize(longDateFormatter.format(new Date(timestamp)));
}

/** e.g. "29/10/2026" (Casablanca). */
export function formatShortDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '—';
  return shortDateFormatter.format(new Date(timestamp));
}

/** e.g. "29/10/2026 14:05" (Casablanca). */
export function formatDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '—';
  return dateTimeFormatter.format(new Date(timestamp)).replace(' à ', ' ');
}

/** Initials for the account avatar, e.g. "Rida Alaoui" -> "RA". */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const roleLabels: Record<'supervisor' | 'admin' | 'rider', string> = {
  supervisor: 'Superviseur',
  admin: 'Administrateur',
  rider: 'Livreur',
};

export const paymentMethodLabels: Record<'cash' | 'tpe' | 'card', string> = {
  cash: 'Espèces',
  tpe: 'TPE',
  card: 'Carte en ligne',
};
