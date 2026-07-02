#!/usr/bin/env node
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { configUrlCommand } from './commands/config.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { listCommand } from './commands/list.js';
import { installCommand } from './commands/install.js';
import { updateCommand } from './commands/update.js';
import { uninstallCommand } from './commands/uninstall.js';
import { outdatedCommand } from './commands/outdated.js';
import { readConfig } from './lib/config.js';
import { resolveToken } from './lib/auth.js';
import { readReceipt } from './lib/installed-receipt.js';

const program = new Command();

program
  .name('skillspell')
  .description('SkillSpell CLI — install AI agent skills into your coding environment')
  .version('1.0.2')
  .option('--yes', 'skip interactive prompts (non-interactive / CI mode)');

// skillspell config url [<url>]
// CFG-01: set or get the API base URL
const configCmd = program.command('config').description('Manage CLI configuration');
configCmd
  .command('url [url]')
  .description(
    'Set or get the API base URL. Default: https://app.skillspell.dev\n' +
    'Example: skillspell config url https://your-instance.example.com',
  )
  .action(async (url: string | undefined) => {
    await configUrlCommand(url);
  });

// skillspell login [--token <pat>] [--sso]
// AUTH-01: interactive email/password login
// AUTH-02: --token flag or SKILLSPELL_TOKEN env var
// SSO-01: --sso flag — browser-based SAML authentication
program
  .command('login [email] [password]')
  .description('Authenticate with SkillSpell (email/password or --token <PAT>)')
  .option('--token <pat>', 'authenticate with a personal access token directly')
  .option('--sso', 'authenticate via browser-based SAML SSO')
  .action(async (email: string | undefined, password: string | undefined, opts) => {
    const globalOpts = program.opts();
    await loginCommand(email, password, { yes: globalOpts.yes, token: opts.token, sso: opts.sso });
  });

// skillspell logout
// AUTH-04: clear stored credentials
program
  .command('logout')
  .description('Clear stored credentials')
  .action(async () => {
    await logoutCommand();
  });

// skillspell whoami
// AUTH-05: show current authenticated user
program
  .command('whoami')
  .description('Show the currently authenticated user')
  .option('--token <pat>', 'use this token instead of the stored credential')
  .action(async (opts) => {
    await whoamiCommand({ token: opts.token ?? undefined });
  });

// skillspell list [--search <query>]
// DISC-01: list published skills + caller's own private skills (authenticated)
//          or published-only when unauthenticated
// DISC-02: filter by name
// DISC-03: interactive picker in TTY mode
program
  .command('list')
  .description(
    'Browse skills\n' +
    '  Authenticated: shows published skills + your own private skills\n' +
    '  Unauthenticated: shows published skills only\n' +
    '  Without flags (in TTY): interactive picker\n' +
    '  With --search: filtered table output',
  )
  .option('-s, --search <query>', 'filter skills by name')
  .option('--token <pat>', 'use this token instead of the stored credential')
  .action(async (opts) => {
    const globalOpts = program.opts();
    const slug = await listCommand({ search: opts.search, yes: globalOpts.yes, token: opts.token });
    if (slug) {
      await installCommand(slug, { yes: globalOpts.yes });
    }
  });

// skillspell install [slug] [--target <tool>] [--workspace]
// INST-01: global install
// INST-02: workspace install
// INST-03: cross-platform path resolution
// INST-04: interactive tool/scope picker
// INST-05: confirmation message
program
  .command('install [slug]')
  .description(
    'Install a skill\n' +
    '  Targets: claude, cursor, windsurf, copilot, roo\n' +
    '  Example: skillspell install commit-message --target cursor\n' +
    '  Example: skillspell install commit-message --target copilot --workspace',
  )
  .option('-t, --target <tool>', 'target AI coding tool (claude, cursor, windsurf, copilot, roo)')
  .option('-w, --workspace', 'install to current project directory (workspace-local)')
  .option('--token <pat>', 'use this token for authenticated download')
  .action(async (slug: string | undefined, opts) => {
    const globalOpts = program.opts();
    await installCommand(slug, {
      target: opts.target,
      workspace: opts.workspace,
      yes: globalOpts.yes,
      token: opts.token,
    });
  });

// skillspell update [slug]
// LIFE-01: Re-download and overwrite an installed skill
// LIFE-03: Scope from receipt — no flag re-specification
program
  .command('update [slug]')
  .description(
    'Update an installed skill to its latest version\n' +
    '  Example: skillspell update commit-message\n' +
    '  No slug: interactive picker from installed skills',
  )
  .option('--token <pat>', 'use this token for authenticated download')
  .action(async (slug: string | undefined, opts) => {
    const globalOpts = program.opts();
    await updateCommand(slug, { yes: globalOpts.yes, token: opts.token });
  });

// skillspell uninstall [slug]
// LIFE-02: Remove an installed skill
// LIFE-03: Scope from receipt — no flag re-specification
program
  .command('uninstall [slug]')
  .description(
    'Remove an installed skill\n' +
    '  Example: skillspell uninstall commit-message\n' +
    '  No slug: interactive picker from installed skills',
  )
  .option('--token <pat>', 'use this token')
  .action(async (slug: string | undefined, opts) => {
    const globalOpts = program.opts();
    await uninstallCommand(slug, { yes: globalOpts.yes, token: opts.token });
  });

// skillspell outdated
// UX-03: Show installed skills with update status
program
  .command('outdated')
  .description(
    'Show installed skills and check for updates\n' +
    '  Reads both global and workspace installs\n' +
    '  Example: skillspell outdated',
  )
  .option('--token <pat>', 'use this token')
  .action(async (opts) => {
    await outdatedCommand({ token: opts.token });
  });

// D-13: State-aware wizard — shown when skillspell is invoked with no arguments
program.action(async () => {
  const [config, token, globalReceipt, workspaceReceipt] = await Promise.all([
    readConfig(),
    resolveToken({}),
    readReceipt(false),
    readReceipt(true),
  ]);
  void config;
  const totalInstalled =
    Object.values(globalReceipt).flat().length +
    Object.values(workspaceReceipt).flat().length;

  p.intro(`skillspell v${program.version()}`);
  if (token) {
    p.log.success('Logged in');
  } else {
    p.log.warn('Not logged in — run `skillspell login` to get started');
  }
  if (totalInstalled > 0) {
    p.log.info(
      `${totalInstalled} skill(s) installed — run \`skillspell outdated\` to check for updates`,
    );
  } else {
    p.log.info('No skills installed — run `skillspell list` to browse available skills');
  }
  p.note(
    'Commands: login, logout, whoami, list, install, update, uninstall, outdated, config',
    'Help',
  );
});

// RESEARCH.md Pitfall 5: ALWAYS use parseAsync for async action handlers
await program.parseAsync(process.argv);
