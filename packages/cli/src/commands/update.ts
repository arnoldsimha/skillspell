import * as p from '@clack/prompts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, normalize } from 'node:path';
import os from 'node:os';
import { createPatch } from 'diff';
import { resolveToken } from '../lib/auth.js';
import { readConfig } from '../lib/config.js';
import { createApiClient, ApiError } from '../lib/api-client.js';
import { toSlug } from '../lib/slugify.js';
import { upsertSection } from '../lib/section-manager.js';
import { readReceipt, upsertReceiptEntry } from '../lib/installed-receipt.js';
import type { ExportFormat, PublicSkillSummary, PublicSkillDownload, InstalledReceiptEntry } from '../types.js';

/**
 * Guards against path traversal from tampered receipt entries.
 * Whitelist: installedPath must reside under HOME or CWD.
 * Prevents a tampered receipt from writing to arbitrary user-writable paths
 * (e.g. ~/.ssh/authorized_keys) even without '..' in the path.
 */
function assertSafePath(installedPath: string): void {
  const normalized = resolve(normalize(installedPath));
  const safeRoots = [resolve(os.homedir()), resolve(process.cwd())];
  const isSafe = safeRoots.some((root) => normalized.startsWith(root + '/') || normalized === root);
  if (!isSafe) {
    throw new Error(`Refusing to operate on path outside safe root: ${installedPath}`);
  }
}

interface UpdateOptions {
  yes?: boolean;
  token?: string;
}

/**
 * Resolves a slug to { id, updatedAt } — same pattern as install.ts but also captures updatedAt.
 * RESEARCH.md critical finding: updatedAt NOT in download response — must capture from listing.
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
      `Skill not found in registry: "${slug}". It may have been removed.`,
    );
  }
  return { id: match.id, updatedAt: match.updatedAt };
}

/**
 * skillspell update [slug]
 * LIFE-01: Re-download and overwrite an installed skill.
 * LIFE-03: Scope (global vs workspace) determined from receipt — no flag re-specification.
 * D-05: No slug → interactive picker from receipt.
 * D-06: Multiple installs for same slug → picker to disambiguate.
 * D-10: Show diff before overwrite when content differs.
 * D-11: --yes / CI mode skips diff and confirmation.
 */
