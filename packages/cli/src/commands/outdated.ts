import * as p from '@clack/prompts';
import { readConfig } from '../lib/config.js';
import { resolveToken } from '../lib/auth.js';
import { createApiClient, ApiError } from '../lib/api-client.js';
import { toSlug } from '../lib/slugify.js';
import { readReceipt } from '../lib/installed-receipt.js';
import type { PublicSkillSummary } from '../types.js';
import type { InstalledReceiptEntry } from '../lib/installed-receipt.js';

interface OutdatedOptions {
  token?: string;
}

interface OutdatedRow {
  slug: string;
  target: string;
  scope: 'global' | 'workspace';
  installedAt: string;
  latestUpdatedAt: string | null;
  skillUpdatedAt: string;
  status: string;
}

/**
 * skillspell outdated
 * UX-03: Show all installed skills with their update status.
 * D-07: Table — SLUG | TARGET | SCOPE | INSTALLED | LATEST | STATUS
 * D-08: Shows ALL installed skills (not just outdated) — full inventory view.
 * D-09: Explicit user command — no background check on every invocation.
 * D-15: Soft auth nudge if unauthenticated — does NOT block (public listing endpoint works without auth).
 * Claude's Discretion: Parallel API fetches via Promise.all; 'removed from registry' for unknown slugs.
 */
export async function outdatedCommand(options: OutdatedOptions): Promise<void> {
  const config = await readConfig();

  // D-15: Soft auth nudge — non-blocking
  const token = await resolveToken({ token: options.token });
  if (!token) {
    p.log.warn('Not authenticated — run `skillspell login` to access private skills.');
  }

  const client = createApiClient(config.baseUrl, token ?? undefined);

  // D-08: Read BOTH receipt scopes for full inventory
  const [globalReceipt, workspaceReceipt] = await Promise.all([
    readReceipt(false),
    readReceipt(true),
  ]);

  // Flatten all entries with their scope label
  const allEntries: Array<InstalledReceiptEntry & { scope: 'global' | 'workspace' }> = [
    ...Object.values(globalReceipt).flat().map((e) => ({ ...e, scope: 'global' as const })),
    ...Object.values(workspaceReceipt).flat().map((e) => ({ ...e, scope: 'workspace' as const })),
  ];

  if (allEntries.length === 0) {
    p.log.info('No installed skills found. Run `skillspell list` to browse available skills.');
    return;
  }

  // Collect unique slugs for parallel API lookup
  const uniqueSlugs = [...new Set(allEntries.map((e) => e.slug))];

  const s = p.spinner();
  s.start('Checking for updates\u2026');

  let slugToLatest: Map<string, string | null>;
  try {
    // D-09 (Claude's Discretion): parallel fetch — one listing request per unique slug
    const results = await Promise.all(
      uniqueSlugs.map(async (slug) => {
        try {
          const skills = await client.request<PublicSkillSummary[]>(
            `/public/skills?search=${encodeURIComponent(slug)}&limit=10`,
          );
          // WR-04: Guard against unexpected API response shapes (e.g., object instead of array)
          if (!Array.isArray(skills)) {
            p.log.warn(`Unexpected API response for "${slug}" — treating as removed from registry.`);
            return { slug, updatedAt: null };
          }
          const match = skills.find((sk) => toSlug(sk.name) === slug);
          return { slug, updatedAt: match?.updatedAt ?? null };
        } catch {
          // If individual slug lookup fails, treat as removed
          return { slug, updatedAt: null };
        }
      }),
    );
    slugToLatest = new Map(results.map((r) => [r.slug, r.updatedAt]));
    s.stop('Done.');
  } catch (err) {
    s.stop('Failed.');
    if (err instanceof ApiError && err.statusCode === 0) {
      p.cancel(
        `Cannot reach ${config.baseUrl}. Check your network or run \`skillspell config url <base-url>\`.`,
      );
    } else {
      p.cancel(`Failed to check updates: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }

  // Build rows
  const rows: OutdatedRow[] = allEntries.map((entry) => {
    const latestUpdatedAt = slugToLatest.get(entry.slug) ?? null;
    let status: string;
    if (latestUpdatedAt === null) {
      status = 'removed from registry';
    } else if (entry.skillUpdatedAt < latestUpdatedAt) {
      status = 'update available';
    } else {
      status = 'up-to-date';
    }
    return {
      slug: entry.slug,
      target: entry.target,
      scope: entry.scope,
      installedAt: entry.installedAt.slice(0, 10),
      latestUpdatedAt,
      skillUpdatedAt: entry.skillUpdatedAt,
      status,
    };
  });

  // D-07: Table output — dynamic column widths
  const slugWidth = Math.max(4, ...rows.map((r) => r.slug.length));
  const targetWidth = Math.max(6, ...rows.map((r) => r.target.length));
  const scopeWidth = Math.max(5, ...rows.map((r) => r.scope.length));
  const installedWidth = 10; // YYYY-MM-DD
  const latestWidth = 10;    // YYYY-MM-DD or 'n/a'
  const statusWidth = Math.max(6, ...rows.map((r) => r.status.length));

  const header =
    'SLUG'.padEnd(slugWidth) + '  ' +
    'TARGET'.padEnd(targetWidth) + '  ' +
    'SCOPE'.padEnd(scopeWidth) + '  ' +
    'INSTALLED'.padEnd(installedWidth) + '  ' +
    'LATEST'.padEnd(latestWidth) + '  ' +
    'STATUS'.padEnd(statusWidth);
  const divider = '\u2500'.repeat(header.length);

  console.log(header);
  console.log(divider);
  for (const row of rows) {
    const latest = row.latestUpdatedAt ? row.latestUpdatedAt.slice(0, 10) : 'n/a';
    console.log(
      row.slug.padEnd(slugWidth) + '  ' +
      row.target.padEnd(targetWidth) + '  ' +
      row.scope.padEnd(scopeWidth) + '  ' +
      row.installedAt.padEnd(installedWidth) + '  ' +
      latest.padEnd(latestWidth) + '  ' +
      row.status.padEnd(statusWidth),
    );
  }
  console.log(`\n${allEntries.length} skill${allEntries.length === 1 ? '' : 's'} installed.`);
}
