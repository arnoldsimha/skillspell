---
title: "CLI"
description: "Install and manage SkillSpell skills from your terminal with @skillspell/cli"
---

{/* generated-by: gsd-doc-writer */}
# SkillSpell CLI Guide

The `skillspell` CLI lets you browse, install, update, and remove AI agent skills from the SkillSpell registry into your local coding environment. Skills are installed as instruction files that your AI coding tool (Claude Code, Cursor, Windsurf, GitHub Copilot, or Roo Code) reads automatically.

> **Audience**: Developers who want to install published SkillSpell skills into their local environment, or automate skill management in CI pipelines.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Global Flags](#global-flags)
4. [Commands](#commands)
   - [login](#login)
   - [logout](#logout)
   - [whoami](#whoami)
   - [config url](#config-url)
   - [list](#list)
   - [install](#install)
   - [update](#update)
   - [uninstall](#uninstall)
   - [outdated](#outdated)
5. [Install Targets and File Paths](#install-targets-and-file-paths)
6. [Config File](#config-file)
7. [Credential Storage](#credential-storage)
8. [Install Receipt System](#install-receipt-system)
9. [Non-Interactive / CI Mode](#non-interactive--ci-mode)
10. [Troubleshooting](#troubleshooting)

---

## Installation

```bash
npm install -g @skillspell/cli
```

**Requirements:** Node.js >= 20

After installing, verify the binary is available:

```bash
skillspell --version
# prints the installed CLI version
```

---

## Quick Start

```bash
# 1. Log in to SkillSpell
skillspell login

# 2. Browse available skills (interactive picker)
skillspell list

# 3. Install a skill (interactive target + scope picker)
skillspell install commit-message

# 4. Check for updates later
skillspell outdated
```

Running `skillspell` with no arguments shows a state-aware summary — whether you are logged in and how many skills are installed.

---

## Global Flags

These flags apply to every command:

| Flag | Description |
|------|-------------|
| `--yes` | Skip all interactive prompts (non-interactive / CI mode). Commands that require choices will error unless all required arguments are provided explicitly. |
| `--version` | Print the CLI version and exit. |
| `--help` | Print help text for the command and exit. |

---

## Commands

### login

Authenticate with SkillSpell. Supports three modes: interactive email/password, direct token storage via `--token`, and browser-based SSO via `--sso`.

```bash
# Email/password (interactive prompts)
skillspell login
skillspell login <email> <password> --yes

# Store a personal access token directly
skillspell login --token <pat>

# Browser-based SSO (SAML/OIDC)
skillspell login --sso
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--token <pat>` | Store a personal access token directly without prompting for email/password. The token must start with `sksp_`. |
| `--sso` | Complete a SAML/OIDC single sign-on flow in your browser and store SSO credentials at `~/.skillspell/sso-credentials`. Requires an interactive terminal (not usable in CI). |

**How it works (email/password):**

In interactive mode (default), the CLI prompts for your email and password. It then:

1. Sends credentials to `POST /api/auth/login` and receives a short-lived JWT.
2. Uses the JWT to create a named PAT via `POST /api/auth/tokens`. The PAT name is `skillspell-cli-<HOSTNAME>` and expires after one year.
3. If a PAT with the same name already exists (from a previous login on this machine), it is revoked before creating a new one, so you never accumulate duplicate tokens.
4. Stores the PAT in `~/.skillspell/credentials` (the JWT is never written to disk).

**How it works (`--sso`):**

The `--sso` flag runs a browser-based single sign-on flow that supports both SAML and OIDC (the active protocol is detected automatically):

1. Starts a local callback server and opens your browser to the SSO login page.
2. After you authenticate with your identity provider, the CLI exchanges the returned one-time code for an access/refresh token pair.
3. Stores the SSO credentials separately at `~/.skillspell/sso-credentials`. The access token is refreshed automatically when it nears expiry, so you stay logged in without re-authenticating.

This mode requires an interactive terminal; use `--token <pat>` for CI environments.

**Non-interactive / CI usage:**

```bash
skillspell login user@example.com mypassword --yes
# or
SKILLSPELL_TOKEN=sksp_... skillspell whoami
```

**Errors:**

| Error | Cause |
|-------|-------|
| `Invalid email or password.` | Credentials were rejected by the server (HTTP 401). |
| `Invalid token format.` | `--token` value does not start with `sksp_`. |
| `Cannot reach <url>.` | Network error or wrong API URL. Run `skillspell config url <url>` to correct it. |

---

### logout

Clear the stored credentials from disk. Idempotent — exits 0 even if no credential files exist.

```bash
skillspell logout
```

This deletes both `~/.skillspell/credentials` (PAT) and `~/.skillspell/sso-credentials` (SSO tokens). The SKILLSPELL_TOKEN environment variable is not affected.

---

### whoami

Print the name and email of the currently authenticated user.

```bash
skillspell whoami
skillspell whoami --token <pat>
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--token <pat>` | Use this token instead of the stored credential for this invocation only. |

Calls `GET /api/auth/me` using the resolved token (environment variable, `--token` flag, or stored credential — in that order).

**Errors:**

| Error | Cause |
|-------|-------|
| `Not logged in.` | No token found. Run `skillspell login`. |
| `Credential is invalid or expired.` | Token was revoked or expired. Run `skillspell login` again. |

---

### config url

Get or set the API base URL. Useful when using a self-hosted SkillSpell instance.

```bash
# Show current URL
skillspell config url

# Set a custom URL
skillspell config url https://your-instance.example.com
```

The setting is saved to `~/.skillspell/config.json`. The default URL is `https://app.skillspell.dev`.

---

### list

Browse skills. Behavior depends on whether the terminal is interactive:

- **TTY (no flags)**: Opens a keyboard-navigable picker. Selecting a skill immediately proceeds to the install flow.
- **With `--search`**: Prints a table to stdout.
- **CI / `--yes`**: Prints a table to stdout.

```bash
# Interactive picker (TTY only)
skillspell list

# Filtered table output
skillspell list --search commit
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-s, --search <query>` | Filter skills by name. Prints a table instead of opening the interactive picker. |
| `--token <pat>` | Use this token for the listing request (overrides the stored credential for this invocation). |

**What gets listed:**

The endpoint used depends on whether a token is resolved:

- **Authenticated**: calls `GET /api/skills/discover`, which returns published skills from all users **plus the caller's own private skills**.
- **Unauthenticated**: falls back to `GET /api/public/skills`, which returns published skills only.

**Table output format:**

```
NAME                SLUG                DESCRIPTION
────────────────────────────────────────────────────
Commit Message      commit-message      Writes conventional commit messages...
Code Reviewer       code-reviewer       Reviews code for quality and style...

2 skills found.
```

The `SLUG` column shows the value to use with `install`, `update`, and `uninstall`.

---

### install

Download a skill from the registry and write it to the correct file path for your AI coding tool.

```bash
# Interactive (prompts for slug, target, and scope)
skillspell install

# Specify slug, prompt for target and scope
skillspell install commit-message

# Fully specified — no prompts
skillspell install commit-message --target claude
skillspell install commit-message --target cursor --workspace
skillspell install commit-message --target copilot --workspace
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-t, --target <tool>` | AI coding tool to install for. One of: `claude`, `cursor`, `windsurf`, `copilot`, `roo`. |
| `-w, --workspace` | Install to the current project directory (workspace-local) instead of the global home directory. Required for `windsurf` and `copilot`. |
| `--token <pat>` | Use this token for the download request. |

**What happens on install:**

1. Resolves the slug to a skill UUID by searching the public skills listing.
2. Downloads skill content from `GET /api/public/skills/:id/download`.
3. Resolves the target file path (see [Install Targets and File Paths](#install-targets-and-file-paths)).
4. Writes the file to disk (creating parent directories as needed).
   - For `claude`, `cursor`, and `roo`: writes a dedicated file.
   - For `windsurf` and `copilot`: inserts the skill as a named section into the shared instruction file, preserving any other content already in that file.
5. Records the install in the [receipt file](#install-receipt-system).

**Confirmation output:**

```
✓ Installed to /Users/you/.claude/skills/commit-message/SKILL.md
```

---

### update

Re-download a skill and overwrite the installed file with the latest version. The target and scope are read from the install receipt — you do not need to re-specify them.

```bash
# Interactive picker from installed skills
skillspell update

# Update a specific skill
skillspell update commit-message

# Skip diff and confirmation (CI mode)
skillspell update commit-message --yes
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--token <pat>` | Use this token for the download request. |

**Diff preview:**

In interactive mode, if the new content differs from what is currently on disk, the CLI shows a colored unified diff before asking for confirmation:

```
+## Commit Message Skill (v2)
-## Commit Message Skill
 Always use Conventional Commits format.
+Include scope in parentheses when the change is scoped to a module.

Overwrite with latest version? [y/N]
```

Pass `--yes` or set `CI=true` to skip the diff and confirmation.

**Multiple installs:**

If the same slug is installed under multiple targets or scopes, the CLI shows a picker to select which installation to update.

---

### uninstall

Remove an installed skill from the filesystem and from the install receipt.

```bash
# Interactive picker from installed skills
skillspell uninstall

# Remove a specific skill
skillspell uninstall commit-message

# Skip confirmation prompt
skillspell uninstall commit-message --yes
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--token <pat>` | Token is not used for removal, but accepted for consistency. |

**Behavior by target type:**

- `claude`, `cursor`, `roo`: The dedicated skill file is deleted.
- `windsurf`, `copilot`: The skill's named section is removed from the shared instruction file. Other content in that file is left intact.

A confirmation prompt is shown in interactive mode before deletion. Pass `--yes` to skip it.

**Multiple installs:**

If the same slug is installed under multiple targets or scopes, the CLI shows a picker to select which installation to remove.

---

### outdated

Show all installed skills and their update status. Reads both global and workspace receipts and compares the installed version timestamp against the latest published version.

```bash
skillspell outdated
skillspell outdated --token <pat>
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--token <pat>` | Use this token for API requests. |

**Output format:**

```
SLUG              TARGET  SCOPE      INSTALLED   LATEST      STATUS
──────────────────────────────────────────────────────────────────────
commit-message    claude  global     2024-11-01  2024-12-15  update available
code-reviewer     cursor  workspace  2024-12-10  2024-12-10  up-to-date
old-skill         roo     global     2024-09-01  n/a         removed from registry

3 skills installed.
```

**Status values:**

| Status | Meaning |
|--------|---------|
| `up-to-date` | Installed version timestamp matches the latest published version. |
| `update available` | A newer version has been published since this was installed. Run `skillspell update <slug>`. |
| `removed from registry` | The skill no longer appears in the public listing. The local file is not deleted. |

---

## Install Targets and File Paths

Each target tool writes skills to a different location. The `--workspace` flag controls whether the path is under the home directory (global) or the current working directory (workspace-local).

| Target | Scope | Path |
|--------|-------|------|
| `claude` | global | `~/.claude/skills/<name>/SKILL.md` |
| `claude` | workspace | `.claude/skills/<name>/SKILL.md` |
| `cursor` | global | `~/.cursor/rules/<name>.md` |
| `cursor` | workspace | `.cursor/rules/<name>.md` |
| `windsurf` | workspace only | `.windsurfrules` |
| `copilot` | workspace only | `.github/copilot-instructions.md` |
| `roo` | global | `~/.roo/skills/<name>/SKILL.md` |
| `roo` | workspace | `.roo/skills/<name>/SKILL.md` |

`<name>` is the skill's display name sanitized for safe filesystem use: any character outside `[a-zA-Z0-9._-]` is replaced with an underscore (`_`). If nothing alphanumeric remains after sanitization, the literal `unnamed` is used.

**Windsurf and Copilot require `--workspace`.** These targets use shared project-level instruction files — global installation is not supported. If you attempt a global install for these targets, the CLI exits with an error naming the target:

```
Windsurf uses project-local files only.
Run with --workspace to install into the current project.
```

```
Copilot uses project-local files only.
Run with --workspace to install into the current project.
```

**Section management for shared files:**

When installing into `.windsurfrules` or `.github/copilot-instructions.md`, the CLI wraps the skill content in HTML comment markers so multiple skills can coexist in the same file:

```
<!-- skillspell-begin: commit-message -->
...skill content...
<!-- skillspell-end: commit-message -->
```

`update` replaces only this section; `uninstall` removes only this section. Existing content outside the markers is never modified.

---

## Config File

**Location:** `~/.skillspell/config.json`

```json
{
  "baseUrl": "https://app.skillspell.dev"
}
```

The file is created automatically on first use and is written with `JSON.stringify(..., null, 2)` formatting. You can edit it manually or use `skillspell config url <url>` to update the `baseUrl` field.

**Available keys:**

| Key | Default | Description |
|-----|---------|-------------|
| `baseUrl` | `https://app.skillspell.dev` | Base URL of the SkillSpell API. Override for self-hosted instances. |

---

## Credential Storage

**Location:** `~/.skillspell/credentials`

A plain-text file containing a single personal access token (PAT) beginning with `sksp_`. The CLI restricts this file's permissions to owner-read-only (`chmod 600`) on Unix systems. On Windows, `icacls` is used to set equivalent ACL restrictions.

**Token resolution order:**

The CLI resolves which token to use in this priority order:

1. `SKILLSPELL_TOKEN` environment variable (highest priority)
2. `--token <pat>` flag on the command
3. PAT stored in `~/.skillspell/credentials`
4. SSO credentials in `~/.skillspell/sso-credentials` (the access token, refreshed automatically when it nears expiry)

If no token is found in any of these sources, the command either exits with an error (for commands that require authentication) or emits a soft warning and proceeds with unauthenticated API requests (for commands that work with public endpoints).

---

## Install Receipt System

The CLI maintains a JSON receipt file that tracks what skills are installed, where, and when. This receipt is what allows `update`, `uninstall`, and `outdated` to work without re-specifying the target and scope.

**Receipt file locations:**

| Scope | Path |
|-------|------|
| Global installs | `~/.skillspell/installed.json` |
| Workspace installs | `.skillspell/installed.json` (relative to CWD) |

**Receipt entry schema:**

```json
{
  "commit-message": [
    {
      "slug": "commit-message",
      "target": "claude",
      "workspace": false,
      "installedPath": "/Users/you/.claude/skills/commit-message/SKILL.md",
      "installedAt": "2024-12-01T10:00:00.000Z",
      "skillUpdatedAt": "2024-11-28T09:30:00.000Z"
    }
  ]
}
```

The same slug can have multiple entries (for example, installed for both Claude globally and Cursor workspace-locally). Each `{slug, target, workspace}` combination is a distinct entry.

`skillUpdatedAt` records the server-side `updatedAt` timestamp of the skill at install time. The `outdated` command compares this against the current registry value to detect whether an update is available.

**Advisory write lock:**

Concurrent `skillspell install` invocations are protected by an advisory lock file (`installed.lock`) created with exclusive open (`O_EXCL`). If the lock cannot be acquired within ~6 seconds (10 attempts with exponential back-off from 100 ms to 2 s), the command exits with an error instructing you to remove the lock file manually.

---

## Non-Interactive / CI Mode

The CLI detects non-interactive mode automatically when:

- `process.stdin.isTTY` is false (output is piped), or
- The `CI` environment variable is set, or
- The `--yes` flag is passed.

In non-interactive mode:

- Interactive pickers (skill selection, target selection, scope selection) are replaced with errors unless all required arguments are provided on the command line.
- Diff previews and confirmation prompts are skipped automatically.
- `login` requires email and password as positional arguments.
- `install` requires `--target` (and `--workspace` if applicable).
- `update` and `uninstall` require a slug argument.

**Example CI workflow:**

```bash
# Set token via environment variable — no login command needed
export SKILLSPELL_TOKEN=sksp_...

# Install skill non-interactively
skillspell install commit-message --target claude --yes

# Update all installed skills from a script
skillspell update commit-message --yes
```

---

## Troubleshooting

### "Cannot reach `<url>`. Check your network..."

The CLI cannot connect to the API. Check:

1. Your internet connection.
2. Whether the URL is correct: `skillspell config url` to see the current setting.
3. For self-hosted instances, run `skillspell config url https://your-instance.example.com` to set the correct base URL.

### "Skill not found: `<slug>`"

The slug you specified does not match any published skill. Run `skillspell list --search <name>` to see available skills and their exact slugs.

### "Not logged in."

No token was found. Either run `skillspell login`, or set the `SKILLSPELL_TOKEN` environment variable if you have a PAT.

### "Credential is invalid or expired."

The stored token has been revoked or expired. Run `skillspell login` again to generate a new PAT.

### "Windsurf uses project-local files only."

Windsurf and GitHub Copilot targets do not support global installation. Add `--workspace` to install into the current project directory.

### "Multiple installs found for `<slug>`"

The skill is installed for more than one target or scope. In interactive mode, a picker appears to select which installation to update or remove. In CI mode, this is an error — you need to run the command interactively.

### Stale lock file after a crash

If the CLI crashed mid-install, a stale lock file may block subsequent runs:

```bash
# Global lock
rm ~/.skillspell/installed.lock

# Workspace lock
rm .skillspell/installed.lock
```

### Receipt out of sync (file deleted manually)

If you deleted a skill file manually without running `skillspell uninstall`, the receipt still lists the skill. This causes `outdated` to show entries that no longer exist on disk. Fix it by running `skillspell uninstall <slug> --yes` — the uninstall command handles the case where the file has already been deleted and only cleans up the receipt entry.
