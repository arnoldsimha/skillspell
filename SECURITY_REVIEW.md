# SkillSpell Security Review

**Branch:** `security-review-20260702`
**Date:** 2026-07-02
**Scope:** Full review of `packages/cli`, `packages/backend` (+ `shared`/`storage`), `packages/frontend`
**Method:** Per-area vulnerability discovery → independent adversarial verification of every candidate → false-positive filtering (confidence-scored, skeptical re-read of the actual code).

---

## Executive Summary

Two genuine vulnerabilities were confirmed, one candidate was rejected as a false positive after verification. Both confirmed findings are now fixed and verified.

| # | Severity | Area | Category | Confidence | Status |
|---|----------|------|----------|-----------|--------|
| 1 | **Medium** | Backend | Broken Access Control (IDOR) | 8/10 | Fixed & verified |
| 2 | **High** (probabilistic) | Frontend | Stored XSS (broken SVG sanitizer) | 7/10 | Fixed & verified |
| — | — | CLI | OAuth login-CSRF | 9/10 | **Rejected — false positive** |

The overall security posture is **strong**. Verification confirmed that auth guards, ownership enforcement, SQL parameterization, crypto (AES-256-GCM, secret validation at boot), SSO CSRF protection, PKCE, refresh-token rotation, and CLI path-traversal defenses are all correctly implemented. The two findings were localized gaps, not systemic weaknesses.

---

## Finding 1 — Broken Access Control (IDOR): private skill content leak via `/api/generate/suggestions`

