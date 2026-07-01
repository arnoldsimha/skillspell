import type { Response } from 'express';

/** Cookie name for the refresh token (same in all environments). */
export const REFRESH_COOKIE_NAME = 'ss_refresh';

/**
 * Duration unit multipliers (ms, s, m, h, d, w).
 * Used by both parseDurationToMs and calculateExpiry.
 */
const DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/** Default expiry: 7 days in milliseconds. */
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parse a duration string (e.g. '7d', '15m', '1h', '500ms') to milliseconds.
 *
 * Falls back to 7 days if the format is unrecognised.
 */
export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d|w)$/);
  if (!match) return DEFAULT_EXPIRY_MS;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  return value * (DURATION_MULTIPLIERS[unit] ?? DEFAULT_EXPIRY_MS);
}

/**
 * Calculate an expiry Date from a duration string (e.g. '7d', '1h').
 *
 * Used by TokenService for refresh token DB records.
 */
export function calculateExpiry(duration: string): Date {
  return new Date(Date.now() + parseDurationToMs(duration));
}

/**
 * Set the refresh token as an httpOnly cookie on the response.
 *
 * Cookie attributes:
 * - `httpOnly`: prevents JavaScript access (XSS protection)
 * - `secure`: only sent over HTTPS (production only)
 * - `sameSite`: 'strict' in production (max CSRF protection);
 *   'lax' in development (allows cross-origin dev setups)
 * - `path: /api/auth`: limits the cookie to auth endpoints only
 * - `maxAge`: matches the configured refresh token expiry
 */
export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  refreshTokenExpiry: string,
  isProduction: boolean,
): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: parseDurationToMs(refreshTokenExpiry),
  });
}

/**
 * Clear the refresh token cookie.
 */
export function clearRefreshTokenCookie(
  res: Response,
  isProduction: boolean,
): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
  });
}
