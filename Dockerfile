# ─────────────────────────────────────────────────────────────────────────────
# SkillSpell — Multi-stage Docker build
# Produces a single image: NestJS serves API + React SPA on port 3000
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy workspace root manifests
COPY package.json package-lock.json ./

# Copy package manifests for each workspace package
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/postgres/package.json packages/storage/postgres/package.json

# Install all dependencies (including devDependencies for building)
RUN npm ci

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy root tsconfig (extended by backend/frontend tsconfigs)
COPY tsconfig.base.json ./

# Copy all source code
COPY packages/shared/ packages/shared/
COPY packages/storage/postgres/ packages/storage/postgres/
COPY packages/frontend/ packages/frontend/
COPY packages/backend/ packages/backend/

# Copy skills workspace directory (permanent .claude/skills/ for Agent SDK)
COPY skills-workspace/ skills-workspace/

# Build shared + storage packages first (frontend depends on @skillspell/shared)
RUN npm run storage:build

# Build frontend (Vite)
RUN npm run frontend:build

# Build backend (NestJS)
RUN npm run build -w packages/backend

# Copy frontend dist into backend's public directory for static serving
RUN cp -r packages/frontend/dist packages/backend/dist/public

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S skillspell && \
    adduser -S skillspell -u 1001 -G skillspell

WORKDIR /app

# Copy workspace root manifests for production install
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/postgres/package.json packages/storage/postgres/package.json
# Frontend package.json is needed for workspace resolution even though
# we don't install its deps at runtime.
COPY packages/frontend/package.json packages/frontend/package.json

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built backend (includes public/ with frontend dist)
COPY --from=builder /app/packages/backend/dist packages/backend/dist

# Copy shared package (prompts + types used at runtime)
COPY --from=builder /app/packages/shared packages/shared

# Copy storage package (compiled dist/ used at runtime)
COPY --from=builder /app/packages/storage/postgres packages/storage/postgres

# Copy skills workspace directory (permanent .claude/skills/ for Agent SDK).
# The Claude Agent SDK discovers skills via settingSources: ['project']
# relative to SKILLS_WORKSPACE_DIR (cwd). With SKILLS_WORKSPACE_DIR=/app/skills-workspace,
# the SDK expects skills at /app/skills-workspace/.claude/skills/.
COPY --from=builder /app/skills-workspace skills-workspace

# Switch to non-root user
USER skillspell

# Environment defaults
ENV PORT=3000 \
    HOME=/home/skillspell \
    PROMPTS_DIR=/app/packages/shared/prompts \
    SKILLS_PROJECT_DIR=/app \
    SKILLS_WORKSPACE_DIR=/app/skills-workspace

EXPOSE 3000

# Health check using the existing /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application from packages/backend/ so monorepo-relative
# paths resolve correctly. PROMPTS_DIR above makes prompt loading
# independent of cwd, but other relative paths may still depend on this.
WORKDIR /app/packages/backend
CMD ["node", "dist/src/main.js"]
