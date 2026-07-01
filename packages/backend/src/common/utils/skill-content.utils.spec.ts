import { load } from 'js-yaml';
import { updateFrontMatterName } from './skill-content.utils';

/** Extract and parse the YAML front-matter block from SKILL.md content. */
function parseFrontMatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?\r?\n)---/);
  if (!match) throw new Error('no front-matter found');
  return load(match[1]) as Record<string, unknown>;
}

const SKILL = `---
name: original-name
description: A test skill
---

# Body content stays untouched.
`;

describe('updateFrontMatterName', () => {
  it('replaces the name field', () => {
    const out = updateFrontMatterName(SKILL, 'renamed-skill');
    expect(parseFrontMatter(out).name).toBe('renamed-skill');
  });

  it('leaves other front-matter fields and the body intact', () => {
    const out = updateFrontMatterName(SKILL, 'renamed-skill');
    const fm = parseFrontMatter(out);
    expect(fm.description).toBe('A test skill');
    expect(out).toContain('# Body content stays untouched.');
  });

  it('returns content unchanged when there is no front-matter', () => {
    const plain = '# Just a heading\n';
    expect(updateFrontMatterName(plain, 'x')).toBe(plain);
  });

  it('returns content unchanged when there is no name field', () => {
    const noName = `---\ndescription: only\n---\nbody\n`;
    expect(updateFrontMatterName(noName, 'x')).toBe(noName);
  });

  describe('YAML injection is neutralized', () => {
    it('does not inject an extra key via an embedded newline', () => {
      const out = updateFrontMatterName(SKILL, 'foo\nstatus: published');
      const fm = parseFrontMatter(out);
      // The injected "status" must NOT become a real key.
      expect(fm.status).toBeUndefined();
      // The whole malicious string is confined to the name scalar.
      expect(fm.name).toBe('foo status: published');
    });

    it('does not inject allowed-tools', () => {
      const out = updateFrontMatterName(SKILL, 'evil\nallowed-tools: Bash');
      const fm = parseFrontMatter(out);
      expect(fm['allowed-tools']).toBeUndefined();
    });

    it('treats a colon as literal text, not a mapping', () => {
      const out = updateFrontMatterName(SKILL, 'a: b');
      expect(parseFrontMatter(out).name).toBe('a: b');
    });

    it('treats a hash as literal text, not a comment', () => {
      const out = updateFrontMatterName(SKILL, 'name # not-a-comment');
      expect(parseFrontMatter(out).name).toBe('name # not-a-comment');
    });

    it('escapes single quotes by doubling', () => {
      const out = updateFrontMatterName(SKILL, "o'brien");
      expect(parseFrontMatter(out).name).toBe("o'brien");
    });

    it('produces valid YAML for a pipe block-scalar indicator', () => {
      const out = updateFrontMatterName(SKILL, '| evil');
      expect(parseFrontMatter(out).name).toBe('| evil');
    });
  });

  it('preserves $ replacement-pattern sequences literally (WR-03)', () => {
    const out = updateFrontMatterName(SKILL, 'price-$1-$&-done');
    expect(parseFrontMatter(out).name).toBe('price-$1-$&-done');
  });

  it('handles CRLF front-matter', () => {
    const crlf = `---\r\nname: old\r\ndescription: d\r\n---\r\nbody\r\n`;
    const out = updateFrontMatterName(crlf, 'new-name');
    expect(parseFrontMatter(out).name).toBe('new-name');
  });
});
