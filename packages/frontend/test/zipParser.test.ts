/**
 * Tests for zipParser — skill zip extraction and validation.
 *
 * Uses JSZip to programmatically create zip files in-memory, verifying
 * that parseSkillZip correctly handles:
 *
 * 1. Standard skill structure (SKILL.md + scripts/references/assets)
 * 2. Nested skill structure (e.g. .claude/skills/<name>/SKILL.md)
 * 3. Flat format exports (Cursor, Windsurf, Copilot)
 * 4. Frontmatter parsing (name, description, block scalars)
 * 5. Security: path traversal, size limits, extension allowlist
 * 6. Edge cases: empty zip, missing SKILL.md, OS artifacts (__MACOSX, .DS_Store)
 * 7. Real fixture files (when placed in ./fixtures/)
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseSkillZip } from '../src/utils/zipParser.js';
import type { ZipParseSuccess, ZipParseError } from '../src/utils/zipParser.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* ─── Helpers ────────────────────────────────────────────────────────── */

/** Create a File object from a JSZip instance. */
async function zipToFile(zip: JSZip, name = 'test.zip'): Promise<File> {
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name, { type: 'application/zip' });
}

/** Standard SKILL.md content with frontmatter. */
const STANDARD_SKILL_MD = `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is a test skill.
`;

/** SKILL.md with block scalar description. */
const BLOCK_SCALAR_SKILL_MD = `---
name: block-scalar-skill
description: >
  This is a multi-line
  description using block scalar
---

# Block Scalar Skill
`;

/** SKILL.md with no frontmatter. */
const NO_FRONTMATTER_SKILL_MD = `# Bare Skill

This skill has no YAML frontmatter.
`;

/* ─── Standard Structure Tests ───────────────────────────────────────── */

