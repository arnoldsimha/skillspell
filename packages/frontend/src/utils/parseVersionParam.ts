/**
 * Utilities for parsing and building version-aware URL segments.
 *
 * URL format: /skills/v{N}/:skillId  (e.g. /skills/v3/abc-uuid)
 */

/**
 * Parse a version route param like 'v3' into its numeric value.
 * Returns undefined for missing, malformed, or non-positive values.
 */
export function parseVersionParam(param?: string): number | undefined {
  if (!param) return undefined;
  const match = param.match(/^v(\d+)$/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return n > 0 ? n : undefined;
}

/**
 * Build the version path prefix for URL construction.
 * Returns 'v3/' for version 3, or '' for null/undefined (latest).
 */
export function versionPrefix(version?: number | null): string {
  return version != null ? `v${version}/` : '';
}

/**
 * Build a skill URL with optional version.
 *   buildSkillPath('abc', undefined)       → '/skills/abc'
 *   buildSkillPath('abc', 3)               → '/skills/v3/abc'
 *   buildSkillPath('abc', 3, 'tests')      → '/skills/v3/abc/tests'
 */
export function buildSkillPath(
  skillId: string,
  version?: number | null,
  subRoute?: string,
): string {
  const base = `/skills/${versionPrefix(version)}${skillId}`;
  return subRoute ? `${base}/${subRoute}` : base;
}