- **Severity:** Medium
- **Category:** `broken_access_control` / IDOR / data exposure
- **Confidence:** 8/10 (verified)
- **Location:**
  - [packages/backend/src/generation/generation.controller.ts:144-155](packages/backend/src/generation/generation.controller.ts#L144-L155)
  - [packages/backend/src/generation/generation.service.ts:366-378](packages/backend/src/generation/generation.service.ts#L366-L378)
  - [packages/backend/src/generation/dto/suggest.dto.ts:14-17](packages/backend/src/generation/dto/suggest.dto.ts#L14-L17)
  - [packages/backend/src/skills/skill.repository.ts:62-65](packages/backend/src/skills/skill.repository.ts#L62-L65)

### Description
`POST /api/generate/suggestions` accepts a caller-supplied `skillId` in the request **body**. When `mode === 'optimize'`, the service called `skillRepo.findById(skillId)` with **no ownership or org check**, then forwarded the fetched skill's `name`, `description`, and full `skillContent` to the LLM and returned tailored optimization suggestions to the caller.

The route had **no `@CheckOwnership` decorator** — unlike its sibling routes `refine` and `optimizeDraft`, which both carry `@CheckOwnership('id')`. `SkillOwnerGuard` resolves the target ID exclusively from `request.params` and returns `true` when no `@CheckOwnership` metadata is present, so a body-supplied `skillId` was never subject to an ownership assertion. `findById(id)` is a bare `findOneBy({ id })` — no `ownerId`/`orgId` filter (contrast `findByName`, which *is* owner-scoped).

### Exploit Scenario
Any authenticated user obtains a skill UUID belonging to another user (skill UUIDs are legitimately exposed to all authenticated users via marketplace endpoints, which use `:skillId` as the public identifier). They call:

```http
POST /api/generate/suggestions
{ "mode": "optimize", "skillId": "<victim-skill-uuid>" }
```

The server loaded the victim's private/unpublished `skillContent` and returned LLM-generated suggestions explicitly derived from and quoting that content — disclosing another user's private skill material.

### Why 8/10 (not higher)
Skill IDs are UUIDs (`@PrimaryGeneratedColumn('uuid')`), so blind enumeration is infeasible. Exploitation depends on a supply of *known* IDs — which the marketplace legitimately provides — and the disclosure is indirect (LLM-derived suggestions rather than a verbatim dump). Both attenuate severity but do not eliminate the leak.

### Recommendation — APPLIED & VERIFIED (2026-07-02)
**Fix applied:**
- `GenerationService.suggestPrompts` now calls `ownershipService.assertOwnership(skillId)` before `skillRepo.findById(skillId)` in the `optimize` branch. Privileged roles bypass via `isAtLeast(role, 'admin')` (so both `admin` and the higher `owner` role pass); all other users must own the skill → `ForbiddenException`/`NotFoundException`. `OwnershipModule` imported into `GenerationModule`.
- `SuggestDto.skillId` tightened from free-form `@IsString() @MaxLength(100)` to `@IsUUID()`.

**Verification:** Backend build passes; added 4 unit tests in `generation.service.spec.ts` (asserts ownership in optimize mode; propagates Forbidden and never loads a non-owned skill; admin bypass; owner bypass; create mode touches neither ownership nor the repo) — all green. Existing generation specs updated for the new dependency and pass. Lint: 0 errors.

---

## Finding 2 — Stored XSS: mermaid diagram SVG rendered via `dangerouslySetInnerHTML` with a bypassable sanitizer

- **Severity:** High (impact) — exploitation is LLM-gated/probabilistic
- **Category:** `xss` (stored, cross-user)
- **Confidence:** 7/10 (verified — flaw unambiguous, exploitation reliability is the caveat)
- **Location:**
  - [packages/frontend/src/components/skills/SkillDiagramViewer.tsx](packages/frontend/src/components/skills/SkillDiagramViewer.tsx)
  - [packages/backend/src/generation/skill/diagram.service.ts](packages/backend/src/generation/skill/diagram.service.ts) (bracket-only validation, no HTML sanitization)
  - Cross-user delivery: [share.controller.ts:115](packages/backend/src/sharing/share.controller.ts#L115), [marketplace.controller.ts:224](packages/backend/src/marketplace/marketplace.controller.ts#L224)

### Description
The rendered mermaid SVG was injected via `dangerouslySetInnerHTML`, bypassing React's built-in XSS protection. Mermaid was initialized with `securityLevel: 'loose'` and `htmlLabels: true`, which emits node-label HTML **unescaped** into SVG `<foreignObject>` elements. DOMPurify had been deliberately removed and replaced by a hand-rolled regex sanitizer that only stripped `<script>...</script>` blocks and event-handler attributes matching `/\son[a-z]\w*\s*=.../gi`.

Because the attribute regex required **leading whitespace** (`\s`) before `on`, slash-separated attributes survived. These payloads passed the sanitizer intact (empirically traced during verification):

```html
<img src=x/onerror=alert(document.cookie)>
<iframe src="javascript:...">
<set .../>  <animate .../>
```

The mermaid diagram string is LLM-generated from user-authored skill `name`/`description`/`skillContent` and is validated backend-side only for bracket balance — never HTML-sanitized.

### Exploit Scenario
An attacker authors a skill whose name/description/content steers the diagram LLM into emitting a node label containing an injection payload (node labels reliably echo the skill name/description). The attacker shares the skill or publishes it to the marketplace. When a **different** authenticated user opens the diagram tab — served cross-user via `generateSharedDiagram` (org-scoped, ownership not required) or `getMarketplaceSkillDiagram` — the injected HTML executed in the victim's origin. The access token is held in memory and requests are same-origin, so injected script could call the API as the victim → cross-user stored XSS.

### Why 7/10
The sink (`dangerouslySetInnerHTML`), the mermaid config, the sanitizer bypass, and cross-user reachability are all **unambiguously confirmed**. The single uncertainty: the payload must survive an LLM round-trip — the attacker steers rather than directly injects the mermaid output. This is plausible and repeatable but probabilistic, not guaranteed. The underlying sanitizer defect is a real, deterministic vulnerability regardless.

### Recommendation — APPLIED & VERIFIED (2026-07-02)
**Fix applied** in `SkillDiagramViewer.tsx`:
- `securityLevel: 'loose'` → **`'strict'`**, keeping `htmlLabels: true`. Mermaid sanitizes the label *text* internally (its bundled DOMPurify) while preserving the `<foreignObject>/<div>` structure, so **box content still renders** but injected HTML/JS is encoded to inert text.
- Fallback `sanitizeSvg` hardened (defense-in-depth only): event-handler regex now matches non-space separators (`<img src=x/onerror=…>`) and strips `javascript:`/`data:` URLs. It only removes `<script>`/handlers — never emitted legitimately by mermaid — so it cannot blank labels.

**Why not the two approaches that previously broke rendering:**
- ❌ `htmlLabels: false` — changes the label render mechanism → blank/mis-sized boxes.
- ❌ DOMPurify over the finished SVG — strips `<div>` inside `<foreignObject>` (mXSS namespace defense) → erases mermaid v11 labels.

**Verification:** Frontend build passes; isolated browser render (exact config, normal diagram + `<img onerror>` payload) confirmed boxes render their text and the payload is inert (no script execution).

**Remaining defense-in-depth (optional):** sanitize the LLM-generated mermaid on the backend before persisting/serving, not only bracket-balance validation.

---

## Rejected Candidate — CLI OAuth "authorization-code injection" (FALSE POSITIVE)

- **Claim:** The `--sso` login flow lacks a CLI-generated `state`, so `GET /callback?code=…` on the loopback port accepts any code → login-CSRF / auth-code injection.
- **Verification verdict:** **False positive, 9/10 confidence.**
- **Why rejected:** The `code` delivered to the loopback callback is **not** an IdP OAuth authorization code — it is a server-minted opaque one-time credential (`randomBytes(32)`, 256-bit, Redis-stored, single-use, ~60s TTL) generated *after* the IdP callback has already succeeded and CSRF was validated. RFC 6749 §10.12 auth-code injection does not apply. The upstream CSRF protection the finding claims is missing **is present**: OIDC validates a single-use `state` (`consumeOidcState`), SAML validates an HMAC-signed nonce in `RelayState`, and OIDC PKCE binds the browser session to the server exchange. The callback server is correctly loopback-only (`listen(0, '127.0.0.1')`) and closes after one request.
- **Residual hardening note (not a vulnerability):** Adding a CLI-generated `state` echoed through `cli_redirect` would be reasonable defense-in-depth against a login-CSRF tail case, but its absence is not exploitable given the server-side one-time-code design.

---

## Areas Verified as Solid (no findings)

- **SQL injection:** All raw `em.query`/`dataSource.query` calls (marketplace submissions) are fully parameterized; migrations are static.
- **Access control (broadly):** `skills`, `eval-*`, `export`, `sharing`, `generate/:id/*`, `description-optimizer` all correctly apply `@CheckOwnership` / org-scoped `authorizeSharedAccess`. Finding 1 was the single gap.
- **Auth:** JWT strategy loads live user + `isActive`; PAT strategy enforces read-only (GET) scope; refresh-token rotation binds token to `userId` + hash + reuse-revocation; CLI refresh ignores caller-supplied email.
- **SSO:** SAML signed assertions + HMAC RelayState CSRF nonce, `cli_redirect` restricted to `localhost`; OIDC PKCE + single-use state, insecure HTTP only in non-prod.
- **Crypto/secrets:** AES-256-GCM (random 96-bit IV + auth tag) for SMTP passwords; secrets masked in responses; `JWT_SECRET` (min 32, placeholder-rejected) and `ENCRYPTION_KEY` (64 hex) validated at boot; agent subprocess env allowlisted.
- **CLI file ops:** `sanitizePath()` (basename + `[a-zA-Z0-9._-]` whitelist + `unnamed` fallback) neutralizes `..`/absolute/separator injection; `assertSafePath()` confines writes/deletes to HOME/CWD with correct trailing-separator prefix check.
- **CLI command exec:** Only `execFile('icacls', [...])` (fixed binary, array args, no shell); no shell usage anywhere.
- **Frontend:** access token in memory only (never localStorage); redirect sanitizers reject protocol-relative/cross-origin; markdown viewers use `rehypeSanitize` / no `rehype-raw`; no `eval`/`new Function`/`document.write`/`postMessage` handlers; no hardcoded secrets.

### Latent risk (not currently exploitable)
User-management endpoints (`/api/users`) are admin-only but **not org-filtered** — safe *only* because the deployment is single-org-per-instance (`orgRepo.findSingleton()`, `userRepo.findAll()`). If multi-tenant-single-instance is ever introduced, these become cross-org IDORs. Add org scoping proactively if multi-tenancy is on the roadmap.

---

## Course of Action

### Priority 1 — fixed before next release
1. ✅ **DONE — Finding 1 (IDOR):** Ownership enforced in `suggestPrompts` via `assertOwnership(skillId)` (privileged-role bypass via `isAtLeast`) + `@IsUUID()` on `skillId`. Unit-tested.
2. ✅ **DONE — Finding 2 (XSS):** mermaid `securityLevel: 'strict'` with `htmlLabels: true` (kept — `false` breaks label rendering), plus a hardened fallback sanitizer. Verified rendering + inert payload in-browser.

### Also fixed (role-hierarchy consistency, found during Finding 1 work)
- ✅ **`SkillOwnerGuard` admin bypass** ([skill-owner.guard.ts:62](packages/backend/src/ownership/guards/skill-owner.guard.ts#L62)) used a raw `userRole === 'admin'`, which locked the higher-privileged platform **owner** (role hierarchy `owner:3 > admin:2 > user:1`) out of skills it did not personally own on every `@CheckOwnership` route. Changed to `isAtLeast(role, 'admin')` to match `RolesGuard`. Same idiom applied to the new `suggestPrompts` check. Owner-bypass regression tests added to both specs.
- Audited all raw role comparisons: the `users.service.ts` `=== 'owner'` / `!== 'owner'` gates are intentional exact top-role authority checks (only an owner may assign owner/admin) and are functionally identical to `isAtLeast` since owner is the max role — left unchanged.

### Priority 2 — defense-in-depth (open)
3. Backend-side sanitization of LLM-generated mermaid before persist/serve.
4. Add a CLI-generated `state` to the SSO flow (hardening; not exploitable today).

### Priority 3 — proactive / future-proofing (open)
5. Org-scope `/api/users` endpoints ahead of any multi-tenant-single-instance change.

### Verification performed
- `npm run build` (backend + frontend) — green.
- Backend generation + ownership + users suites — all green (incl. new IDOR + owner-bypass tests).
- Lint: 0 errors.
- Finding 2 rendering confirmed in-browser (boxes render; injected payload inert).
