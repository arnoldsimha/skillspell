import * as p from '@clack/prompts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveToken } from '../lib/auth.js';
import { readConfig } from '../lib/config.js';
import { createApiClient, ApiError } from '../lib/api-client.js';
import { toSlug } from '../lib/slugify.js';
import { sanitizePath } from '../lib/sanitize.js';
import { resolveInstallPath } from '../lib/paths.js';
import { upsertSection } from '../lib/section-manager.js';
import { upsertReceiptEntry } from '../lib/installed-receipt.js';
import { listCommand } from './list.js';
import type { ExportFormat, PublicSkillSummary, PublicSkillDownload } from '../types.js';

interface InstallOptions {
  target?: string;
  workspace?: boolean;
  yes?: boolean;
  token?: string;
}

const SUPPORTED_TOOLS: ExportFormat[] = ['claude', 'cursor', 'windsurf', 'copilot', 'roo'];

/**
 * Resolves a user-supplied slug to a skill UUID and updatedAt timestamp.
 * RESEARCH.md critical finding: updatedAt is NOT in the download response — must capture here.
 * Returns { id, updatedAt } so callers can write skillUpdatedAt into the install receipt (D-02).
 * RESEARCH.md Pattern 5: derives slug client-side from name field and matches.
 * Pitfall 4: toSlug() must match backend exactly.
 * T-05-06-03: encodeURIComponent applied to slug in URL construction.
 */
async function resolveSlugToId(
  slug: string,
  client: ReturnType<typeof createApiClient>,
): Promise<{ id: string; updatedAt: string }> {
  const skills = await client.request<PublicSkillSummary[]>(
    `/public/skills?search=${encodeURIComponent(slug)}&limit=50`,
  );
  const match = skills.find((s) => toSlug(s.name) === slug);
  if (!match) {
    throw new Error(
      `Skill not found: "${slug}". Run \`skillspell list\` to see available skills.`,
    );
  }
  return { id: match.id, updatedAt: match.updatedAt };
}

/**
 * skillspell install <slug> [--target <tool>] [--workspace]
 * INST-01: global install with --target <tool>
 * INST-02: workspace install with --workspace
 * INST-03: cross-platform path resolution
 * INST-04: interactive tool/scope picker when no flags in TTY
 * INST-05: confirmation showing exact file path
 */
