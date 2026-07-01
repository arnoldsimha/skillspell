# Maintaining a Private Downstream Fork

This project follows an **open-first** model: this public repository is the
single source of truth for all application code, and private deployments live in
a **downstream fork** that adds infrastructure on top without ever pushing it
back upstream.

If you run SkillSpell inside your own organization with private deployment
config (Kubernetes manifests, CI pipelines, private registries, secrets), use
the workflow below. It keeps your fork continuously up to date with the public
project while guaranteeing your private files never leak into the open.

## Why this model

- **No leaks by construction.** Private files exist *only* in the fork. Nothing
  ever flows fork → public, so there is no scrubbing step to get wrong.
- **Cheap upstream syncs.** Private files live in their own directories that do
  not exist upstream, so `git merge upstream/main` almost never conflicts.
- **One codebase.** You are not maintaining a divergent copy of the app — just a
  thin overlay of infra on top of the public code.

```
  public repo (upstream)  ──►  your fork (origin)
  app code, docs, tests         app code (merged from upstream)
                                + k8s/            ── overlay, fork-only
                                + azure-pipelines.yml
                                + deploy/ scripts
                                + secrets (git-ignored)
```

## Overlay layout

Keep every private file in a path that **does not exist in the public repo**, so
merges stay conflict-free. Recommended overlay locations:

| Private content            | Where it lives in the fork        |
| -------------------------- | --------------------------------- |
| Kubernetes manifests       | `k8s/`                            |
| CI/CD pipelines            | `azure-pipelines.yml`, `.gitlab/` |
| Deploy scripts             | `scripts/deploy.sh`               |
| Private registry config    | `packages/cli/.npmrc`             |
| Populated secret manifests | `k8s/**/*secret*.yaml` (git-ignored) |

Two files are shared with upstream and therefore *can* conflict — handle them
this way:

- **`Makefile`** — do not edit upstream targets in place. Put private targets in
  a separate `Makefile.deploy` and `include Makefile.deploy` from your fork's
  Makefile, or keep them in `scripts/`.
- **`packages/cli/.npmrc`** — this file does not exist upstream, so adding it in
  the fork is a clean, conflict-free addition. Never let it reach upstream (the
  safety gate below enforces this).

## One-time fork setup

```bash
# 1. Create your private fork from the public repo (mirror or fork), then clone it.
git clone <your-fork-url> skillspell-fork
cd skillspell-fork

# 2. Track the public project as "upstream".
git remote add upstream <public-repo-url>
git remote -v   # origin = your fork, upstream = public

# 3. Add your private overlay (k8s/, pipelines, deploy scripts, .npmrc, …)
#    and commit it to your fork only.
git add k8s/ azure-pipelines.yml scripts/deploy.sh packages/cli/.npmrc
git commit -m "chore: add private deployment overlay"
git push origin main
```

## Ongoing: pull updates from the public project

```bash
git fetch upstream
git merge upstream/main        # or: git rebase upstream/main
# Overlay files don't exist upstream → no conflicts. Resolve the rare shared-file
# conflict (usually Makefile) if it appears, then:
git push origin main
```

## Safety gate (keep this in your fork, not upstream)

Maintain a pre-push check **in your fork** that fails if any of your internal
identifiers — private registry hostnames, cluster names, IPs, subscription IDs,
resource groups — appear in files headed upstream. A `git grep` over your
identifier list, wired into a `pre-push` hook or a fork-only CI step, is enough.

Keep the identifier list in the fork only. Never commit it (or the check that
contains it) to the public repo — that would publish the very details you are
trying to keep private.

## Contributing fork changes back upstream

Only *application* changes (features, fixes, docs) should go upstream — never
overlay files. To contribute a change developed in the fork:

```bash
# Branch off upstream, cherry-pick only the app commits, open a PR against public.
git fetch upstream
git checkout -b my-feature upstream/main
git cherry-pick <app-commit-sha>
npm run build                # plus your fork-side safety check (see above)
git push origin my-feature   # then open a PR to the public repo
```
