/**
 * Converts a skill name to a URL-safe slug.
 * Port of toSlug() from packages/backend/src/public/public-skills.service.ts:67
 * MUST match backend exactly — slug→id resolution depends on identical output.
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
