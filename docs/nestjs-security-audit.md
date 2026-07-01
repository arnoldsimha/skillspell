# NestJS Security, Performance & Architecture Audit Report

> **Audit date:** April 2026 | **Status:** Open findings — review before production deployment.

---

## Finding 1 — [MEDIUM] Unvalidated body on `checkName` endpoint

**Location:** `SkillsController.checkName()` — `packages/backend/src/skills/skills.controller.ts:59`

**Problem:** The `@Body()` parameter uses an inline type `{ name: string; excludeId?: string }` instead of a validated DTO class. The global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` only works with class-validator-decorated classes — a plain interface/type bypasses all validation.

**Impact:** An attacker can send arbitrary extra properties, excessively long `name` strings, or non-string values that flow unchecked into `skillRepo.findByName()`. While TypeORM parameterises queries (no SQL injection), this violates defence-in-depth and could cause unexpected DB errors.

**Fix:**

```typescript
// packages/backend/src/skills/dto/check-name.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CheckNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
```

```typescript
// In skills.controller.ts
import { CheckNameDto } from './dto/check-name.dto.js';

@Post('check-name')
@HttpCode(200)
async checkName(@Body() dto: CheckNameDto): Promise<{ exists: boolean }> {
  const exists = await this.skillsService.nameExists(dto.name, dto.excludeId);
  return { exists };
}
```

---

## Finding 2 — [MEDIUM] Missing `MaxLength` constraints on `DraftContextDto` nested fields

**Location:** `DraftContextDto` — `packages/backend/src/generation/dto/optimize-draft.dto.ts:12`

**Problem:** The nested `DraftContextDto` inside `OptimizeDraftDto` has `@IsString()` decorators but no `@MaxLength()` on `description` and `skillContent`. An attacker can submit multi-megabyte payloads that pass validation but consume memory when passed to the LLM prompt builder.

**Impact:** Potential memory exhaustion or excessive LLM token costs from oversized content. The Express `json({ limit: '2mb' })` in `main.ts:57` provides a coarse cap, but per-field validation is a better defence.

**Fix:**

```typescript
// packages/backend/src/generation/dto/optimize-draft.dto.ts
class DraftContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsString()
  @MaxLength(2048)
  description!: string;

  @IsString()
  @MaxLength(500_000)
  skillContent!: string;

  // ... arrays remain the same (SkillFileItemDto already has MaxLength)
}
```

---

## Finding 3 — [MEDIUM] `conversation` field exposed in full `Skill` response objects

**Location:** `SkillsController.findById()` — `packages/backend/src/skills/skills.controller.ts:166`, plus `create()` at `:157`, `update()` at `:175`, `approveOptimization()` at `:142`

**Problem:** These endpoints return the raw `Skill` interface which includes the deprecated `conversation` array and `sessionId` field. The `conversation` array can contain the full LLM chat history including user prompts, which may contain sensitive context. There is no response DTO with `@Exclude()` applied — the `SkillSummaryDto` is only used for listing endpoints.

**Impact:** Deprecated internal data (`conversation`, `sessionId`) leaks to the client. The `conversation` array grows unbounded and wastes bandwidth on every GET. If prompt content contains sensitive business logic or PII, it is exposed.

**Fix:**

```typescript
// packages/backend/src/skills/dto/skill-response.dto.ts
import { Expose, Exclude } from 'class-transformer';

