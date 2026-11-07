import { capitalize } from './text';

const CASABLANCA_TIME_ZONE = 'Africa/Casablanca';

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