export async function installCommand(slug: string | undefined, options: InstallOptions): Promise<void> {
  const config = await readConfig();
  const token = await resolveToken({ token: options.token });
  // Download endpoint requires auth (PAT or public — use token if available)
  const client = createApiClient(config.baseUrl, token ?? undefined);
  const isInteractive = process.stdin.isTTY && !process.env.CI && !options.yes;

  // D-14: No slug provided — open interactive skill picker
  if (!slug) {
    if (!isInteractive) {
      p.cancel('Specify a skill slug or run interactively to pick a skill.');
      process.exit(1);
    }
    const picked = await listCommand({ yes: false });
    if (!picked) {
      // User pressed Ctrl+C or no skills found — listCommand already emitted message
      process.exit(0);
    }
    slug = picked;
  }

  // Determine format (target tool)
  let format: ExportFormat;
  if (options.target) {
    if (!SUPPORTED_TOOLS.includes(options.target as ExportFormat)) {
      p.cancel(
        `Unknown target: "${options.target}". Supported: ${SUPPORTED_TOOLS.join(', ')}`,
      );
      process.exit(1);
    }
    format = options.target as ExportFormat;
  } else if (isInteractive) {
    // INST-04: Interactive tool picker
    const toolChoice = await p.select({
      message: 'Select AI coding tool:',
      options: SUPPORTED_TOOLS.map((t) => ({ value: t, label: toolLabel(t) })),
    });
    if (p.isCancel(toolChoice)) { p.cancel('Cancelled.'); process.exit(0); }
    format = toolChoice as ExportFormat;
  } else {
    p.cancel('Specify --target <tool> in non-interactive mode. Supported: claude, cursor, windsurf, copilot, roo');
    process.exit(1);
  }

  // Determine scope (global vs workspace) — D-09/D-11
  let workspace: boolean;
  const globalUnsupported = format === 'windsurf' || format === 'copilot';

  if (options.workspace !== undefined) {
    workspace = options.workspace;
  } else if (isInteractive) {
    // D-11: Show both options; gray out global for tools that don't support it
    const scopeOptions = globalUnsupported
      ? [
          {
            value: 'global',
            label: 'Global',
            hint: `(not supported for ${toolLabel(format)})`,
            disabled: true,
          },
          { value: 'workspace', label: `Workspace (${workspacePathHint(format)})` },
        ]
      : [
          { value: 'global', label: `Global (${globalPathHint(format)})` },
          { value: 'workspace', label: 'Workspace (project-local path)' },
        ];

    const scopeChoice = await p.select({ message: 'Install scope:', options: scopeOptions });
    if (p.isCancel(scopeChoice)) { p.cancel('Cancelled.'); process.exit(0); }
    workspace = scopeChoice === 'workspace';
  } else {
    // Non-interactive, no --workspace flag: default to global (or error for unsupported)
    workspace = false;
  }

  // Validate: Windsurf/Copilot global is unsupported (D-10)
  if (globalUnsupported && !workspace) {
    p.cancel(
      `${toolLabel(format)} uses project-local files only.\nRun with --workspace to install into the current project.`,
    );
    process.exit(1);
  }

  // Resolve slug → UUID
  const s1 = p.spinner();
  s1.start('Resolving skill…');
  let skillId: string;
  let skillUpdatedAt: string;
  try {
    ({ id: skillId, updatedAt: skillUpdatedAt } = await resolveSlugToId(slug, client));
    s1.stop('Skill found.');
  } catch (err) {
    s1.stop('Not found.');
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Download skill content
  const s2 = p.spinner();
  s2.start('Downloading skill…');
  let skill: PublicSkillDownload;
  try {
    skill = await client.request<PublicSkillDownload>(`/public/skills/${skillId}/download`);
    s2.stop('Downloaded.');
  } catch (err) {
    s2.stop('Failed.');
    if (err instanceof ApiError && err.statusCode === 0) {
      p.cancel(`Cannot reach ${config.baseUrl}. Check your network.`);
    } else {
      p.cancel(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }

  // Resolve install path — sanitizePath applied to name (security: T-05-06-01)
  const safeName = sanitizePath(skill.name);
  let installPath: ReturnType<typeof resolveInstallPath>;
  try {
    installPath = resolveInstallPath(format, safeName, workspace);
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Write to filesystem
  const s3 = p.spinner();
  s3.start('Installing…');
  try {
    await mkdir(dirname(installPath.path), { recursive: true });

    if (installPath.isSharedFile) {
      // D-12: Section-managed write for Copilot/Windsurf shared files
      let existing = '';
      try {
        existing = await readFile(installPath.path, 'utf8');
      } catch {
        // File doesn't exist yet — start fresh
      }
      // Use slug from API response (survives renames) or fall back to user-supplied slug (D-12)
      const sectionSlug = skill.slug || slug;
      const updated = upsertSection(existing, sectionSlug, skill.content);
      await writeFile(installPath.path, updated, 'utf8');
    } else {
      // Direct write for dedicated files (Claude, Cursor, Roo)
      await writeFile(installPath.path, skill.content, 'utf8');
    }

    s3.stop('Installed.');
    // INST-05: Show exact path written
    p.log.success(`Installed to ${installPath.path}`);
    // D-01/D-02/D-03: Write install receipt for lifecycle commands (update/uninstall/outdated)
    await upsertReceiptEntry({
      slug: skill.slug || slug,
      target: format,
      workspace,
      installedPath: installPath.path,
      installedAt: new Date().toISOString(),
      skillUpdatedAt,
    });
  } catch (err) {
    s3.stop('Failed.');
    p.cancel(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function toolLabel(format: ExportFormat): string {
  const labels: Record<ExportFormat, string> = {
    claude: 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    copilot: 'GitHub Copilot',
    roo: 'Roo Code',
  };
  return labels[format];
}

function globalPathHint(format: ExportFormat): string {
  const hints: Record<ExportFormat, string> = {
    claude: '~/.claude/skills/',
    cursor: '~/.cursor/rules/',
    windsurf: '(workspace only)',
    copilot: '(workspace only)',
    roo: '~/.roo/skills/',
  };
  return hints[format];
}

function workspacePathHint(format: ExportFormat): string {
  const hints: Record<ExportFormat, string> = {
    claude: '.claude/skills/',
    cursor: '.cursor/rules/',
    windsurf: '.windsurfrules',
    copilot: '.github/copilot-instructions.md',
    roo: '.roo/skills/',
  };
  return hints[format];
}
