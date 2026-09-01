import type { BookingStatus, MechanicStatus } from './types';

/**
 * Money arrives from the API as a decimal string and is parsed only here, at the point of
 * display. Nothing in the app does arithmetic on it.
 */
export function formatCurrency(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Compact form for stat cards, where a seven-figure number would wrap. */
export function formatCurrencyCompact(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  ON_THE_WAY: 'On the way',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/**
 * Semantic status colours. Amber = waiting on us, blue = in motion, green = done,
 * red = did not happen. Held to a narrow set so eight hours of looking at this
 * does not become eight hours of decoding a rainbow.
 */
export const STATUS_STYLE: Record<BookingStatus, string> = {
  PENDING: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/25',
  ASSIGNED: 'bg-sky-500/12 text-sky-700 dark:text-sky-400 ring-sky-500/25',
  ON_THE_WAY: 'bg-sky-500/12 text-sky-700 dark:text-sky-400 ring-sky-500/25',
  IN_PROGRESS: 'bg-blue-500/14 text-blue-700 dark:text-blue-400 ring-blue-500/30',
  COMPLETED: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25',
  CANCELLED: 'bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/25',
};

export const MECHANIC_STATUS_LABEL: Record<MechanicStatus, string> = {
  AVAILABLE: 'Available',
  ON_JOB: 'On job',
  OFF_DUTY: 'Off duty',
};

export const MECHANIC_STATUS_STYLE: Record<MechanicStatus, string> = {
  AVAILABLE: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25',
  ON_JOB: 'bg-blue-500/14 text-blue-700 dark:text-blue-400 ring-blue-500/30',
  OFF_DUTY: 'bg-zinc-500/12 text-zinc-600 dark:text-zinc-400 ring-zinc-500/25',
};

export const BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'ASSIGNED',
  'ON_THE_WAY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];
