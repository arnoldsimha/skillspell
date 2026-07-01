import { toSlug } from '../../src/lib/slugify.js';

describe('toSlug (DISC-01 — must match backend public-skills.service.ts:67)', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toSlug('My React Skill')).toBe('my-react-skill');
  });

  it('removes non-alphanumeric-or-hyphen characters', () => {
    expect(toSlug('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple hyphens', () => {
    expect(toSlug('Hello   World')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(toSlug('-hello-world-')).toBe('hello-world');
  });

  it('handles empty string', () => {
    expect(toSlug('')).toBe('');
  });

  it('handles already-slug input', () => {
    expect(toSlug('commit-message')).toBe('commit-message');
  });
});
