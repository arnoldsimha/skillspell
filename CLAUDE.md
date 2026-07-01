## Project

**SkillSpell**

SkillSpell is a full-stack web platform for creating, refining, evaluating, and exporting AI agent skills powered by Anthropic Claude. Teams use it to build reusable Claude Code skills — structured instruction sets that make Claude better at specific tasks — through an iterative generate → test → optimize loop.

**Core Value:** Skills that actually work: the evaluation and optimization loop must surface real quality signals and improve skills reliably. Everything else serves this.

### Constraints

- **Tech stack**: NestJS + React — no framework changes
- **AI runtime**: all LLM calls run through the AWS Strands Agent framework (the Claude Agent SDK has been removed). Multi-provider via `LLM_PROVIDER` (anthropic | azure | bedrock | openai | google) — never reintroduce a direct provider SDK at a call site; go through `LlmService`.
- **Backward compat**: existing SSE endpoints must remain functional during any migration

## Technology Stack

- **Backend**: NestJS (TypeScript, ESM)
- **Frontend**: React
- **Storage**: PostgreSQL (adapter-based via shared repository ports)
- **LLM runtime**: AWS Strands Agent SDK (`@strands-agents/sdk`) with the AgentSkills plugin for skill discovery from `skills-workspace/skills/`. Anthropic/Azure use the Anthropic Messages API (`@anthropic-ai/sdk`, `@anthropic-ai/foundry-sdk` for Azure); OpenAI/Google run through Strands models (`openai`, `@google/genai`).
- **Provider selection**: env-driven via `LLM_PROVIDER` + per-provider credentials; no provider-specific code at call sites.

## Conventions

- **Commit messages**: Use semantic commits (`fix:`, `feat:`, `chore:`, `docs:`, `test:`, `refactor:`) with concise messages focused on the WHY
- **PR guidelines**: One concern per PR, keep them focused and reviewable
- **Testing**: Add or update tests for any changed behavior; verify with `npm run build` and linting before submitting
- **Node.js**: 20+ required for development and CI
- **Workspace structure**: Monorepo with `packages/{backend,frontend,cli,shared}` and `packages/storage/postgres`

## Architecture

Follow existing patterns found in the codebase.

**LLM layer (ports & adapters):** All generation, refinement, evaluation, grading, suggestions, diagrams, and optimization go through a single provider-agnostic facade, `LlmService` (`packages/backend/src/generation/llm/llm.service.ts`). `LlmService` delegates to the runtime adapter bound to the `LLM_TRANSPORT` token — the `LlmTransport` port (`generation/llm/llm-transport.port.ts`). The current adapter is `StrandsTransport` (`generation/llm/transports/strands/strands.transport.ts`); `StrandsConfigService` (same folder) owns provider/model selection per `LLM_PROVIDER`. All providers route through Strands structured output (Zod tool schemas); for anthropic/azure, `StrandsConfigService.getClient()` builds the Strands `AnthropicModel` over the native `@anthropic-ai/sdk` (preserving prompt caching via `cachePoint` and forced `tool_use`). Switching providers is an env change; switching the runtime framework is a new adapter implementing `LlmTransport` + rebinding `LLM_TRANSPORT` — no call-site changes. Provider-neutral prompt/parse utilities (`PromptLoaderService`, `PromptDumpService`, `llm-response-parser.ts`) live in `generation/prompts/`.

**Storage note:** PostgreSQL is the single storage adapter, behind the shared repository ports (`packages/shared/repositories/*.interface.ts`). The abstraction is retained so another adapter could be added without touching call sites.

## Development Workflow

**Local setup:**

- Backend: `npm run backend:dev` (NestJS + PostgreSQL adapter)
- Frontend: `npm run frontend:dev` (React)
- Database: `npm run db:postgres:up` (Docker Compose)

**Core modules to know:**

- `packages/backend/src/generation/llm/` — LLM layer (LlmService, transports, StrandsConfigService)
- `packages/backend/src/eval/` — evaluation system (test cases, grading, benchmarks)
- `packages/backend/src/marketplace/` — skill distribution & marketplace
- `packages/backend/src/auth/` — org/SSO/RBAC
- `packages/frontend/src/` — React UI for skill authoring, refinement, eval
- `packages/cli/` — `@skillspell/cli` npm package for skill installation

**Important constraints:**

- Multi-provider LLM calls go through `LlmService` only — never use provider SDKs directly at call sites
- Storage: PostgreSQL is the single adapter, behind the shared repository ports; the abstraction is retained so another adapter could be added without touching call sites
- Provider switching is env-driven (`LLM_PROVIDER`) — no code changes needed
- SSE endpoints must remain backward-compatible during any migration

**Current focus areas** (from recent commits):

- Langfuse v3 integration for LLM observability (tracing, span processors, OTEL bootstrap)
- Strands multi-provider migration — all providers now route through Strands structured output
- Security hardening (JWT_SECRET validation, etc.)

## Knowledge Graph

The codebase knowledge graph exists at `/docs/graph/` and contains the full architectural map. Before making decisions about dependencies, placements, or refactors:

1. **Read GRAPH_REPORT.md first** — `/docs/graph/GRAPH_REPORT.md` contains key concepts, node summaries, and surprising connections
2. **View the graph visually** — Open `/docs/graph/graph.html` for interactive exploration
3. **Query the graph** — point graphify at the committed graph via `GRAPHIFY_OUT`:

   ```bash
   export GRAPHIFY_OUT=docs/graph                      # graphify reads/writes here
   graphify query "question about relationships"       # find connections
   graphify explain "ComponentName"                    # understand a component
   graphify path "Source" "Target"                     # trace dependency paths
   ```

**When to actively consult the graph:**

- Before planning features or refactors
- Understanding dependencies between services/modules
- Deciding where to place new code
- Investigating architectural issues or circular dependencies
- Making decisions about breaking changes or API contracts

**Graph update workflow:** graphify has **no `--out`/`--output` flag** — its output dir is the `GRAPHIFY_OUT` env var (default `graphify-out/`). To regenerate into the tracked `docs/graph/` directly, set it for both steps, then commit:

```bash
GRAPHIFY_OUT=docs/graph graphify extract . --backend=claude-cli       # AST + semantic extraction
GRAPHIFY_OUT=docs/graph graphify cluster-only . --backend=claude-cli  # builds GRAPH_REPORT.md + names communities
```

(`--backend=claude-cli` uses the local authenticated Claude CLI / subscription — no API key needed.)

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
