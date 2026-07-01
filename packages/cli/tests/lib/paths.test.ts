import { resolveInstallPath } from '../../src/lib/paths.js';
import os from 'node:os';
import path from 'node:path';

describe('resolveInstallPath (INST-03)', () => {
  const home = os.homedir();

  it('claude global: returns ~/.claude/skills/<name>/SKILL.md', () => {
    const result = resolveInstallPath('claude', 'my-skill', false);
    expect(result.path).toBe(path.join(home, '.claude', 'skills', 'my-skill', 'SKILL.md'));
    expect(result.isSharedFile).toBe(false);
  });

  it('claude workspace: returns .claude/skills/<name>/SKILL.md', () => {
    const result = resolveInstallPath('claude', 'my-skill', true);
    expect(result.path).toBe(path.join('.claude', 'skills', 'my-skill', 'SKILL.md'));
  });

  it('cursor global: returns ~/.cursor/rules/<name>.md', () => {
    const result = resolveInstallPath('cursor', 'my-skill', false);
    expect(result.path).toBe(path.join(home, '.cursor', 'rules', 'my-skill.md'));
    expect(result.isSharedFile).toBe(false);
  });

  it('cursor workspace: returns .cursor/rules/<name>.md', () => {
    const result = resolveInstallPath('cursor', 'my-skill', true);
    expect(result.path).toBe(path.join('.cursor', 'rules', 'my-skill.md'));
  });

  it('roo global: returns ~/.roo/skills/<name>/SKILL.md', () => {
    const result = resolveInstallPath('roo', 'my-skill', false);
    expect(result.path).toBe(path.join(home, '.roo', 'skills', 'my-skill', 'SKILL.md'));
  });

  it('windsurf workspace: returns .windsurfrules with isSharedFile=true (D-12)', () => {
    const result = resolveInstallPath('windsurf', 'any', true);
    expect(result.path).toBe('.windsurfrules');
    expect(result.isSharedFile).toBe(true);
  });

  it('copilot workspace: returns .github/copilot-instructions.md with isSharedFile=true (D-12)', () => {
    const result = resolveInstallPath('copilot', 'any', true);
    expect(result.path).toBe(path.join('.github', 'copilot-instructions.md'));
    expect(result.isSharedFile).toBe(true);
  });

  it('windsurf global: throws actionable error (D-09, D-10)', () => {
    expect(() => resolveInstallPath('windsurf', 'any', false)).toThrow(
      'Windsurf uses project-local files only.'
    );
  });

  it('copilot global: throws actionable error (D-09, D-10)', () => {
    expect(() => resolveInstallPath('copilot', 'any', false)).toThrow(
      'Copilot uses project-local files only.'
    );
  });
});
