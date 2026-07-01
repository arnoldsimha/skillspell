import { sanitizePath } from '../../src/lib/sanitize.js';

describe('sanitizePath (UX-05 — must match backend export.service.ts:84)', () => {
  it('replaces non-alphanumeric chars (except . _ -) with underscore', () => {
    expect(sanitizePath('hello world')).toBe('hello_world');
  });

  it('strips path traversal components', () => {
    expect(sanitizePath('../../../etc/passwd')).toBe('passwd');
  });

  it('returns "unnamed" for empty result', () => {
    expect(sanitizePath('!!!')).toBe('unnamed');
  });

  it('preserves valid filesystem chars', () => {
    expect(sanitizePath('my-skill.v1_final')).toBe('my-skill.v1_final');
  });
});
