import { basename } from 'node:path';

/**
 * Sanitizes a skill name for use as a filesystem path component.
 * Port of sanitizePath() from packages/backend/src/export/export.service.ts:84
 * MUST match backend exactly — consistent file naming depends on it.
 *
 * Note: Returns 'unnamed' when the sanitized result contains no alphanumeric
 * characters (all chars were replaced with underscores or the result is empty).
 * This guards against skill names like '!!!' producing meaningless path components.
 */
export function sanitizePath(name: string): string {
  const sanitized = basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return /[a-zA-Z0-9]/.test(sanitized) ? sanitized : 'unnamed';
}
