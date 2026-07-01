import { join } from 'node:path';
import os from 'node:os';
import type { ExportFormat } from '../types.js';

export interface InstallPath {
  path: string;
  isSharedFile: boolean;
}

/**
 * Resolves the filesystem path for a skill install.
 * Mirrors ExportService.FORMATS table from packages/backend/src/export/export.service.ts:92.
 * D-08: path table; D-09: Windsurf/Copilot are workspace-only; D-10: actionable error message.
 */
export function resolveInstallPath(
  format: ExportFormat,
  safeName: string,
  workspace: boolean,
): InstallPath {
  const home = os.homedir();

  switch (format) {
    case 'claude':
      return {
        path: workspace
          ? join('.claude', 'skills', safeName, 'SKILL.md')
          : join(home, '.claude', 'skills', safeName, 'SKILL.md'),
        isSharedFile: false,
      };
    case 'cursor':
      return {
        path: workspace
          ? join('.cursor', 'rules', `${safeName}.md`)
          : join(home, '.cursor', 'rules', `${safeName}.md`),
        isSharedFile: false,
      };
    case 'windsurf':
      if (!workspace) {
        throw new Error(
          'Windsurf uses project-local files only.\nRun with --workspace to install into the current project.',
        );
      }
      return { path: '.windsurfrules', isSharedFile: true };
    case 'copilot':
      if (!workspace) {
        throw new Error(
          'Copilot uses project-local files only.\nRun with --workspace to install into the current project.',
        );
      }
      return { path: join('.github', 'copilot-instructions.md'), isSharedFile: true };
    case 'roo':
      return {
        path: workspace
          ? join('.roo', 'skills', safeName, 'SKILL.md')
          : join(home, '.roo', 'skills', safeName, 'SKILL.md'),
        isSharedFile: false,
      };
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown format: ${String(_exhaustive)}`);
    }
  }
}
