import { upsertSection, removeSection } from '../../src/lib/section-manager.js';

describe('upsertSection (D-12 — Copilot/Windsurf shared file section management)', () => {
  it('appends new section to empty file', () => {
    const result = upsertSection('', 'commit-message', 'skill content here');
    expect(result).toContain('<!-- skillspell-begin: commit-message -->');
    expect(result).toContain('skill content here');
    expect(result).toContain('<!-- skillspell-end: commit-message -->');
  });

  it('appends new section after existing content without touching it', () => {
    const existing = '<!-- skillspell-begin: other-skill -->\nother\n<!-- skillspell-end: other-skill -->';
    const result = upsertSection(existing, 'new-skill', 'new content');
    expect(result).toContain('<!-- skillspell-begin: other-skill -->');
    expect(result).toContain('other');
    expect(result).toContain('<!-- skillspell-begin: new-skill -->');
    expect(result).toContain('new content');
  });

  it('replaces existing section on reinstall without duplicating', () => {
    const existing = '<!-- skillspell-begin: commit-message -->\nold content\n<!-- skillspell-end: commit-message -->';
    const result = upsertSection(existing, 'commit-message', 'new content');
    expect(result).toContain('new content');
    expect(result).not.toContain('old content');
    const beginCount = (result.match(/skillspell-begin: commit-message/g) ?? []).length;
    expect(beginCount).toBe(1);
  });

  it('throws on malformed section (begin without end)', () => {
    const broken = '<!-- skillspell-begin: commit-message -->\nno end marker';
    expect(() => upsertSection(broken, 'commit-message', 'anything')).toThrow(
      'Malformed skillspell section'
    );
  });
});

describe('removeSection (D-12 inverse — uninstall shared file section)', () => {
  it('removes an existing section by slug', () => {
    const existing = '<!-- skillspell-begin: commit-message -->\nskill content\n<!-- skillspell-end: commit-message -->\n';
    const result = removeSection(existing, 'commit-message');
    expect(result).not.toContain('skillspell-begin: commit-message');
    expect(result).not.toContain('skill content');
  });

  it('is idempotent when section does not exist', () => {
    const existing = 'some other content\n';
    const result = removeSection(existing, 'nonexistent');
    expect(result).toBe(existing);
  });

  it('preserves other sections when removing one (Pitfall 4 — no double blank lines)', () => {
    const existing =
      '<!-- skillspell-begin: skill-a -->\ncontent-a\n<!-- skillspell-end: skill-a -->\n\n' +
      '<!-- skillspell-begin: skill-b -->\ncontent-b\n<!-- skillspell-end: skill-b -->\n';
    const result = removeSection(existing, 'skill-a');
    expect(result).not.toContain('skill-a');
    expect(result).toContain('content-b');
    // Pitfall 4: no more than two consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('throws when begin marker exists but end marker is missing', () => {
    const malformed = '<!-- skillspell-begin: commit-message -->\nno end marker';
    expect(() => removeSection(malformed, 'commit-message')).toThrow(
      'Malformed skillspell section',
    );
  });
});