@Exclude()
export class SkillDetailDto {
  @Expose() id!: string;
  @Expose() ownerId!: string;
  @Expose() name!: string;
  @Expose() description!: string;
  @Expose() status!: string;
  @Expose() skillContent!: string;
  @Expose() scripts!: any[];
  @Expose() references!: any[];
  @Expose() assets!: any[];
  @Expose() version!: number;
  @Expose() createdAt!: string;
  @Expose() updatedAt!: string;
  // conversation and sessionId are NOT @Expose()'d → excluded
}
```

```typescript
// In skills.controller.ts — wrap returns:
@Get(':id')
@CheckOwnership('id')
async findById(@Param('id', ParseUUIDPipe) id: string): Promise<SkillDetailDto> {
  const skill = await this.skillsService.findById(id);
  return plainToInstance(SkillDetailDto, skill, { excludeExtraneousValues: true });
}
```

---

## Finding 4 — [LOW] No caching on `suggestPrompts` — every call hits the LLM

**Location:** `GenerationService.suggestPrompts()` — `packages/backend/src/generation/generation.service.ts:352`

**Problem:** The comment explicitly states _"Always fetches fresh suggestions from the AI — no caching."_ Every time the user opens the suggestion panel, a full LLM round-trip is made.

**Impact:** Unnecessary LLM API cost and 1–3s latency on every suggestion request. Under load, this can exhaust Claude API rate limits.

**Why naive caching doesn't work:** `partialInput` is free-form text from user typing — caching on the exact string would produce a near-infinite number of unique cache keys with almost zero hit rate, wasting memory.

**Fix — debounce on the frontend + limited server-side cache for empty-input calls:**

The most effective mitigation is a combination of:
1. **Frontend debounce** — throttle the API call to fire only after 500ms of typing inactivity (not a backend concern, but the primary lever)
2. **Server-side cache only for the "no input" case** — when `partialInput` is empty/undefined, the result is effectively static per mode+skillId and safe to cache

```typescript
// In generation.service.ts — cache only the zero-input "initial suggestions" case
async suggestPrompts(
  mode: 'create' | 'optimize',
  partialInput?: string,
  skillId?: string,
): Promise<SuggestionItem[]> {
  // Only cache when there's no partial input — these are the "starter" suggestions
  // that are identical across users for the same skill context.
  const isInitialSuggestions = !partialInput || partialInput.trim() === '';

  if (isInitialSuggestions) {
    const cacheKey = `suggest:${mode}:${skillId ?? 'none'}`;
    const cached = await this.cacheManager.get<SuggestionItem[]>(cacheKey);
    if (cached) return cached;

    const suggestions = await this.doSuggestPrompts(mode, partialInput, skillId);
    await this.cacheManager.set(cacheKey, suggestions, 300_000); // 5 min TTL
    return suggestions;
  }

  // For typed input: no cache — every request generates fresh suggestions
  return this.doSuggestPrompts(mode, partialInput, skillId);
}
```

---

## Finding 5 — [LOW] `CreateSkillDto` name validation inconsistent with `UpdateSkillDto`

**Location:** `CreateSkillDto.name` — `packages/backend/src/skills/dto/create-skill.dto.ts:25` vs `UpdateSkillDto.name` — `packages/backend/src/skills/dto/update-skill.dto.ts:21`

**Problem:** `UpdateSkillDto` enforces a strict `@Matches(/^[a-z][a-z0-9-]*$/)` pattern for `name`, but `CreateSkillDto` has no such pattern — it allows uppercase, spaces, and special characters. This means a skill can be _created_ with a name that can never be _updated_ (the update would reject the existing name format).

**Impact:** Inconsistent validation rules lead to confusing UX errors when editing skills created with non-conforming names.

**Fix:**

```typescript
// packages/backend/src/skills/dto/create-skill.dto.ts
export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message:
      'name must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens',
  })
  name!: string;

  // ... rest unchanged
}
```

---

## Finding 6 — [LOW] Sequential delete cleanups in `SkillsService.delete()`

**Location:** `SkillsService.delete()` — `packages/backend/src/skills/skills.service.ts:168`

**Problem:** The cleanup operations (eval runs, eval feedback, eval cases, benchmarks, session messages) are executed sequentially in a `for...of` loop. These are independent operations that could run in parallel.

**Impact:** Delete latency is the sum of all five cleanup calls (~5 × round-trip). For PostgreSQL with CASCADE constraints these are no-ops anyway, so the sequential cleanup calls add avoidable latency.

**Fix:**

```typescript
// packages/backend/src/skills/skills.service.ts
async delete(id: string): Promise<void> {
  // Run independent cleanups in parallel (no-ops for Postgres CASCADE)
  const results = await Promise.allSettled([
    this.evalRepo.deleteEvalRunsBySkill(id),
    this.evalRepo.deleteFeedbackBySkill(id),
    this.evalRepo.deleteEvalCasesBySkill(id),
    this.evalRepo.deleteBenchmarkSnapshots(id),
    this.sessionRepo.deleteSession(id),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      this.logger.warn(`Cleanup failed for skill ${id}: ${result.reason}`);
    }
  }

  await this.skillRepo.delete(id);
}
```

---

## Finding 7 — [LOW] In-memory dedup maps on `GenerationService` are not multi-instance safe

**Location:** `GenerationService.generateInflight` — `packages/backend/src/generation/generation.service.ts:29` and `GenerationService.diagramInflight` — `packages/backend/src/generation/generation.service.ts:26`

**Problem:** The `Map<string, Promise>` used for deduplication lives in Node.js process memory. In a horizontally-scaled deployment (multiple pods/containers), duplicate requests hitting different instances will not be deduplicated.

**Impact:** The dedup only helps with double-clicks hitting the same instance. Under load balancing, concurrent requests from different clients for the same skill could still trigger duplicate LLM calls. This is a minor concern since the primary use case (double-click protection) is well-served.

**Fix (documentation improvement):**

```typescript
/**
 * In-flight diagram generation promises, keyed by `skillId:version`.
 *
 * NOTE: This is a single-instance dedup map. In multi-instance deployments,
 * concurrent requests for the same skill may still trigger duplicate LLM calls.
 * For true distributed dedup, consider Redis-based locking (e.g., Redlock).
 */