export async function updateCommand(slug: string | undefined, options: UpdateOptions): Promise<void> {
  const config = await readConfig();

  // D-15: Soft auth nudge — non-blocking
  const token = await resolveToken({ token: options.token });
  if (!token) {
    p.log.warn('Not authenticated — run `skillspell login` to access private skills.');
  }

  const client = createApiClient(config.baseUrl, token ?? undefined);
  const isCI = !process.stdin.isTTY || !!process.env.CI || !!options.yes;
  const isInteractive = !isCI;

  // Determine which receipt entry to update
  let entry: InstalledReceiptEntry;

  if (!slug) {
    // D-05: No slug — show interactive picker from both receipt scopes
    const [globalReceipt, workspaceReceipt] = await Promise.all([
      readReceipt(false),
      readReceipt(true),
    ]);
    const allEntries = [
      ...Object.values(globalReceipt).flat(),
      ...Object.values(workspaceReceipt).flat(),
    ];
    if (allEntries.length === 0) {
      p.log.info('No installed skills found. Run `skillspell list` to browse skills.');
      return;
    }
    if (!isInteractive) {
      p.cancel('Specify a slug in non-interactive mode: skillspell update <slug>');
      process.exit(1);
    }
    const chosen = await p.select({
      message: 'Select installed skill to update:',
      options: allEntries.map((e, idx) => ({
        value: idx,
        label: e.slug,
        hint: `${e.target} / ${e.workspace ? 'workspace' : 'global'} — ${e.installedPath}`,
      })),
    });
    if (p.isCancel(chosen)) { p.cancel('Cancelled.'); process.exit(0); }
    entry = allEntries[chosen as number];
    slug = entry.slug;
  } else {
    // Slug given — look up in receipt
    const [globalReceipt, workspaceReceipt] = await Promise.all([
      readReceipt(false),
      readReceipt(true),
    ]);
    const globalEntries = (globalReceipt[slug] ?? []).filter(e => !e.workspace);
    const workspaceEntries = (workspaceReceipt[slug] ?? []).filter(e => e.workspace);
    const allEntries = [...globalEntries, ...workspaceEntries];

    if (allEntries.length === 0) {
      p.cancel(`Skill "${slug}" is not installed. Run \`skillspell list\` to browse skills.`);
      process.exit(1);
    }

    if (allEntries.length > 1) {
      // D-06: Multiple installs for this slug — ask which to update
      if (!isInteractive) {
        p.cancel(`Multiple installs found for "${slug}". Specify --target and --workspace flags or run interactively.`);
        process.exit(1);
      }
      const chosen = await p.select({
        message: `Multiple installs of "${slug}" found. Select which to update:`,
        options: allEntries.map((e, idx) => ({
          value: idx,
          label: `${e.target} / ${e.workspace ? 'workspace' : 'global'}`,
          hint: e.installedPath,
        })),
      });
      if (p.isCancel(chosen)) { p.cancel('Cancelled.'); process.exit(0); }
      entry = allEntries[chosen as number];
    } else {
      entry = allEntries[0];
    }
  }

  // CR-01: Validate installedPath from receipt before any filesystem operation
  try {
    assertSafePath(entry.installedPath);
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Determine if this is a section-managed (shared) file from the target
  const isSharedFile = (entry.target as ExportFormat) === 'windsurf' || (entry.target as ExportFormat) === 'copilot';

  // Download latest version
  const s1 = p.spinner();
  s1.start('Downloading latest version…');
  let skillUpdatedAt: string;
  let skill: PublicSkillDownload;
  try {
    const resolved = await resolveSlugToId(slug, client);
    skillUpdatedAt = resolved.updatedAt;
    skill = await client.request<PublicSkillDownload>(`/public/skills/${resolved.id}/download`);
    s1.stop('Downloaded.');
  } catch (err) {
    s1.stop('Failed.');
    if (err instanceof ApiError && err.statusCode === 0) {
      p.cancel(`Cannot reach ${config.baseUrl}. Check your network.`);
    } else {
      p.cancel(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }

  // For non-shared files: read existing content to compare (D-10)
  if (!isSharedFile) {
    let existingContent = '';
    try {
      existingContent = await readFile(entry.installedPath, 'utf8');
    } catch {
      // File does not exist yet — proceed without diff
    }

    const newContent = skill!.content;

    if (existingContent !== newContent && !isCI) {
      // D-10: Show unified diff before confirmation
      const patchText = createPatch(
        entry.installedPath,
        existingContent,
        newContent,
        'installed',
        'latest',
      );
      // Skip the patch header lines (Index:, ===, ---, +++) — show changed lines only
      const coloredLines = patchText
        .split('\n')
        .slice(4)
        .map((line) => {
          if (line.startsWith('+')) return `\x1b[32m${line}\x1b[0m`;
          if (line.startsWith('-')) return `\x1b[31m${line}\x1b[0m`;
          if (line.startsWith('@')) return `\x1b[36m${line}\x1b[0m`;
          return line;
        })
        .join('\n');
      if (coloredLines.trim()) {
        p.log.message(coloredLines);
      }

      // D-10: Confirm overwrite (Pitfall 2: always isCancel check)
      const answer = await p.confirm({ message: 'Overwrite with latest version? [y/N]', initialValue: false });
      if (p.isCancel(answer)) { p.cancel('Cancelled.'); process.exit(0); }
      if (!answer) { p.cancel('Aborted.'); process.exit(0); }
    }
    // D-11: CI/--yes → write without diff or confirm

    const s2 = p.spinner();
    s2.start('Updating…');
    try {
      await mkdir(dirname(entry.installedPath), { recursive: true });
      await writeFile(entry.installedPath, newContent, 'utf8');
      s2.stop('Updated.');
    } catch (err) {
      s2.stop('Failed.');
      p.cancel(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  } else {
    // D-12: Section-managed file (Windsurf, Copilot) — upsertSection overwrites section in place
    const s2 = p.spinner();
    s2.start('Updating…');
    try {
      let existing = '';
      try { existing = await readFile(entry.installedPath, 'utf8'); } catch { }
      const sectionSlug = skill!.slug || slug;
      const updated = upsertSection(existing, sectionSlug, skill!.content);
      await mkdir(dirname(entry.installedPath), { recursive: true });
      await writeFile(entry.installedPath, updated, 'utf8');
      s2.stop('Updated.');
    } catch (err) {
      s2.stop('Failed.');
      p.cancel(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // Pitfall 5: Replace entry in place (not append) via upsertReceiptEntry
  // WR-01: Wrap in try/catch so a receipt write failure doesn't become an unhandled rejection.
  try {
    await upsertReceiptEntry({
      slug: slug!,
      target: entry.target as ExportFormat,
      workspace: entry.workspace,
      installedPath: entry.installedPath,
      installedAt: new Date().toISOString(),
      skillUpdatedAt: skillUpdatedAt!,
    });
  } catch (err) {
    p.cancel(`Receipt update failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  p.log.success(`Updated ${slug} at ${entry.installedPath}`);
}
