---
title: "PostgreSQL"
description: "Database setup, migrations, and pgAdmin for self-hosting SkillSpell"
---

# PostgreSQL Storage Guide

SkillSpell uses PostgreSQL as its storage backend. This guide covers local setup, configuration, migrations, and common operations.

> **Architecture note** — `@skillspell/storage-postgres` implements the repository interfaces from `@skillspell/shared`. It is the single storage adapter, wired in `app.module.ts`. The port abstraction is retained so another adapter could be added without service-layer or frontend changes.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [NestJS Module Configuration](#nestjs-module-configuration)
5. [Docker Compose Services](#docker-compose-services)
6. [Schema Migrations](#schema-migrations)
7. [Generating New Migrations](#generating-new-migrations)
8. [pgAdmin (GUI)](#pgadmin-gui)
9. [Supporting Infrastructure](#supporting-infrastructure)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Docker** and **Docker Compose** (for local Postgres)
- **Node.js ≥ 20**
- `npm install` at the repo root (installs all workspace packages)

---

## Quick Start

```bash
# 1. Start the Postgres + Redis containers
npm run db:postgres:up

# 2. Run schema migrations (creates the full schema)
npm run db:postgres:migrate

# 3. Start the backend (watches for changes)
npm run backend:dev
```

That's it. The backend connects to `localhost:5432/skillspell` by default.

---

## Configuration

All Postgres settings are read from `packages/backend/.env`. Copy from `.env.example` if you don't have one:

```bash
cp .env.example packages/backend/.env
# Edit packages/backend/.env and set POSTGRES_PASSWORD + other required vars
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_HOST` | `localhost` | Postgres hostname |
| `POSTGRES_PORT` | `5432` | Postgres port |
| `POSTGRES_DB` | `skillspell` | Database name |
| `POSTGRES_USER` | `skillspell` | Database user |
| `POSTGRES_PASSWORD` | *(required)* | Database password. Use `skillspell_dev` for local Docker. |
| `POSTGRES_SSL` | `false` | Enable SSL (`true` / `false`) |
| `POSTGRES_CA_CERT` | *(optional)* | PEM-encoded CA certificate for SSL connections (cloud providers). |
| `POSTGRES_POOL_SIZE` | `25` | Connection pool size |
| `POSTGRES_SYNCHRONIZE` | `false` | Auto-sync schema from entities. **Never `true` in production.** |

### How Config Flows

1. **Zod validation** — `packages/backend/src/config/configuration.ts` validates all env vars at startup. Missing `POSTGRES_PASSWORD` causes an immediate error.
2. **Config factory** — The validated values are nested under `postgres.*` keys (`postgres.host`, `postgres.port`, etc.).
3. **Module wiring** — `app.module.ts` injects `ConfigService` into `PostgresStorageModule.forRootAsync()` to pass the connection options to TypeORM.

### NestJS Module Configuration

The storage module is defined in `packages/storage/postgres/src/postgres-storage.module.ts` and exposes two static methods:

#### `PostgresStorageModule.forRoot(options)` — Synchronous

For tests or simple setups where options are known at import time:

```typescript
import { PostgresStorageModule } from '@skillspell/storage-postgres';

@Module({
  imports: [
    PostgresStorageModule.forRoot({
      host: 'localhost',
      port: 5432,
      database: 'skillspell',
      username: 'skillspell',
      password: 'skillspell_dev',
      ssl: false,
      poolSize: 25,         // or match POSTGRES_POOL_SIZE env var
      synchronize: false,   // NEVER true in production
    }),
  ],
})
export class AppModule {}
```

#### `PostgresStorageModule.forRootAsync(options)` — Async (recommended)

Injects `ConfigService` to resolve connection options from environment variables:

```typescript
import { PostgresStorageModule } from '@skillspell/storage-postgres';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PostgresStorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        host: config.get('postgres.host', { infer: true }),
        port: config.get('postgres.port', { infer: true }),
        database: config.get('postgres.database', { infer: true }),
        username: config.get('postgres.username', { infer: true }),
        password: config.get('postgres.password', { infer: true }),
        ssl: config.get('postgres.ssl', { infer: true }),
        poolSize: config.get('postgres.poolSize', { infer: true }),
        synchronize: config.get('postgres.synchronize', { infer: true }),
      }),
    }),
  ],
})
export class AppModule {}
```

#### Options Interface

```typescript
interface PostgresStorageOptions {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean; ca?: string };
  poolSize?: number;
  /** NEVER set to true in production — auto-syncs schema from entities. */
  synchronize?: boolean;
}
```

#### What the Module Provides

The module is registered **globally** and exports 8 repository tokens, each bound to a Postgres implementation:

| Token | Repository | Interface |
|---|---|---|
| `SKILL_REPOSITORY` | `PostgresSkillRepository` | `ISkillRepository` |
| `EVAL_REPOSITORY` | `PostgresEvalRepository` | `IEvalRepository` |
| `SESSION_REPOSITORY` | `PostgresSessionRepository` | `ISessionRepository` |
| `USER_REPOSITORY` | `PostgresUserRepository` | `IUserRepository` |
| `CREDENTIAL_REPOSITORY` | `PostgresCredentialRepository` | `ICredentialRepository` |
| `AUTH_TOKEN_REPOSITORY` | `PostgresAuthTokenRepository` | `IAuthTokenRepository` |
| `ORGANIZATION_REPOSITORY` | `PostgresOrganizationRepository` | `IOrganizationRepository` |
| `SAML_CONFIG_REPOSITORY` | `PostgresSamlConfigRepository` | `ISamlConfigRepository` |

Services inject these tokens (e.g. `@Inject(SKILL_REPOSITORY)`) and program against the shared interfaces from `@skillspell/shared`, making the storage backend transparent.

---

## Docker Compose Services

The compose file lives at `docker/docker-compose.yml` (in the project root).

### Postgres

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-skillspell}
      POSTGRES_USER: ${POSTGRES_USER:-skillspell}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-skillspell_dev}
    volumes:
      - pgdata:/var/lib/postgresql/data
```

**Start / Stop:**

`npm run db:postgres:up` brings up the default (no-profile) compose services, which include **both Postgres and Redis**. Redis backs the grading result cache and rate limiting (see [Supporting Infrastructure](#supporting-infrastructure)).

```bash
# Start (Postgres + Redis)
npm run db:postgres:up

# Stop (keeps data volume)
npm run db:postgres:down

# Stop and delete data volume
docker compose -f docker/docker-compose.yml down -v
```

### Connecting via CLI

```bash
docker exec -it <container-name> psql -U skillspell -d skillspell
```

Find the container name with `docker ps`. Typically it's `docker-postgres-1`.

---

## Schema Migrations

Migrations are managed by **TypeORM** and stored in `packages/storage/postgres/src/migrations/`.

### Run Migrations

```bash
# From repo root
npm run db:postgres:migrate

# Or from the postgres package
cd packages/storage/postgres
npm run migration:run
```

### Revert Last Migration

```bash
cd packages/storage/postgres
npm run migration:revert
```

### Schema Overview

Running the migrations creates the full schema (24+ tables) covering multi-tenancy and users, authentication and SSO, skills and versions, evaluations, and the marketplace. The exact set of tables is defined by the migrations in `packages/storage/postgres/src/migrations/` and the TypeORM entities they map to — treat those as the source of truth rather than a fixed list here, since the schema evolves with each migration.

To inspect the live schema after migrating, list the tables directly:

```bash
docker exec -it docker-postgres-1 psql -U skillspell -d skillspell -c '\dt'
```

---

## Generating New Migrations

When you modify a TypeORM entity, generate a migration:

```bash
cd packages/storage/postgres

# Generate a migration from entity diff
npm run migration:generate -- src/migrations/DescriptiveName

# Review the generated file in src/migrations/
# Then apply it
npm run migration:run
```

> **Important:** Always review auto-generated migrations before running them. TypeORM diffs the entity metadata against the live database schema.

---

## pgAdmin (GUI)

A pgAdmin4 container is included but requires the `tools` profile:

```bash
# Start Postgres + pgAdmin
docker compose -f docker/docker-compose.yml --profile tools up -d
```

**Access:** [http://localhost:5050](http://localhost:5050)

| Setting | Value |
|---|---|
| Email | `admin@skillspell.dev` |
| Password | `changeme` |

> The pgAdmin login password defaults to `changeme` (`PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD:-changeme}` in the compose file). Override it by setting the `PGADMIN_PASSWORD` env var before starting the container.

### Connecting to the Database in pgAdmin

1. **Add New Server** → General tab: Name = `skillspell`
2. **Connection tab:**
   - Host: `postgres` (Docker service name, not `localhost`)
   - Port: `5432`
   - Database: `skillspell`
   - Username: `skillspell`
   - Password: `skillspell_dev`
3. Tables are at: **Servers → skillspell → Databases → skillspell → Schemas → public → Tables**

---

## Supporting Infrastructure

These env vars are required for a full deployment.

### Redis

Redis is required for the grading result cache and rate limiting.

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | *(empty — no auth)* | Redis password. Leave unset for local development. |

### Rate Limiting

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_SHORT_TTL` | `1000` | Short window size in milliseconds |
| `RATE_LIMIT_SHORT_LIMIT` | `10` | Max requests per short window |
| `RATE_LIMIT_LONG_TTL` | `3600000` | Long window size in milliseconds (1 hour) |
| `RATE_LIMIT_LONG_LIMIT` | `500` | Max requests per long window |

### OpenTelemetry (optional)

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(none)* | OTLP collector endpoint (e.g. `http://localhost:4318`) |
| `OTEL_SERVICE_NAME` | `skillspell-backend` | Service name reported to the collector |

For local development, run `npm run otel:up` to start the Aspire dashboard.

### SMTP Encryption

| Variable | Default | Description |
|---|---|---|
| `ENCRYPTION_KEY` | *(optional)* | 64 hex characters (256-bit AES-256-GCM key) for encrypting SMTP passwords at rest. Required only if SMTP is configured. Generate with: `openssl rand -hex 32` |

> **Note:** The key is `ENCRYPTION_KEY`, not `SMTP_ENCRYPTION_KEY`. The env.example comment is misleading — the Zod schema requires the name `ENCRYPTION_KEY`.

### Skills / Agent Subprocess

| Variable | Default | Description |
|---|---|---|
| `SKILLS_WORKSPACE_DIR` | *(none)* | Permanent workspace directory containing `.claude/skills/`. Avoids copying skills on every startup. |
| `AGENT_ENV_ALLOWLIST` | `PATH,HOME,USER,SHELL,LANG,LC_ALL,NODE_ENV,CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | Comma-separated env vars forwarded to the Claude Code subprocess. |

### Debug

| Variable | Default | Description |
|---|---|---|
| `DEBUG_DUMP_PROMPTS` | `false` | Set to `true` in non-production to dump AI prompts to `debug-prompts/` for inspection. Has no effect when `NODE_ENV=production`. |

---

## Troubleshooting

### Backend fails with "POSTGRES_PASSWORD is required"

Set `POSTGRES_PASSWORD=skillspell_dev` in `packages/backend/.env`.

### "Connection refused" on port 5432

The Postgres container isn't running. Start it:

```bash
npm run db:postgres:up
```

### "relation does not exist" errors at runtime

Migrations haven't been applied. Run:

```bash
npm run db:postgres:migrate
```

### TypeORM CLI errors ("Cannot find module")

The postgres package uses `typeorm-ts-node-commonjs` binary. Make sure you run commands via npm scripts, not directly:

```bash
# ✅ Correct
cd packages/storage/postgres
npm run migration:run

# ❌ Wrong — don't call typeorm CLI directly
npx typeorm migration:run -d src/data-source.ts
```

### pgAdmin shows no tables

- Make sure you connected to the `skillspell` database (not `postgres`)
- Use hostname `postgres` (not `localhost`) when pgAdmin runs in Docker
- Navigate to: **Schemas → public → Tables**
- Right-click **Tables** → **Refresh**
