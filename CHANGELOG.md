# Changelog

All notable changes to SkillSpell are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.0.0] - 2026-05-01

### Added

- **Regression guard** — optimizer automatically reverts to the best-scoring draft if a later iteration scores worse; shows a "Regression detected" notice in the review step
- **Targeted improvement prompts** — optimizer now focuses on one failure theme at a time (format, tone, completeness, accuracy, or length) instead of attempting to fix all failures simultaneously; low-confidence grader passes surfaced as fragile behaviors the optimizer should preserve
- **Coverage gap detection** — post-optimization review step shows a panel with a 0–100 coverage score and blind spots in the eval suite (missing negative cases, homogeneous assertion types, similar prompt lengths, etc.)
- **Fix all gaps & re-run** — one-click button in the coverage gap panel: AI decides how many cases to generate per dimension (3–10), shows a confirmation dialog, generates and saves all cases, then re-runs optimization with the previous config; generation runs in a non-dismissible modal with per-gap progress bars
- **Live eval progress bar** — training and test eval runs now show a counter and progress bar (e.g. `8 / 12`) during the optimizer running step, updating every batch

### Security

- **Login password max-length:** Removed `@MaxLength(12)` from `LoginDto.password` — was permanently locking out users with passwords longer than 12 characters (increased to 1000)
- **HTTPS redirect open redirect:** Fixed `HttpsRedirectMiddleware` building an open redirect URL (`//evil.com/path`) when `APP_PUBLIC_URL` was unset; added safe-path sanitization and URL guard
- **SAML CLI code store fire-and-forget:** Added `await` to `storeCliCode()` in SAML callback — tokens were issued but unexchangeable if the Redis write failed silently
- **PAT expiry validation:** `CreatePatDto.expiresAt` now rejects past dates and enforces a 1-year upper bound — previously accepted immediately-expired or century-long tokens
- **`SkillOwnerGuard` missing param bypass:** Guard now throws `ForbiddenException` when the `@CheckOwnership` route param is absent; previously returned `true` (allow), silently skipping ownership enforcement
- **ReDoS in eval grading:** Added nested-quantifier heuristic check before compiling user-supplied assertion regex against 50 k-char output — prevents catastrophic backtracking that could freeze the event loop
- **Lockout reset timing:** Removed pre-verify `failedAttempts` reset on lock expiry — previously reset the counter to 0 before checking the password, letting attackers recycle their attempt budget on every lock-expiry cycle; wrong password after an expired lock now re-locks immediately

### Fixed

- **SetupGuard 5s block after setup:** Added `signalSetupComplete()` to `SetupGuard`; `AuthController` calls it after a successful setup so the guard's stale negative-cache TTL window is closed immediately
- **Invite token persists on SMTP failure:** `sendInvites` now sends the email before calling `inviteRepo.create` — a failed email delivery no longer leaves a live-but-undelivered token in the database
- **`resendInvite` stale description:** Updated JSDoc to accurately describe that a fresh token is always generated (original raw token is never stored, only its hash)
- **Eval baseline grading duplicate log lines:** `doExecuteAndGrade` now passes `id: \`${runId}/baseline\`` to the baseline `gradeRun` call — disambiguates contradictory-looking pass/fail log lines for the same run ID when `compareBaseline: true`
- **SSE abort observability:** Added log line when eval batch aborted between iterations (client disconnect) so cancellation is visible in server logs
- **Eval generation progress counter:** SSE `generate-progress` events now increment `current` one-by-one after each batch completes instead of always reporting 0

### Changed

- **`sdk-client.service.ts`:** Removed `|| 120_000` and `|| 30_000` timeout fallbacks that shadowed Zod schema defaults
- **`skill-optimization.service.ts`:** Plateau detection now requires 3 iterations (was 2) to prevent premature termination on two consecutive score ties
- **`organization.service.ts`:** Added JSDoc warning on `getOidcConfig` — decrypted secret returned in `encryptedClientSecret` field risks double-decryption if passed back to the encryption layer
- **`invite.controller.ts`:** Added `ParseUUIDPipe` to `revokeInvite` and `resendInvite` route params
- **`auth.ts` (CLI):** `getJwtExpiry` now validates segment count and `exp` field type before use instead of accessing blindly

### Tests

- `auth.service.spec.ts` — 2 new tests: expired-lock + correct/wrong password (verifies single `updateCredential` call, no pre-verify counter reset)
- `setup.guard.spec.ts` — 7 new tests covering full guard lifecycle including `signalSetupComplete()` TTL-window fix
- `invite.service.spec.ts` — 10 new tests covering email-first ordering, SMTP failure without token leak, resend flow
- `skill-optimization.service.spec.ts` — 11 new tests for `isPlateaued()` covering all boundary conditions

## [0.0.10] - 2026-04-28

### Redis State Migration (v1.3)

#### Phase 11 — Redis Infrastructure (CACHE-01–05, GRADE-01)

- Installed Redis client packages: `@keyv/redis`, `@nest-lab/throttler-storage-redis`, `@nestjs/terminus`
- Added `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` env vars to `configuration.ts` and `.env.example`
- Registered `CacheModule` globally in `AppModule` using `@keyv/redis` (replaced deprecated `cache-manager-ioredis-yet`)
- Removed local `CacheModule` from `EvalModule` (now inherits global)
- Added `redis` and `redis-commander` services to `docker/docker-compose.yml`
- Added `GET /api/health` endpoint via `@nestjs/terminus` reporting Redis + PostgreSQL status
- Removed legacy `AppController` / `AppService` shell classes
- Removed global cache TTL — all `cacheManager.set()` calls now pass explicit per-use-case TTLs