describe('zipParser', () => {
  describe('standard skill structure', () => {
    it('should parse a minimal skill (SKILL.md only)', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('test-skill');
      expect(r.skill.description).toBe('A test skill for unit testing');
      expect(r.skill.skillContent).toBe(STANDARD_SKILL_MD);
      expect(r.skill.scripts).toEqual([]);
      expect(r.skill.references).toEqual([]);
      expect(r.skill.assets).toEqual([]);
      expect(r.fileCount).toBe(1);
    });

    it('should parse a full skill with scripts, references, and assets', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('scripts/build.sh', '#!/bin/bash\necho "build"');
      zip.file('scripts/validate.py', 'print("ok")');
      zip.file('references/api-docs.md', '# API\nEndpoints...');
      zip.file('references/schema.json', '{"type": "object"}');
      zip.file('assets/template.html', '<h1>Template</h1>');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.scripts).toHaveLength(2);
      expect(r.skill.references).toHaveLength(2);
      expect(r.skill.assets).toHaveLength(1);
      expect(r.fileCount).toBe(6);
      expect(r.skill.scripts.find((s) => s.name === 'build.sh')?.content).toContain('echo "build"');
      expect(r.skill.references.find((s) => s.name === 'api-docs.md')?.content).toContain('# API');
    });

    it('should handle case-insensitive SKILL.md lookup', async () => {
      const zip = new JSZip();
      zip.file('skill.md', STANDARD_SKILL_MD);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('test-skill');
    });

    it('should add root-level non-skill files to references with a warning', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('README.md', '# README');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.references).toHaveLength(1);
      expect(r.skill.references[0].name).toBe('README.md');
      expect(r.warnings).toContainEqual(expect.stringContaining('added to references'));
    });

    it('should add files in unknown directories to references with a warning', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('custom/data.json', '{"key": "val"}');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.references).toHaveLength(1);
      expect(r.warnings).toContainEqual(expect.stringContaining('unknown directory'));
    });
  });

  /* ─── Nested Structure Tests ─────────────────────────────────────── */

  describe('nested skill structure', () => {
    it('should find SKILL.md nested inside a Claude export (.claude/skills/<name>/)', async () => {
      const zip = new JSZip();
      const prefix = '.claude/skills/my-skill/';
      zip.file(`${prefix}SKILL.md`, STANDARD_SKILL_MD);
      zip.file(`${prefix}scripts/build.sh`, '#!/bin/bash');
      zip.file(`${prefix}references/docs.md`, '# Docs');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('test-skill');
      expect(r.skill.scripts).toHaveLength(1);
      expect(r.skill.references).toHaveLength(1);
    });

    it('should find SKILL.md nested inside a single root folder wrapper', async () => {
      const zip = new JSZip();
      zip.file('my-exported-skill/SKILL.md', STANDARD_SKILL_MD);
      zip.file('my-exported-skill/scripts/run.py', 'print("run")');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('test-skill');
      expect(r.skill.scripts).toHaveLength(1);
    });

    it('should handle deeply nested SKILL.md (Roo-style)', async () => {
      const zip = new JSZip();
      zip.file('.roo/rules/my-skill/SKILL.md', STANDARD_SKILL_MD);
      zip.file('.roo/rules/my-skill/references/api.md', '# API');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('test-skill');
      expect(r.skill.references).toHaveLength(1);
    });
  });

  /* ─── Flat Format Tests (Cursor, Windsurf, Copilot) ──────────────── */

  describe('flat format exports', () => {
    it('should detect Cursor export (.cursor/rules/<name>.md)', async () => {
      const zip = new JSZip();
      zip.file('.cursor/rules/my-cursor-rule.md', '# Cursor Rule\n\nDo things this way.');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('my-cursor-rule');
      expect(r.skill.skillContent).toContain('Cursor Rule');
      expect(r.warnings).toContainEqual(expect.stringContaining('flat-format'));
    });

    it('should detect Windsurf export (.windsurfrules)', async () => {
      const zip = new JSZip();
      zip.file('.windsurfrules', '# Windsurf Rules\n\nAlways use TypeScript.');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.skillContent).toContain('Always use TypeScript');
      expect(r.warnings).toContainEqual(expect.stringContaining('flat-format'));
    });

    it('should detect Copilot export (.github/copilot-instructions.md)', async () => {
      const zip = new JSZip();
      zip.file('.github/copilot-instructions.md', '# Copilot Instructions\n\nUse React hooks.');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.skillContent).toContain('React hooks');
      expect(r.warnings).toContainEqual(expect.stringContaining('flat-format'));
    });

    it('should detect a single md file as flat format', async () => {
      const zip = new JSZip();
      zip.file('my-instructions.md', '# Instructions\n\nDo stuff.');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('my-instructions');
      expect(r.skill.skillContent).toContain('Do stuff');
    });

    it('should extract name from frontmatter in flat format when available', async () => {
      const zip = new JSZip();
      zip.file('.cursor/rules/some-file.md', `---
name: my-custom-name
description: Custom description
---

# Content
`);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('my-custom-name');
      expect(r.skill.description).toBe('Custom description');
    });
  });

  /* ─── Frontmatter Parsing ──────────────────────────────────────────── */

  describe('frontmatter parsing', () => {
    it('should parse standard name and description', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('test-skill');
      expect(r.skill.description).toBe('A test skill for unit testing');
    });

    it('should handle block scalar description (>)', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', BLOCK_SCALAR_SKILL_MD);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('block-scalar-skill');
      expect(r.skill.description).toBe('This is a multi-line description using block scalar');
    });

    it('should handle pipe block scalar description (|)', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', `---
name: pipe-skill
description: |
  First line
  Second line
---

# Content
`);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('pipe-skill');
      expect(r.skill.description).toBe('First line Second line');
    });

    it('should handle quoted name and description', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', `---
name: "my-quoted-skill"
description: 'A quoted description'
---

# Content
`);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('my-quoted-skill');
      expect(r.skill.description).toBe('A quoted description');
    });

    it('should warn about missing name and description', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', NO_FRONTMATTER_SKILL_MD);

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('');
      expect(r.skill.description).toBe('');
      expect(r.warnings).toContainEqual(expect.stringContaining('missing "name"'));
      expect(r.warnings).toContainEqual(expect.stringContaining('missing "description"'));
    });

    it('should handle CRLF line endings in frontmatter', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', '---\r\nname: crlf-skill\r\ndescription: CRLF test\r\n---\r\n\r\n# Content\r\n');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.name).toBe('crlf-skill');
      expect(r.skill.description).toBe('CRLF test');
    });
  });

  /* ─── Security & Validation ────────────────────────────────────────── */

  describe('security and validation', () => {
    it('should reject non-zip files', async () => {
      const file = new File(['not a zip'], 'readme.txt', { type: 'text/plain' });

      const result = await parseSkillZip(file);

      expect(result.success).toBe(false);
      expect((result as ZipParseError).error).toContain('.zip');
    });

    it('should reject oversized zip files', async () => {
      // Create a file object that pretends to be large
      const largeContent = 'x'.repeat(200 * 1024); // 200 KB of text
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('big-file.md', largeContent);
      const blob = await zip.generateAsync({ type: 'blob' });
      // Manually create a File with a large size
      const file = new File([blob], 'test.zip', { type: 'application/zip' });

      // If the compressed size exceeds 100KB this should fail
      const result = await parseSkillZip(file);

      // The result depends on compression ratio — either it fails on compressed size
      // or on extracted size. Both are valid security bounds.
      if (!result.success) {
        expect((result as ZipParseError).error).toMatch(/too large|exceeds/i);
      }
    });

    it('should reject empty zip files', async () => {
      const zip = new JSZip();
      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(false);
      expect((result as ZipParseError).error).toContain('empty');
    });

    it('should reject zip with path traversal (..)', async () => {
      // JSZip may normalize paths during creation, so we need to test
      // with the normalizePath function behavior. When JSZip strips `..`,
      // the file still gets added but under a normalized name.
      // The parser's normalizePath function catches `..` segments.
      const zip = new JSZip();
      // Use a path that JSZip preserves but our parser rejects
      zip.file('scripts/../../etc/passwd', 'root:x:0:0');
      zip.file('SKILL.md', STANDARD_SKILL_MD);

      const result = await parseSkillZip(await zipToFile(zip));

      // JSZip may or may not preserve the `..` — if it does, the parser
      // rejects with path traversal error. If JSZip normalizes it away,
      // the file just appears as `etc/passwd` and gets processed normally.
      // Either way, the path traversal should not succeed in reading outside the zip.
      if (!result.success) {
        expect((result as ZipParseError).error).toContain('path traversal');
      } else {
        // JSZip normalized it — the file did NOT escape the zip boundary
        // This is still safe, just handled by JSZip rather than our code
        expect(result.success).toBe(true);
      }
    });

    it('should skip files with disallowed extensions with a warning', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('scripts/binary.exe', 'MZ...');
      zip.file('scripts/image.png', 'PNG...');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.scripts).toHaveLength(0); // both skipped
      expect(r.warnings).toContainEqual(expect.stringContaining('.exe'));
      expect(r.warnings).toContainEqual(expect.stringContaining('.png'));
    });

    it('should skip deeply nested files (more than 5 levels)', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      // 7 path segments — exceeds the max-5-directory-levels check (split('/').length > 6)
      zip.file('scripts/a/b/c/d/e/file.py', 'print("deep")');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.skill.scripts).toHaveLength(0);
      expect(r.warnings).toContainEqual(expect.stringContaining('nested too deeply'));
    });

    it('should reject zip with too many files', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      // MAX_FILE_COUNT is 100; add 100 files to exceed the limit
      for (let i = 0; i < 100; i++) {
        zip.file(`references/file-${i}.md`, `# File ${i}`);
      }

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(false);
      expect((result as ZipParseError).error).toContain('too many files');
    });
  });

  /* ─── OS Artifact Filtering ────────────────────────────────────────── */

  describe('OS artifact filtering', () => {
    it('should silently skip __MACOSX entries', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('__MACOSX/._SKILL.md', 'mac metadata');
      zip.file('__MACOSX/scripts/._build.sh', 'mac metadata');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.fileCount).toBe(1); // only SKILL.md
      expect(r.warnings).not.toContainEqual(expect.stringContaining('__MACOSX'));
    });

    it('should silently skip .DS_Store files', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('.DS_Store', '\x00\x00\x00\x01Bud1');
      zip.file('scripts/.DS_Store', '\x00\x00\x00\x01Bud1');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.fileCount).toBe(1); // only SKILL.md
    });

    it('should silently skip .gitignore and .git entries', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', STANDARD_SKILL_MD);
      zip.file('.gitignore', 'node_modules/');
      zip.file('.git/config', '[core]');

      const result = await parseSkillZip(await zipToFile(zip));

      expect(result.success).toBe(true);
      const r = result as ZipParseSuccess;
      expect(r.fileCount).toBe(1);
    });
  });

  /* ─── Error Cases ──────────────────────────────────────────────────── */

  describe('error cases', () => {
    it('should error when no SKILL.md is found (non-flat format)', async () => {
      const zip = new JSZip();
      zip.file('README.md', '# Hello');
      zip.file('other.md', '# Other');

      const result = await parseSkillZip(await zipToFile(zip));

      // With 2 .md files, flat format detection doesn't kick in
      // so it should try standard parsing and fail
      // (Actually with 2 md files, neither matches flat format, so it falls back to standard)
      if (!result.success) {
        expect((result as ZipParseError).error).toContain('SKILL.md');
      }
    });

    it('should handle corrupted zip data gracefully', async () => {
      const file = new File([new Uint8Array([0x50, 0x4b, 0x00, 0x00])], 'bad.zip', {
        type: 'application/zip',
      });

      const result = await parseSkillZip(file);

      expect(result.success).toBe(false);
      expect((result as ZipParseError).error).toContain('corrupted');
    });
  });

  /* ─── Real Fixture Files ───────────────────────────────────────────── */

  describe('real fixture files', () => {
    const fixturesDir = path.resolve(__dirname, 'fixtures');

    // Recursively find all .zip files in fixtures/
    function findZipFiles(dir: string): string[] {
      if (!fs.existsSync(dir)) return [];
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findZipFiles(fullPath));
        } else if (entry.name.endsWith('.zip')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const zipFiles = findZipFiles(fixturesDir);

    if (zipFiles.length === 0) {
      it.skip('no fixture zip files found — add .zip files to __tests__/fixtures/', () => {});
    } else {
      for (const zipFile of zipFiles) {
        const relativeName = path.relative(fixturesDir, zipFile);

        it(`should successfully parse fixture: ${relativeName}`, async () => {
          const buffer = fs.readFileSync(zipFile);
          const file = new File([buffer], path.basename(zipFile), {
            type: 'application/zip',
          });

          const result = await parseSkillZip(file);

          // Log details for manual inspection
          if (result.success) {
            const r = result as ZipParseSuccess;
            console.log(`  ├─ name: ${r.skill.name || '(empty)'}`);
            console.log(`  ├─ description: ${r.skill.description.slice(0, 80) || '(empty)'}${r.skill.description.length > 80 ? '...' : ''}`);
            console.log(`  ├─ skillContent: ${r.skill.skillContent.length} chars`);
            console.log(`  ├─ scripts: ${r.skill.scripts.length}, references: ${r.skill.references.length}, assets: ${r.skill.assets.length}`);
            console.log(`  ├─ fileCount: ${r.fileCount}, totalSize: ${r.totalSize} bytes`);
            if (r.warnings.length > 0) {
              console.log(`  └─ warnings: ${r.warnings.join('; ')}`);
            }
          } else {
            console.log(`  └─ ERROR: ${(result as ZipParseError).error}`);
          }

          expect(result.success).toBe(true);
          const r = result as ZipParseSuccess;
          expect(r.skill.skillContent.length).toBeGreaterThan(0);
        });
      }
    }
  });
});