private readonly diagramInflight = new Map<string, Promise<SkillDiagram>>();
```

---

## Finding 8 — [LOW] `SkillOwnerGuard` returns `true` when param is missing — intentional but could use stronger logging

**Location:** `SkillOwnerGuard.canActivate()` — `packages/backend/src/ownership/guards/skill-owner.guard.ts:52`

**Behavior:** When `@CheckOwnership('id')` is applied but the route param is missing from the request, the guard logs a warning but returns `true` — allowing the request through without ownership verification.

**Design rationale (validated):** This is an **intentional design choice**, confirmed by the unit test at `skill-owner.guard.spec.ts:117` which explicitly asserts this pass-through behavior. The reasoning is sound: since `SkillOwnerGuard` is registered globally via `APP_GUARD`, it runs on **every** route — including routes that don't have `:id` or `:skillId` params (e.g., `POST /api/skills` for creation, `GET /api/skills` for listing). If the guard threw on a missing param, non-ownership routes would break.

Additionally, all routes that use `@CheckOwnership('id')` also have `@Param('id', ParseUUIDPipe)` — NestJS routing guarantees the `:id` param is present and UUID-valid before the guard runs. The "missing param" scenario only triggers on developer misconfiguration (param name typo), which is caught by the logger warning and by downstream 404s from services.

**Impact:** Minimal — the current design is correct for a globally-registered guard.

**Optional hardening:** Promote the log level from `warn` to `error` to increase visibility in monitoring dashboards:

```typescript
if (!skillId) {
  this.logger.error(
    `@CheckOwnership('${paramName}') used but param is missing from request.params — ` +
    `ownership check SKIPPED. Verify decorator param name matches route definition.`,
  );
  return true;
}
```

---

## Finding 9 — [LOW] `contentSecurityPolicy: false` in Helmet configuration

**Location:** `main.ts:48` — `packages/backend/src/main.ts:48`

**Problem:** Content-Security-Policy is disabled globally with `contentSecurityPolicy: false`. The comment says "SPA manages its own CSP via meta tags" — but if the SPA doesn't actually set a CSP meta tag, there is no XSS mitigation from CSP at all.

**Impact:** Without CSP, any XSS vulnerability (e.g., from user-generated content in skill names/descriptions rendered in the SPA) has no browser-level mitigation.

**Fix:**

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
```

---

## Summary — What Was NOT Found (Positive Observations)

| Area | Status |
|------|--------|
| **SQL Injection** | ✅ No raw SQL in repositories — all queries use TypeORM query builder with parameterised bindings. Migrations use DDL-only raw queries (safe). |
| **Authentication** | ✅ `JwtAuthGuard` registered globally via `APP_GUARD`. `@Public()` decorator properly exempted. |
| **Rate Limiting** | ✅ `ThrottlerGuard` registered globally with three tiers (short/medium/long). |
| **Global ValidationPipe** | ✅ Properly configured with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. |
| **Ownership enforcement** | ✅ All mutating `:id` routes use `@CheckOwnership('id')`. |
| **Role-based access** | ✅ Hierarchical `RolesGuard` with `isAtLeast()` check. |
| **Refresh token security** | ✅ Tokens are SHA-256 hashed before storage, with rotation and family-based revocation on reuse. |
| **Business logic in services** | ✅ Controllers are thin dispatchers — all logic lives in services. |
| **Circular dependencies** | ✅ `SkillsModule` imports `GenerationModule` (one-way). No circular imports detected. |
| **N+1 queries** | ✅ No eager-loading pitfalls — repositories use targeted `findOneBy`/`find` with explicit `select` projections. |

---

## Overall Assessment

This is a **well-architected NestJS codebase** with strong security fundamentals: global JWT auth, rate limiting, ownership guards, role-based access, parameterised queries, and proper DTO validation across most endpoints. The main gaps are a single unvalidated inline body type on the `checkName` endpoint, missing `MaxLength` bounds on one nested DTO, and the `Skill` response type leaking deprecated internal fields (`conversation`, `sessionId`). None of the findings are critical or immediately exploitable — the code demonstrates an awareness of security best practices and a disciplined service/controller separation.