#### Phase 12 — Application State Migration (DRAFT-01–02, AUTH-01–03, THROTTLE-01)

- DRAFT-01/02: Replaced in-memory `OptimizationDraftStore` Map with `RedisDraftStore` — draft iterations survive pod restarts
- AUTH-01: Migrated `CliAuthService` one-time code store to Redis (auto-expiry, replay-proof)
- AUTH-02/03: Migrated `OidcAuthService` pending-state and provider-config maps to Redis
- THROTTLE-01: Wired `ThrottlerStorageRedisService` for rate limiting — throttle counters now shared across all replicas

#### Phase 13 — k8s Redis Deployment + Scale-up (K8S-01–03)

- Added `k8s/redis.yaml` — Redis Deployment (`redis:7-alpine`, 100m/128Mi) + ClusterIP Service named `redis`
- Updated `k8s/app.yaml` — added `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` env vars; scaled replicas from 1 → 2
- Updated `k8s/DEPLOYMENT.md` — added `redis-secret` creation command and 5-step staged rollout runbook

### Added

- AI-powered suggest count for Generate Test Cases modal
- Pass AI suggestion coverage hint into test case count generation
- Skill file links in markdown viewer are now clickable — relative paths and inline `code` paths in SKILL.md navigate to the referenced file in the skill tree (SkillDetail and SkillPreview)
- Skill import now supports `.config`, `.cs`, and `.csproj` file types

### Fixed

- **Zip import directory depth:** Increased max directory depth from 2 to 5 levels — supports deep project structures (e.g. C# `scripts/eval/Project/src/Controllers/File.cs`)
- **Zip import file size:** Increased max import size to 500 KB (compressed and extracted)
- **Skill refine truncation on large skills:** `calculateRefineMaxTokens` now uses `2×` existing skill token estimate instead of a flat `+3000` buffer — prevents `max_tokens` truncation when expanding or rewriting large skills
- **Silent truncation in tool calls:** `sendMessage()` now throws a clear error when `stop_reason=max_tokens` occurs during a tool call — partial tool inputs no longer silently propagate to parsers, causing cryptic `skillContent missing` errors
- **`AI_MAX_RETRIES` NaN bug:** `Number(process.env.AI_MAX_RETRIES)` returned `NaN` when the env var was absent; `NaN ?? 2` stays `NaN` (nullish coalescing ignores `NaN`), so the Anthropic SDK received `maxRetries: NaN` and skipped retries on 429/500/503. Added explicit fallback to `2`; added `AI_MAX_RETRIES: "2"` to `k8s/app.yaml`
- **Health endpoint crash loop:** `@SkipThrottle()` without arguments did not skip the `medium` throttler (60 req/min). k8s liveness + readiness probes from 2 replicas hit the limit after ~10 minutes, causing 429s → liveness failures → crash loop. Changed to `@SkipThrottle({ short: true, medium: true, long: true })`
- **Health probe timeout:** Increased `timeoutSeconds` from 1s to 5s on readiness and liveness probes — Redis lazy-connect on first health check exceeded the 1s default
- **`NODE_TLS_REJECT_UNAUTHORIZED` in prod:** Removed from `AGENT_ENV_ALLOWLIST` default — dev-only var was appearing in agent subprocess env and startup logs in production
- **OIDC login:** `lastLoginAt` now updated on OIDC login (was only updated on password login)

### Changed

- Scaled app deployment to 1 replica before Redis migration (in-memory state not safe for multi-pod); scaled back to 2 replicas after migration completed
- Optimizer page description: replaced 'Claude' with 'SkillSpell'; added onboarding description text

## [0.0.9] - 2026-04-17

### Phase 1 — AI Performance (PERF-01, PERF-02, PERF-03)

- PERF-01: Added `intentOverride` parameter to `optimizeDraft()` and `refineSkill()` — optimization loop now passes `'modify'` directly, bypassing LLM intent classification (~300 ms saved per iteration)
- PERF-02: Raised `OPT_EVAL_CONCURRENCY` from 3 to 5 in `SkillOptimizationService` — optimization eval batches run with higher concurrency since no per-eval SSE events are emitted
- PERF-03: Parallelized with-skill and baseline `runPrompt` calls via `Promise.all()` in `EvalRunnerService.executeEval()` — baseline-enabled eval wall-clock time reduced by ~40–50% per case

### Phase 2 — AI Quality (QUAL-01, QUAL-02, QUAL-03)

- QUAL-01: Added explicit pass/partial/fail scoring thresholds and two domain-neutral few-shot examples to `grader.md` — aligns LLM `overallAssessment` with `computeOverallGrading()` logic
- QUAL-02: Inserted `{{passingAssertions}}` section into `optimize-improvement.md` before `{{failureSummaries}}` — optimization prompt now shows the Claude model which assertions must not regress
- QUAL-03: Added Improvement Principle 6 (change budget) to `optimize-improvement.md` — instructs the model to make only minimum necessary changes and prefer targeted edits over wholesale rewrites
