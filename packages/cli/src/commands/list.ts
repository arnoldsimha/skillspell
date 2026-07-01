import * as p from '@clack/prompts';
import { readConfig } from '../lib/config.js';
import { createApiClient, ApiError } from '../lib/api-client.js';
import { resolveToken } from '../lib/auth.js';
import { toSlug } from '../lib/slugify.js';
import type { PublicSkillSummary } from '../types.js';

interface ListOptions {
  search?: string;
  yes?: boolean;
  token?: string;
}

/**
 * skillspell list [--search <query>]
 * DISC-01: list published skills + caller's own private skills (authenticated)
 *          or published-only when unauthenticated
 * DISC-02: filter by name (--search flag)
 * DISC-03: interactive keyboard-navigable picker when running in TTY without flags
 *
 * When the user is authenticated the command calls GET /api/skills/discover which
 * returns published skills from all users merged with the caller's own private skills.
 * When unauthenticated it falls back to GET /api/public/skills (published-only).
 *
 * @returns selected skill id (interactive mode) or undefined (table mode)
 */
export async function listCommand(options: ListOptions): Promise<string | undefined> {
  const config = await readConfig();

  // Resolve auth token — honours SKILLSPELL_TOKEN env var, --token flag,
  // PAT credentials file, and SSO credentials file (with proactive refresh).
  const token = await resolveToken({ token: options.token });
  const client = createApiClient(config.baseUrl, token ?? undefined);

  // DISC-03: interactive only when TTY, not CI, no --yes, no --search
  const isInteractive =
    process.stdin.isTTY && !process.env.CI && !options.yes && !options.search;
  const limit = isInteractive ? 100 : 50;

  // Choose endpoint based on auth state.
  // Authenticated: /skills/discover — returns public + caller's own private skills.
  // Unauthenticated: /public/skills — returns published skills only.
  const basePath = token ? '/skills/discover' : '/public/skills';

  // DISC-02: search param URL-encoded safely via URLSearchParams (T-05-05-01)
  const params = new URLSearchParams({ limit: String(limit) });
  if (options.search) {
    params.set('search', options.search);
  }

  const s = p.spinner();
  s.start('Fetching skills\u2026');

  let skills: PublicSkillSummary[];
  try {
    skills = await client.request<PublicSkillSummary[]>(`${basePath}?${params.toString()}`);
    s.stop('Done.');
  } catch (err) {
    s.stop('Failed.');
    if (err instanceof ApiError && err.statusCode === 0) {
      p.cancel(
        `Cannot reach ${config.baseUrl}. Check your network or run \`skillspell config url <base-url>\`.`,
      );
    } else {
      p.cancel(
        `Failed to fetch skills: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    process.exit(1);
  }

  // UX-04: empty results message
  if (skills.length === 0) {
    p.log.info('No published skills found.');
    return undefined;
  }

  if (isInteractive) {
    // DISC-03: interactive picker via @clack/prompts select()
    const chosen = await p.select({
      message: 'Select a skill:',
      options: skills.map((skill) => ({
        value: skill.id,
        label: skill.name,
        hint: skill.description ? skill.description.slice(0, 60) : toSlug(skill.name),
      })),
    });

    // RESEARCH.md Pitfall 3: always check isCancel after p.select()
    if (p.isCancel(chosen)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const selected = skills.find((s) => s.id === chosen);
    return selected ? toSlug(selected.name) : undefined;
  }

  // Table output — DISC-01 (non-interactive / --search / CI mode)
  const rows = skills.map((skill) => ({
    name: skill.name,
    slug: toSlug(skill.name),
    description: skill.description ? skill.description.slice(0, 60) : '\u2014',
  }));

  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
  const slugWidth = Math.max(4, ...rows.map((r) => r.slug.length));
  const header = `${'NAME'.padEnd(nameWidth)}  ${'SLUG'.padEnd(slugWidth)}  DESCRIPTION`;
  const divider = '\u2500'.repeat(header.length);

  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(`${row.name.padEnd(nameWidth)}  ${row.slug.padEnd(slugWidth)}  ${row.description}`);
  }
  console.log(`\n${skills.length} skill${skills.length === 1 ? '' : 's'} found.`);

  return undefined;
}
