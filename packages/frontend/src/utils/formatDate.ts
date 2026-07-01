/**
 * @file formatDate.ts — SINGLE SOURCE OF TRUTH for all frontend date display.
 *
 * Exports fall into two categories:
 *
 * LEGACY (fixed locale, no user preferences):
 *   - formatDateTime(dateStr)  — DD/MM/YYYY, HH:mm (en-GB)
 *   - formatDate(dateStr)      — DD/MM/YYYY (en-GB)
 *
 * PREFERENCE-AWARE (respects user timezone + date format from useUserPreferences):
 *   - formatDateWithPrefs(dateStr, prefs)    — user-formatted date string
 *   - formatRelativeWithPrefs(dateStr, prefs) — relative ("3 days ago") or formatted
 *
 * CHART HELPERS (locale-independent short labels):
 *   - formatChartAxisLabel(dateStr) — "May 15" style labels for chart axes
 *
 * All components rendering dates to users MUST use one of the preference-aware
 * or chart helpers above. Do NOT use toLocaleDateString() inline in components.
 */

import type { DateFormat } from '../hooks/useUserPreferences.js';

// ─── Legacy fixed formatters ──────────────────────────────────────────────

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Format a date string as DD/MM/YYYY, HH:mm (fixed locale). */
export function formatDateTime(dateStr: string): string {
  return dateTimeFormatter.format(new Date(dateStr));
}

/** Format a date string as DD/MM/YYYY (fixed locale). */
export function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

// ─── Preference-aware formatters ──────────────────────────────────────────

/**
 * Format a UTC date string using the user's preferred timezone and date format.
 */
export function formatDateWithPrefs(
  dateStr: string | null,
  opts: { timezone?: string; dateFormat?: DateFormat } = {},
): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const tz = opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = opts.dateFormat ?? 'DD/MM/YYYY';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';

  switch (fmt) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD/MM/YYYY':
    default:           return `${day}/${month}/${year}`;
  }
}

/**
 * Format a date as relative ("just now", "3 days ago") then fall back to
 * formatDateWithPrefs for older dates.
 */
export function formatRelativeWithPrefs(
  dateStr: string | null,
  opts: { timezone?: string; dateFormat?: DateFormat } = {},
): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return formatDateWithPrefs(dateStr, opts); // future date
  const diffSecs = diffMs / 1000;
  if (diffSecs < 60) return 'just now';
  const diffMins = diffSecs / 60;
  if (diffMins < 60) return `${Math.floor(diffMins)} minute${Math.floor(diffMins) === 1 ? '' : 's'} ago`;
  const diffHours = diffMins / 60;
  if (diffHours < 24) return `${Math.floor(diffHours)} hour${Math.floor(diffHours) === 1 ? '' : 's'} ago`;
  const diffDays = diffHours / 24;
  if (diffDays < 2) return '1 day ago';
  if (diffDays < 30) return `${Math.floor(diffDays)} days ago`;
  return formatDateWithPrefs(dateStr, opts);
}

// ─── Chart helpers ────────────────────────────────────────────────────────

/**
 * Format a UTC date bucket as a short month+day label for chart axes.
 * timeZone: 'UTC' prevents midnight UTC dates from shifting one day back
 * for users in UTC− timezones.
 */
export function formatChartAxisLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('default', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr));
}
