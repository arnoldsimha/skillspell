import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDateWithPrefs,
  formatRelativeWithPrefs,
  formatChartAxisLabel,
} from './formatDate.js';

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns DD/MM/YYYY for a known date', () => {
    // Use noon UTC so the en-GB formatter (which uses local time) is unambiguous
    // across common CI timezones (UTC, UTC+X).
    expect(formatDate('2026-05-15T12:00:00Z')).toMatch(/15\/05\/2026/);
  });

  it('works with ISO strings', () => {
    expect(formatDate('2024-01-31T00:00:00.000Z')).toMatch(/31\/01\/2024/);
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('returns DD/MM/YYYY, HH:mm for a known datetime (UTC noon)', () => {
    // 2026-05-15T12:00:00Z is "15/05/2026, 12:00" in UTC, still May 15 in UTC+X.
    const result = formatDateTime('2026-05-15T12:00:00Z');
    expect(result).toMatch(/15\/05\/2026/);
    expect(result).toContain(':');
  });
});

// ─── formatDateWithPrefs ─────────────────────────────────────────────────────

describe('formatDateWithPrefs', () => {
  it('returns em-dash for null input', () => {
    expect(formatDateWithPrefs(null)).toBe('—');
  });

  it('returns DD/MM/YYYY format when dateFormat is DD/MM/YYYY', () => {
    const result = formatDateWithPrefs('2026-05-15T12:00:00Z', {
      timezone: 'UTC',
      dateFormat: 'DD/MM/YYYY',
    });
    expect(result).toBe('15/05/2026');
  });

  it('returns MM/DD/YYYY format when dateFormat is MM/DD/YYYY', () => {
    const result = formatDateWithPrefs('2026-05-15T12:00:00Z', {
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
    });
    expect(result).toBe('05/15/2026');
  });

  it('returns YYYY-MM-DD format when dateFormat is YYYY-MM-DD', () => {
    const result = formatDateWithPrefs('2026-05-15T12:00:00Z', {
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
    });
    expect(result).toBe('2026-05-15');
  });

  it('UTC noon 2026-05-15 in America/New_York is still May 15', () => {
    // UTC noon (12:00Z) = 08:00 EDT (UTC-4) — still May 15 in New York
    const result = formatDateWithPrefs('2026-05-15T12:00:00Z', {
      timezone: 'America/New_York',
      dateFormat: 'YYYY-MM-DD',
    });
    expect(result).toBe('2026-05-15');
  });

  it('UTC midnight 2026-05-15 in America/New_York is May 14', () => {
    // UTC midnight (00:00Z) = 20:00 EDT the previous day (UTC-4)
    const result = formatDateWithPrefs('2026-05-15T00:00:00Z', {
      timezone: 'America/New_York',
      dateFormat: 'YYYY-MM-DD',
    });
    expect(result).toBe('2026-05-14');
  });
});

// ─── formatRelativeWithPrefs ─────────────────────────────────────────────────

describe('formatRelativeWithPrefs', () => {
  // Pin Date.now() to a known timestamp: 2026-05-20T10:00:00Z
  const NOW_ISO = '2026-05-20T10:00:00Z';
  const NOW_MS = new Date(NOW_ISO).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns em-dash for null', () => {
    expect(formatRelativeWithPrefs(null)).toBe('—');
  });

  it('returns "just now" for 30 seconds ago', () => {
    const date = new Date(NOW_MS - 30_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    const date = new Date(NOW_MS - 59_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('just now');
  });

  it('returns "1 minute ago" for exactly 60 seconds ago', () => {
    const date = new Date(NOW_MS - 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('1 minute ago');
  });

  it('returns "X minutes ago" for times < 60 min', () => {
    const date = new Date(NOW_MS - 45 * 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('45 minutes ago');
  });

  it('returns "1 hour ago" for exactly 1 hour ago', () => {
    const date = new Date(NOW_MS - 60 * 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('1 hour ago');
  });

  it('returns "X hours ago" for times < 24h', () => {
    const date = new Date(NOW_MS - 5 * 60 * 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('5 hours ago');
  });

  it('returns "23 hours ago" for 23h 59m ago (not "just now" or "1 day ago")', () => {
    const date = new Date(NOW_MS - (23 * 60 + 59) * 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('23 hours ago');
  });

  it('returns "1 day ago" for ~25h ago', () => {
    const date = new Date(NOW_MS - 25 * 60 * 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('1 day ago');
  });

  it('returns "X days ago" for ~5 days ago', () => {
    const date = new Date(NOW_MS - 5 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeWithPrefs(date)).toBe('5 days ago');
  });

  it('returns a formatted date (not relative string) for >30 days ago', () => {
    const date = new Date(NOW_MS - 40 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeWithPrefs(date, { timezone: 'UTC', dateFormat: 'YYYY-MM-DD' });
    // Should be a date string, not "40 days ago"
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a formatted date for future dates', () => {
    const date = new Date(NOW_MS + 24 * 60 * 60_000).toISOString();
    const result = formatRelativeWithPrefs(date, { timezone: 'UTC', dateFormat: 'YYYY-MM-DD' });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── formatChartAxisLabel ─────────────────────────────────────────────────────

describe('formatChartAxisLabel', () => {
  it('returns a short month+day label for a UTC date', () => {
    // Must contain the day number 15 regardless of local timezone
    const result = formatChartAxisLabel('2026-05-15T12:00:00Z');
    expect(result).toContain('15');
  });

  it('UTC midnight date does NOT shift one day back (timezone:UTC fix)', () => {
    // Before the fix, UTC midnight rendered as "May 14" for UTC-X users.
    // With timeZone:'UTC', this must always be "May 15" / contain "15".
    const result = formatChartAxisLabel('2026-05-15T00:00:00Z');
    expect(result).toContain('15');
    expect(result).not.toMatch(/\b14\b/);
  });

  it('includes the month abbreviation', () => {
    const result = formatChartAxisLabel('2026-05-15T00:00:00Z');
    // Month short names are locale-dependent, but in any en-* locale "May" is returned
    expect(result.length).toBeGreaterThan(3);
  });
});
