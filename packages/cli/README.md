# @skillspell/cli

Install and manage [SkillSpell](https://github.com/arnoldsimha/skillspell) AI agent skills — reusable, structured instruction sets — directly into your coding environment (Claude Code, Cursor, Windsurf, GitHub Copilot, Roo).

## Install

```bash
npm install -g @skillspell/cli
```

Requires Node.js 20+. This installs the `skillspell` command.

Or run it without installing:

```bash
npx @skillspell/cli list
```

## Quick start

```bash
skillspell login                       # authenticate
skillspell list                        # browse skills (interactive picker in a TTY)
skillspell install commit-message      # install a skill
skillspell outdated                    # check installed skills for updates
```

Running `skillspell` with no arguments shows a state-aware overview (login status, installed count, next steps).

## Commands

| Command | Description |
| --- | --- |
| `skillspell login [email] [password]` | Authenticate via email/password, `--token <PAT>`, or `--sso` (browser SAML). |
| `skillspell logout` | Clear stored credentials. |
| `skillspell whoami` | Show the currently authenticated user. |
| `skillspell list` | Browse skills. Authenticated shows your private skills too; `--search <query>` filters. |
| `skillspell install [slug]` | Install a skill. `--target <tool>` (claude, cursor, windsurf, copilot, roo), `--workspace` for project-local. |
| `skillspell update [slug]` | Update an installed skill to its latest version. |
| `skillspell uninstall [slug]` | Remove an installed skill. |
| `skillspell outdated` | List installed skills (global + workspace) and check for updates. |
| `skillspell config url [url]` | Get or set the API base URL (default `https://app.skillspell.dev`). |

Most commands accept `--token <pat>` to use a personal access token instead of stored credentials, and the global `--yes` flag for non-interactive / CI use.

### Examples

```bash
# Install into Cursor, project-local
skillspell install commit-message --target cursor --workspace

# Non-interactive install for CI
skillspell install commit-message --target claude --yes

# Point the CLI at a self-hosted instance
skillspell config url https://skillspell.your-company.com
```

## License

Apache-2.0
