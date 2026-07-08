# SkillSpell ✨

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![CI](https://github.com/arnoldsimha/skillspell/actions/workflows/ci.yml/badge.svg)](https://github.com/arnoldsimha/skillspell/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](.nvmrc)

**Create, refine, and manage AI agent skills using natural language — no CLI required.**

SkillSpell is a web platform that helps teams build high-quality AI agent skills: structured instruction sets for Claude. Describe what you need in plain English — SkillSpell generates, refines, evaluates, and distributes the skill. Deploy to any AI coding assistant.

<p align="center">
  <video src="https://github.com/arnoldsimha/skillspell/raw/main/assets/walkthrough.webm" width="820" controls muted autoplay loop playsinline>
    <a href="https://github.com/arnoldsimha/skillspell/raw/main/assets/walkthrough.webm">▶ Watch the SkillSpell walkthrough</a> — generate, evaluate, and export an AI agent skill from plain English.
  </video>
</p>

---

## Why SkillSpell?

- **Web UI for everyone** — build and manage AI skills through an intuitive interface, no manual prompt writing required, while still giving developers full control
- **Natural language in, production skill out** — describe what you need and get a ready-to-use, structured skill file
- **Self-service for the whole team** — technical and non-technical users alike can create, iterate, and evaluate skills independently
- **Built-in quality assurance** — eval system with test cases, automated grading, and benchmarks replaces manual review
- **Visual diff & version history** — track every change with version snapshots and side-by-side comparisons
- **One-command install** — distribute skills to any AI coding tool via `@skillspell/cli`

### Compared to CLI-Based Skill Authoring
| Feature | CLI / Manual | SkillSpell |
|---|---|---|
| Skill creation | Write markdown by hand | Describe in natural language, AI generates |
| Iteration | Edit files, re-test manually | Conversational refinement with AI |
| Quality assurance | Manual review | Built-in eval system with automated grading |
| Versioning | Git commits | Automatic version snapshots with benchmarks |
| Multi-format export | Copy & adapt per tool | One-click export to 5 formats |
| Team collaboration | Share files | Multi-user with roles, orgs, SSO |
| Optimization | Manual prompt tuning | AI-powered draft optimization suggestions |
| Visualization | None | Auto-generated Mermaid diagrams |
| Distribution | Manual file copy | `skillspell install <skill>` CLI |

### Key Capabilities

- 🤖 **AI-Powered Generation** — uses Claude via the AWS Strands Agent framework (Anthropic Messages API, with Azure AI Foundry, AWS Bedrock, OpenAI, and Google as alternative providers) to generate complete, multi-file skills
- 🔄 **Conversational Refinement** — iteratively refine skills through natural-language conversation with streaming responses
- 📊 **Eval System** — create test cases, run evaluations, get automated grading & benchmarks
- 📈 **Smart Suggestions** — AI recommends improvements based on your skill content
- ⚡ **Draft Optimization** — AI analyzes and suggests optimizations before you commit
- 📦 **Multi-Format Export** — export your AI agent skill to Claude Code, Cursor, Windsurf, GitHub Copilot, Roo Code, or other formats
- 🔀 **Version History** — full version snapshots with diff viewer and benchmark tracking
- 🏢 **Organizations & SSO** — multi-tenant with SAML and OIDC SSO, role-based access (owner/admin/user)
- 📧 **Email Invitations** — invite team members with configurable SMTP
- 📊 **Mermaid Diagrams** — auto-generated visual diagrams for each skill
- 🗄️ **PostgreSQL Storage** — behind pluggable repository ports, so another storage adapter could be added without touching service code
- 🖥️ **CLI Distribution** — publish and install skills via `@skillspell/cli` npm package
- 🏪 **Marketplace (Organization-Configurable)** — browse and discover published skills, submit for approval, and administer marketplace access on a per-organization basis

---

## `@skillspell/cli`

The `@skillspell/cli` package lets developers install skills directly from a SkillSpell instance into their AI coding tools.

```bash
npm install -g @skillspell/cli

# Point the CLI at your SkillSpell instance
skillspell config url https://your-skillspell-instance.com

# Log in (email/password or SSO)
skillspell login
skillspell login --sso       # SAML / OIDC browser flow

# Browse and install skills
skillspell list
skillspell install my-skill           # install to current workspace
skillspell install my-skill --global  # install globally

# Manage installed skills
skillspell outdated
skillspell update my-skill
skillspell uninstall my-skill
```

Install targets supported: Claude Code, Cursor, Windsurf, GitHub Copilot, Roo Code (export your AI agent skill to any tool).

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20.0.0 (see [`.nvmrc`](.nvmrc))
- **Docker** & **Docker Compose** — runs PostgreSQL and Redis (both required at boot) plus optional dev tools. `npm run db:postgres:up` starts them.
- **An LLM provider** — Anthropic (direct), Azure AI Foundry, AWS Bedrock, OpenAI, or Google. All run through the AWS Strands Agent framework; pick one via `LLM_PROVIDER`.

### 1. Clone & Install

```bash
git clone https://github.com/arnoldsimha/skillspell.git
cd skillspell
npm install
```

### 2. Configure Environment

```bash
cp .env.example packages/backend/.env
```

Edit `packages/backend/.env` and set the required values. See [`.env.example`](.env.example) for the full reference.

**Required variables:**

```env
# AI Provider
AI_API_BASE_URL=https://api.anthropic.com    # or Azure AI Foundry / Bedrock URL
AI_API_KEY=your-api-key
AI_MODEL=claude-sonnet-4-20250514

# Authentication
JWT_SECRET=generate-a-random-64-char-hex-string

# PostgreSQL (defaults work with Docker Compose)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=skillspell
POSTGRES_USER=skillspell
POSTGRES_PASSWORD=skillspell_dev
```

Generate secrets with:

```bash
# JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# ENCRYPTION_KEY (optional — 64-char hex, for storing SMTP passwords at rest)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Common environment variables** (see [`.env.example`](.env.example) for the complete, annotated list):

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | | `anthropic` | Provider: `anthropic`, `azure`, `bedrock`, `openai`, or `google`. All run through the Strands Agent framework. |
| `AI_API_BASE_URL` | | `https://api.anthropic.com` | API endpoint (anthropic/azure). Required for `azure` (Foundry endpoint). |
| `AI_API_KEY` | ✅ | — | API key (anthropic/azure). |
| `AI_MODEL` | ✅ | — | Main model / deployment name. |
| `AI_MODEL_LIGHT` | | `AI_MODEL` | Lighter model for suggestions, diagrams, grading. |
| `OPENAI_API_KEY` | | — | Required when `LLM_PROVIDER=openai`. |
| `GOOGLE_API_KEY` | | — | Required when `LLM_PROVIDER=google`. |
| `AWS_REGION` | | — | Region for `LLM_PROVIDER=bedrock` (uses AWS credential chain). |
| `AI_GENERATION_TIMEOUT_MS` | | `600000` | Timeout for generation calls (ms) |
| `AI_LIGHT_TIMEOUT_MS` | | `30000` | Timeout for lightweight AI calls (ms) |
| `JWT_SECRET` | ✅ | — | JWT signing secret (≥ 32 chars) |
| `JWT_ACCESS_TOKEN_EXPIRY` | | `15m` | Access token TTL |
| `JWT_REFRESH_TOKEN_EXPIRY` | | `7d` | Refresh token TTL |
| `POSTGRES_HOST` | | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | | `5432` | PostgreSQL port |
| `POSTGRES_DB` | | `skillspell` | Database name |
| `POSTGRES_USER` | | `skillspell` | Database user |
| `POSTGRES_PASSWORD` | ✅ | — | Database password |
| `POSTGRES_SSL` | | `false` | Enable SSL for Postgres connection |
| `POSTGRES_POOL_SIZE` | | `25` | Connection pool size |
| `POSTGRES_SYNCHRONIZE` | | `false` | Auto-sync schema (dev only, never in prod) |
| `REDIS_HOST` | | `localhost` | Redis host (grading cache, throttler storage, draft state) |
| `REDIS_PORT` | | `6379` | Redis port |
| `REDIS_PASSWORD` | | — | Redis password (leave empty for local dev) |
| `PASSWORD_MIN_LENGTH` | | `8` | Minimum password length |
| `PASSWORD_BCRYPT_ROUNDS` | | `12` | bcrypt cost factor |
| `ACCOUNT_LOCKOUT_THRESHOLD` | | `5` | Failed login attempts before lockout |
| `ACCOUNT_LOCKOUT_DURATION_MINUTES` | | `15` | Lockout duration (minutes) |
| `APP_PUBLIC_URL` | | — | Public URL for SAML/OIDC metadata and email links |
| `CORS_ALLOWED_ORIGINS` | | — | Comma-separated allowed CORS origins |
| `ENCRYPTION_KEY` | | — | 64-char (256-bit) hex key for encrypting SMTP passwords at rest (AES-256-GCM) |
| `SESSION_MAX_MESSAGES` | | `20` | Max messages per skill session |
| `AGENT_ENV_ALLOWLIST` | | `PATH,HOME,...` | Env vars forwarded to agent subprocess |
| `RATE_LIMIT_SHORT_TTL` | | `1000` | Short rate limit window (ms) — 20 req/sec per IP |
| `RATE_LIMIT_SHORT_LIMIT` | | `20` | Max requests in short window |
| `RATE_LIMIT_LONG_TTL` | | `3600000` | Long rate limit window (ms) — 500 req/hour per IP |
| `RATE_LIMIT_LONG_LIMIT` | | `500` | Max requests in long window |
| `PORT` | | `3000` | Server port |

### 3. Start PostgreSQL

```bash
npm run db:postgres:up
```

### 4. Run Database Migrations

```bash
npm run db:postgres:migrate
```

### 5. Start Development Server

```bash
npm run dev
```

This starts both the backend (NestJS) and frontend (Vite) with hot reload via [portless](https://github.com/nicholasgasior/portless), which assigns custom `.localhost` URLs instead of numbered ports.

| Service | URL |
|---------|-----|
| Frontend | `http://skillspell.localhost:1355/` |
| Backend API | `http://api.skillspell.localhost:1355/` |
| Swagger UI | `http://api.skillspell.localhost:1355/api/docs` |

> **Without portless:** If you run backend and frontend individually without `npm run dev`, the app falls back to `localhost:3000` (backend) and `localhost:5173` (frontend). Set `PORT` in your `.env` to override.

### 5b. Seed Demo Data (optional)

After completing migrations, populate a demo skill with eval cases so you have real data to explore:

```bash
npx ts-node --project packages/storage/postgres/tsconfig.json scripts/seed-dev.ts
```

The script is idempotent — running it twice is safe. It seeds one skill ("Write clear Git commit messages") with 4 eval cases covering feat/fix/docs/refactor commit types.

### 6. Open the App

Open **http://skillspell.localhost:1355/** in your browser. On first launch, you'll be guided through initial setup (create admin account).

---

## Running with Docker

To run the entire stack in Docker (Postgres + the application):

```bash
# Build and start Postgres + SkillSpell app
npm run docker:up

# Start everything (Postgres + app + pgAdmin + Mailpit)
npm run docker:up:all

# Stop the app
npm run docker:down
```

The app will be available at **http://localhost:3000**.

### Production / Self-Hosting

For a hardened production run, layer the production compose overlay (resource
limits, `NODE_ENV=production`, JSON logging) on top of the base stack:

```bash
npm run docker:prod:up     # docker-compose.yml + docker-compose.prod.yml
npm run docker:prod:down
```

`docker/k8s-security-context.yaml` is a reference Kubernetes Deployment with a
hardened security context (non-root, read-only root filesystem, dropped
capabilities) you can adapt for your cluster.

---

## Useful Commands

| Command | Description |
|---|---|
| `npm run dev` | Start backend + frontend in dev mode |
| `npm run build` | Build for production |
| `npm run db:postgres:up` | Start PostgreSQL via Docker |
| `npm run db:postgres:down` | Stop PostgreSQL |
| `npm run db:postgres:migrate` | Run database migrations |
| `npm run mail:up` | Start Mailpit (dev SMTP) |
| `npm run docker:up` | Run full app in Docker |
| `npm run docker:up:all` | Run app + all dev tools in Docker |
| `npm run docker:build` | Build Docker image |
| `make help` | Show all Makefile targets |
| `make install` | Install dependencies |
| `make dev` | Start dev server (alias for `npm run dev`) |
| `make test` | Run backend tests |
| `make docker-up` | Start full stack in Docker |

---

## Default Ports

| Service | Port | Profile | Notes |
|---|---|---|---|
| SkillSpell app (backend + frontend) | `3000` | `app` | NestJS serves the React SPA at `/` and the API at `/api` |
| Swagger UI | `3000` | dev only | Available at `http://localhost:3000/api/docs` when `NODE_ENV != production` |
| PostgreSQL | `5432` | default | Override with `POSTGRES_PORT` env var |
| pgAdmin 4 | `5050` | `tools` | Database management UI — `npm run docker:up:all` to start |
| Mailpit SMTP | `1025` | `tools` | Dev email sink — configure SMTP host to `localhost:1025` |
| Mailpit Web UI | `8025` | `tools` | View sent emails at `http://localhost:8025` |
| Aspire OTEL Dashboard | `18888` | `tools` | Traces + metrics viewer at `http://localhost:18888` |
| Aspire OTLP gRPC | `18889` | `tools` | Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:18889` |
| Aspire OTLP HTTP | `18890` | `tools` | Used by Node.js OTEL SDK; set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:18890` |

All ports can be overridden via environment variables in `packages/backend/.env`. See [`.env.example`](.env.example) for the full reference.

---

## Documentation

- [CLI Guide](docs/cli-guide.md) — skillspell CLI: install, commands, config, receipt system, troubleshooting
- [PostgreSQL Guide](docs/postgres-guide.md) — database setup, migrations, pgAdmin
- [Skill Tests Guide](docs/skill-tests-wiki.md) — eval system, grading, benchmarks, optimization loop

---

## Roadmap

Planned and proposed work. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

### MCP context enrichment
- [ ] Connect skills to Model Context Protocol (MCP) servers so generation, refinement, and eval can pull live context (docs, code, tickets, APIs) from external tools
- [ ] Let skill authors attach MCP resources/tools as named context sources
- [ ] Feed MCP-provided context into the eval runner so grading reflects real runtime context
- [ ] Expose SkillSpell itself as an MCP server so agents can search and install skills over MCP

### CLI enhancements
- [ ] `skillspell init` — scaffold a new skill locally from a template
- [ ] `skillspell publish` / `push` — create or update a skill on your instance from local files
- [ ] `skillspell validate` — lint a `SKILL.md` offline before publishing
- [ ] `skillspell sync` — update all installed skills in one command
- [ ] Version pinning + a lockfile for reproducible installs across a team
- [ ] Shell completions (bash/zsh/fish) and a first-class non-interactive `--json` / CI mode
- [ ] Interactive TUI to browse and search the marketplace

### Also proposed
- [ ] **Self-hosting** — official container image + Helm chart so teams can deploy without hand-writing manifests
- [ ] **Second storage adapter** behind the existing repository ports (PostgreSQL is the only one today)
- [ ] **Eval quality** — grader decomposition and multi-sample presets (Fast / Standard / Thorough) for more reliable, less noisy scores
- [ ] **Marketplace** — ratings & reviews, category browsing, and a real "featured" feed
- [ ] **Observability** — per-skill cost & latency dashboards on top of the existing Langfuse integration
- [ ] **Security** — MFA/2FA and org-level audit logging
- [ ] **Integrations** — outbound webhooks (skill published, benchmark completed) for CI pipelines
- [ ] **Quality** — broader end-to-end test coverage and an accessibility / i18n pass on the UI

---

## Third-Party Dependencies

### AI & LLM
| Package | Purpose |
|---|---|
| `@strands-agents/sdk` | AWS Strands Agent framework — the LLM runtime for all calls (generation, refinement, eval, grading, suggestions, diagrams); AgentSkills plugin for skill discovery |
| `@anthropic-ai/sdk` | Anthropic Messages API (anthropic/azure providers) |
| `@anthropic-ai/foundry-sdk` | Azure AI Foundry client (azure provider — handles Azure `api-key` auth) |
| `openai` | OpenAI models (openai provider, via Strands) |
| `@google/genai` | Google Gemini models (google provider, via Strands) |

### Backend
| Package | Purpose |
|---|---|
| `@nestjs/*` | NestJS framework (API server, config, JWT, static files) |
| `typeorm` + `pg` | PostgreSQL ORM and driver |
| `passport` + `passport-jwt` | JWT authentication |
| `@node-saml/passport-saml` | SAML SSO integration |
| `openid-client` | OIDC SSO integration |
| `nodemailer` | Email sending (invitations) |
| `bcryptjs` | Password hashing |
| `archiver` | ZIP file generation for skill exports |
| `nestjs-cls` | Async local storage for request context |
| `nest-winston` + `winston` | Structured JSON logging |
| `zod` | Runtime schema validation |

### Frontend
| Package | Purpose |
|---|---|
| `react` + `react-dom` | React 19 UI framework |
| `react-router` | Client-side routing |
| `tailwindcss` | Utility-first CSS framework |
| `mermaid` | Diagram rendering |
| `react-markdown` | Markdown rendering for skill content |
| `react-syntax-highlighter` | Code syntax highlighting |
| `react-diff-viewer-continued` | Visual diff for version comparison |

### CLI (`@skillspell/cli`)
| Package | Purpose |
|---|---|
| `commander` | CLI argument parsing |
| `@clack/prompts` | Interactive terminal UI |
| `ora` | Spinner / progress indicators |
| `open` | Open browser for SSO flows |

### Infrastructure
| Service | Purpose |
|---|---|
| PostgreSQL 16 | Primary database |
| pgAdmin 4 | Database management UI (optional) |
| Mailpit | Development SMTP server (optional) |
| Docker | Containerized deployment |

---

## Author

**Arnold Simha**

## License

This project is licensed under the [Apache License 2.0](LICENSE).
