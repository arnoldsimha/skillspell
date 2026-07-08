---
description: Diff the current branch against the base branch and open a GitHub PR via the gh CLI
---

Create a GitHub pull request for the current branch using the `gh` CLI.

Base branch: `$ARGUMENTS` (optional; default to the repo's default branch — usually `main`).

Follow these steps precisely. Do not skip verification — report what you find rather than assuming.

## 1. Preflight

- Confirm `gh` is installed and authenticated: `gh auth status`. If not authenticated, stop and tell the user to run `gh auth login` (this is non-interactive; you cannot do it for them).
- Determine the base branch: if `$ARGUMENTS` is provided use it; otherwise read the default with `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- Determine the current branch: `git branch --show-current`.
- If the current branch **is** the base branch, stop: a PR needs a separate feature branch. Offer to create one (`git checkout -b <name>`) but do not do so without confirmation.

## 2. Inspect the diff against base

- Fetch latest base: `git fetch origin <base>`.
- Get the changed files and stats: `git diff --stat origin/<base>...HEAD`.
- Get the commit list: `git log --oneline origin/<base>..HEAD`.
- Read the actual diff to understand the changes: `git diff origin/<base>...HEAD` (summarize; don't paste the whole thing back to the user).
- If there is **no diff** vs base, stop and report — there is nothing to open a PR for.
- If there are **uncommitted changes** (`git status --short` non-empty), stop and ask the user whether to commit them first (do not auto-commit).

## 3. Push the branch

- Push and set upstream if needed: `git push -u origin HEAD`.
- If the remote rejects (diverged), report the error and stop — do not force-push without explicit confirmation.

## 4. Compose the PR

Write the title and body from the actual diff and commits — not a generic template:

- **Title:** a single semantic-commit-style line (`fix:`, `feat:`, `chore:`, `docs:`, `test:`, `refactor:`) focused on the WHY, matching this repo's convention. Keep it concise.
- **Body:** structured markdown:
  - `## Summary` — 2-4 bullets on what changed and why.
  - `## Changes` — notable changes grouped by area (backend / frontend / cli / shared) when the diff spans several.
  - `## Testing` — what was run to verify (build, tests, lint). State what actually ran; if nothing was run, say so.
  - Keep one concern per PR (repo guideline). If the diff mixes unrelated concerns, note it and suggest splitting.
- End the PR body with:

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 5. Create the PR

- Write the body to a temp file (avoids shell-quoting issues), then:

  ```bash
  gh pr create --base <base> --head <current-branch> --title "<title>" --body-file <tmpfile>
  ```

- If a PR already exists for this branch, `gh` will say so — surface the existing URL instead of erroring.
- On success, print the PR URL returned by `gh`.

## Notes

- Never force-push, never auto-commit, and never change the base branch without explicit user confirmation.
- If any step fails, stop and report the exact error — do not paper over it.
