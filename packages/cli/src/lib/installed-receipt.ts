/**
 * Install receipt management — tracks what skills have been installed, where, and when.
 * D-01: ~/.skillspell/installed.json for global installs
 * D-04: .skillspell/installed.json (CWD-relative) for workspace installs
 * D-03: Multiple installs per slug tracked as an array (same slug, different target/scope)
 */
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.js';
import type { ExportFormat } from '../types.js';

// D-02: Receipt entry schema
export interface InstalledReceiptEntry {
  slug: string;
  target: ExportFormat;
  workspace: boolean;
  installedPath: string;
  installedAt: string;        // ISO 8601
  skillUpdatedAt: string;     // from PublicSkillSummary.updatedAt at install time
}

// D-03: Map of slug → array of entries (same slug, multiple targets/scopes)
export type InstalledReceipt = Record<string, InstalledReceiptEntry[]>;

function receiptPath(workspace: boolean): string {
  return workspace
    ? join('.skillspell', 'installed.json')
    : join(CONFIG_DIR, 'installed.json');
}

function receiptDir(workspace: boolean): string {
  return workspace ? '.skillspell' : CONFIG_DIR;
}

/**
 * Read the receipt for the given scope.
 * Returns {} silently if the file does not exist (ENOENT).
 * Re-throws all other errors (e.g., SyntaxError from malformed JSON, permission errors)
 * so callers can surface them to the user rather than silently treating them as empty.
 */
export async function readReceipt(workspace: boolean): Promise<InstalledReceipt> {
  try {
    const raw = await readFile(receiptPath(workspace), 'utf8');
    return JSON.parse(raw) as InstalledReceipt;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/** Write the receipt for the given scope. Creates the directory if needed. */
export async function writeReceipt(receipt: InstalledReceipt, workspace: boolean): Promise<void> {
  await mkdir(receiptDir(workspace), { recursive: true });
  await writeFile(receiptPath(workspace), JSON.stringify(receipt, null, 2), 'utf8');
}

/**
 * Advisory write-lock for the receipt file using exclusive file creation (O_EXCL / 'wx' mode).
 * This is a best-effort lock suitable for a CLI tool — it prevents the most common race
 * (two parallel `skillspell install` invocations) but is not a full POSIX advisory lock.
 * A stale lock file left by a crashed process is cleaned up by retrying with a bounded backoff.
 *
 * Retry strategy: up to 10 attempts with 100 ms → 200 ms → 400 ms → … exponential back-off,
 * capped at 2 000 ms per sleep, total wait budget ~6 s before giving up.
 */
async function withReceiptLock<T>(workspace: boolean, fn: () => Promise<T>): Promise<T> {
  const dir = receiptDir(workspace);
  await mkdir(dir, { recursive: true });
  const lockFile = join(dir, 'installed.lock');

  const MAX_ATTEMPTS = 10;
  let delay = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const fh = await open(lockFile, 'wx').catch(() => null);
    if (fh) {
      try {
        return await fn();
      } finally {
        await fh.close();
        await unlink(lockFile).catch(() => {});
      }
    }
    // Lock held by another process — wait with exponential back-off
    await new Promise<void>((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 2000);
  }

  throw new Error(
    `Could not acquire receipt lock after ${MAX_ATTEMPTS} attempts. ` +
    `If this persists, remove ${lockFile} manually.`,
  );
}

/**
 * Add or replace a receipt entry for a specific slug+target+workspace combination.
 * D-03: Same slug can appear with different targets — only replace exact {target, workspace} match.
 * Pitfall 5: Always replace in-place, never append — avoids duplicate entries.
 */
export async function upsertReceiptEntry(entry: InstalledReceiptEntry): Promise<void> {
  await withReceiptLock(entry.workspace, async () => {
    const receipt = await readReceipt(entry.workspace);
    const existing = receipt[entry.slug] ?? [];
    const idx = existing.findIndex(
      (e) => e.target === entry.target && e.workspace === entry.workspace,
    );
    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
    }
    receipt[entry.slug] = existing;
    await writeReceipt(receipt, entry.workspace);
  });
}

/**
 * Remove a receipt entry for a specific slug+target+workspace combination.
 * Returns true if an entry was found and removed, false if no matching entry existed.
 * Deletes the slug key entirely when its array becomes empty.
 */
export async function removeReceiptEntry(
  slug: string,
  target: ExportFormat,
  workspace: boolean,
): Promise<boolean> {
  return withReceiptLock(workspace, async () => {
    const receipt = await readReceipt(workspace);
    const existing = receipt[slug] ?? [];
    const filtered = existing.filter((e) => !(e.target === target && e.workspace === workspace));
    if (filtered.length === existing.length) return false;
    if (filtered.length === 0) {
      delete receipt[slug];
    } else {
      receipt[slug] = filtered;
    }
    await writeReceipt(receipt, workspace);
    return true;
  });
}
