import * as p from '@clack/prompts';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import os from 'node:os';
import { resolveToken } from '../lib/auth.js';
import { readConfig } from '../lib/config.js';
import { removeSection } from '../lib/section-manager.js';
import { readReceipt, removeReceiptEntry } from '../lib/installed-receipt.js';
import type { ExportFormat, InstalledReceiptEntry } from '../types.js';

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

interface UninstallOptions {
  yes?: boolean;
  token?: string;
}

/** True for targets where the skill lives in a shared file managed by sections (D-12). */
function isSharedFileTarget(target: ExportFormat): boolean {
  return target === 'windsurf' || target === 'copilot';
}

/**
 * skillspell uninstall [slug]
 * LIFE-02: Remove an installed skill file and its receipt entry.
 * LIFE-03: Scope (global vs workspace) from receipt — no flag re-specification needed.
 * D-05: No slug → interactive picker from receipt.
 * D-06: Multiple installs for same slug → picker to disambiguate.
 * D-12: Section-managed files (Windsurf/Copilot) → removeSection, not unlink.
 * D-15: Soft auth nudge if unauthenticated.
 */
export async function uninstallCommand(slug: string | undefined, options: UninstallOptions): Promise<void> {
  const config = await readConfig();
  void config; // uninstall is filesystem-only but consistent to read config for baseUrl context

  // D-15: Soft auth nudge — non-blocking
  const token = await resolveToken({ token: options.token });
  if (!token) {
    p.log.warn('Not authenticated — run `skillspell login` to access private skills.');
  }

  const isCI = !process.stdin.isTTY || !!process.env.CI || !!options.yes;
  const isInteractive = !isCI;

  // Determine which receipt entry to remove
  let entry: InstalledReceiptEntry;

  if (!slug) {
    // D-05: No slug — interactive picker from both receipt scopes
    const [globalReceipt, workspaceReceipt] = await Promise.all([
      readReceipt(false),
      readReceipt(true),
    ]);
    const allEntries = [
      ...Object.values(globalReceipt).flat().filter(e => !e.workspace),
      ...Object.values(workspaceReceipt).flat().filter(e => e.workspace),
    ];
    if (allEntries.length === 0) {
      p.log.info('No installed skills found.');
      return;
    }
    if (!isInteractive) {
      p.cancel('Specify a slug in non-interactive mode: skillspell uninstall <slug>');
      process.exit(1);
    }
    const chosen = await p.select({
      message: 'Select installed skill to remove:',
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
      p.cancel(`Skill "${slug}" is not installed.`);
      process.exit(1);
    }

    if (allEntries.length > 1) {
      // D-06: Multiple installs — picker to disambiguate
      if (!isInteractive) {
        p.cancel(`Multiple installs found for "${slug}". Run interactively to select which to remove.`);
        process.exit(1);
      }
      const chosen = await p.select({
        message: `Multiple installs of "${slug}" found. Select which to remove:`,
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

  // Confirmation before deletion (Pitfall 2: always isCancel check)
  if (!isCI) {
    const answer = await p.confirm({
      message: `Remove ${entry.slug} from ${entry.installedPath}?`,
      initialValue: false,
    });
    if (p.isCancel(answer)) { p.cancel('Cancelled.'); process.exit(0); }
    if (!answer) { p.cancel('Aborted.'); process.exit(0); }
  }

  // CR-01: Validate installedPath from receipt before any filesystem operation
  try {
    assertSafePath(entry.installedPath);
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Remove the file
  try {
    if (isSharedFileTarget(entry.target as ExportFormat)) {
      // D-12: Section-managed file — remove only this skill's section, leave others intact
      let existing: string;
      try {
        existing = await readFile(entry.installedPath, 'utf8');
      } catch {
        // File already deleted — proceed to receipt cleanup
        await removeReceiptEntry(slug, entry.target as ExportFormat, entry.workspace);
        p.log.success(`Removed ${slug} (file was already deleted)`);
        return;
      }
      // WR-03: Use entry.slug (stored at install time) not the CLI argument — section markers
      // were written using skill.slug at install time, which survives skill renames.
      const updated = removeSection(existing, entry.slug);
      await writeFile(entry.installedPath, updated, 'utf8');
    } else {
      // Direct file removal — idempotent if already deleted (same as auth.ts clearCredential pattern)
      try {
        await unlink(entry.installedPath);
      } catch {
        // File does not exist — idempotent behavior
      }
    }
  } catch (err) {
    p.cancel(`Failed to remove file: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Remove receipt entry
  // WR-02: Wrap in try/catch — a receipt failure here means the file was removed but the
  // receipt still lists the skill. Surface a clear message rather than an unhandled rejection.
  try {
    await removeReceiptEntry(slug, entry.target as ExportFormat, entry.workspace);
  } catch (err) {
    p.cancel(`Receipt cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  p.log.success(`Removed ${slug} from ${entry.installedPath}`);
}
