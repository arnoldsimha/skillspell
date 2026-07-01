export function normalizeSkillName(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^[^a-z]+/, '')
    .replace(/-+/g, '-')
    .replace(/-+$/, '');
}
