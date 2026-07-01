import { z } from 'zod';
import { createStrandsConfig } from './strands.config.js';

/**
 * Zod schema for validating required environment variables.
 * Used by ConfigModule.forRoot({ validate }).
 *
 * Every environment variable the app reads should be declared here so that
 * the factory function below never touches raw `process.env` directly —
 * eliminating the Zod ↔ factory disconnect.
 */
export const envSchema = z.object({
  // PostgreSQL
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().default('skillspell'),
  POSTGRES_USER: z.string().default('skillspell'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),
  POSTGRES_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  POSTGRES_POOL_SIZE: z.coerce.number().int().positive().default(25),  // 10 was too small for concurrent eval batches
  POSTGRES_SYNCHRONIZE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true')
    .refine(
      (val) => !val || process.env.NODE_ENV !== 'production',
      'POSTGRES_SYNCHRONIZE=true is forbidden in production — use migrations instead',
    ),

  // AI Provider
  AI_API_BASE_URL: z.url({ message: 'AI_API_BASE_URL must be a valid URL' }).optional(),
  AI_API_KEY: z
    .string()
    .min(1, 'AI_API_KEY is required'),
  AI_MODEL: z
    .string()
    .min(1, 'AI_MODEL is required'),
  AI_MODEL_LIGHT: z.string().optional(),

  // JWT
  JWT_SECRET: z.string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine(
      // Reject the shipped .env.example placeholders so the app fails closed if
      // a developer copies an example and forgets to generate a real secret.
      (val) => !/change.?me|your-jwt-secret/i.test(val),
      'JWT_SECRET is still set to an example placeholder. Generate a random secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))".',
    ),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

  // Password policy
  PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(8),
  PASSWORD_BCRYPT_ROUNDS: z.coerce.number().int().positive().default(12),

  // Account lockout
  ACCOUNT_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  ACCOUNT_LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().default(15),

  // App public URL — used to construct verification links, SAML metadata, etc.
  APP_PUBLIC_URL: z.url({ message: 'APP_PUBLIC_URL must be a valid URL' }).optional(),

  // Session
  SESSION_MAX_MESSAGES: z.coerce.number().int().positive().default(20),
  SESSION_MAX_HISTORY_TOKENS: z.coerce.number().int().positive().default(2000),

  // AI timeouts
  AI_GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  AI_LIGHT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),

  // Prompts
  /** Absolute path to shared/prompts/ — overrides cwd-relative resolution for deployment flexibility. */
  PROMPTS_DIR: z.string().optional(),

  // Skills
  SKILLS_PROJECT_DIR: z.string().default(''),
  /** Permanent directory containing the skills workspace for the agent cwd. Eliminates copy-on-startup. */
  SKILLS_WORKSPACE_DIR: z.string().default(''),

  // Agent subprocess
  AGENT_ENV_ALLOWLIST: z.string().optional(),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // SMTP encryption
  ENCRYPTION_KEY: z.string()
    .length(64, 'ENCRYPTION_KEY must be 64 hex characters (256-bit key)')
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be a hex string')
    .optional(),

  // OpenTelemetry
  /** Master toggle — set to 'true' to enable OTEL. Requires OTEL_EXPORTER_OTLP_ENDPOINT. */
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
  /** OTLP endpoint URL (e.g. http://localhost:18890 for Aspire). */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** Service name reported in traces/metrics/logs. Default: skillspell-backend */
  OTEL_SERVICE_NAME: z.string().optional(),

  // Rate limiting (per IP, applied globally)
  RATE_LIMIT_SHORT_TTL: z.coerce.number().int().positive().default(1000),    // ms
  RATE_LIMIT_SHORT_LIMIT: z.coerce.number().int().positive().default(20),    // requests per window
  RATE_LIMIT_MEDIUM_TTL: z.coerce.number().int().positive().default(60000),  // ms
  RATE_LIMIT_MEDIUM_LIMIT: z.coerce.number().int().positive().default(200),  // requests per window
  RATE_LIMIT_LONG_TTL: z.coerce.number().int().positive().default(3600000),  // ms
  RATE_LIMIT_LONG_LIMIT: z.coerce.number().int().positive().default(500),    // requests per window

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  /** Empty string = no auth. ioredis skips AUTH when password is falsy. */
  REDIS_PASSWORD: z.string().default(''),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  PORTLESS_URL: z.string().optional(),

  // Debug: dump full prompts to disk before sending to the LLM provider (dev only)
  DEBUG_DUMP_PROMPTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate environment variables against the Zod schema.
 * Throws a descriptive error on validation failure.
 *
 * Returns the validated (and defaulted) config object so that the
 * factory function can consume it without re-reading `process.env`.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed:\n${formatted}`,
    );
  }

  return { ...config, ...result.data };
}

/**
 * Configuration factory — single source of truth for config shape.
 *
 * **All defaults live in the Zod schema above** (lines 11-108).
 * NestJS ConfigModule calls `validate` (→ `validateEnv`) first, which parses
 * and defaults every field via Zod, then merges the result back into
 * `process.env`. By the time this factory runs, `process.env` is guaranteed
 * to contain every declared variable with its Zod-defaulted value.
 *
 * Therefore: NO `|| fallback` expressions here. If you need a new default,
 * add it to the Zod schema — never duplicate it in the factory.
 */
const configFactory = () => ({
  postgres: {
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB!,
    username: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    ssl: process.env.POSTGRES_SSL === 'true',
    poolSize: Number(process.env.POSTGRES_POOL_SIZE),
    /** NEVER set to true in production — auto-syncs schema from entities. */
    synchronize: process.env.POSTGRES_SYNCHRONIZE === 'true',
  },
  auth: {
    /** JWT secret for signing access and refresh tokens. */
    jwtSecret: process.env.JWT_SECRET!,
    /** Access token expiry (e.g. '15m', '1h'). */
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY!,
    /** Refresh token expiry (e.g. '7d', '30d'). */
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY!,
    /** Minimum password length. */
    passwordMinLength: Number(process.env.PASSWORD_MIN_LENGTH),
    /** bcrypt cost factor. */
    bcryptRounds: Number(process.env.PASSWORD_BCRYPT_ROUNDS),
    /** Number of failed login attempts before lockout. */
    lockoutThreshold: Number(process.env.ACCOUNT_LOCKOUT_THRESHOLD),
    /** Lockout duration in minutes. */
    lockoutDurationMinutes: Number(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES),
  },
  app: {
    /** Public URL of the application (for verification links, SAML metadata). */
    publicUrl: process.env.APP_PUBLIC_URL ?? '',
    /** Whether the app is running in production mode. */
    isProduction: process.env.NODE_ENV === 'production',
  },
  session: {
    /** Max messages per skill session (rolling window). */
    maxMessages: Number(process.env.SESSION_MAX_MESSAGES),
    /** Max estimated tokens for compressed history in refinement prompts. */
    maxHistoryTokens: Number(process.env.SESSION_MAX_HISTORY_TOKENS),
  },
  ai: {
    /** Base URL for the AI API endpoint. */
    apiBaseUrl: process.env.AI_API_BASE_URL ?? '',
    /** API key for the AI provider. */
    apiKey: process.env.AI_API_KEY!,
    /** Primary model / deployment name. */
    model: process.env.AI_MODEL!,
    /** Optional faster/lighter model for suggestions (e.g. claude-haiku). Falls back to main model. */
    modelLight: process.env.AI_MODEL_LIGHT,
    /** Timeout in ms for generation/refinement calls (agent + Messages API paths). */
    generationTimeoutMs: Number(process.env.AI_GENERATION_TIMEOUT_MS),
    /** Timeout in ms for lightweight calls (suggestions, diagrams, grading). */
    lightTimeoutMs: Number(process.env.AI_LIGHT_TIMEOUT_MS),
    /** Max automatic retries for transient API errors. Passed to the Anthropic SDK + agent wrapper. */
    maxRetries: process.env.AI_MAX_RETRIES !== undefined ? Number(process.env.AI_MAX_RETRIES) : 2,
  },
  skills: {
    /** Root directory where .claude/skills/ lives. Falls back to monorepo root via cwd heuristic. */
    projectDir: process.env.SKILLS_PROJECT_DIR!,
    /** Permanent directory containing the skills workspace for the agent cwd. If set, avoids copy-on-startup. */
    workspaceDir: process.env.SKILLS_WORKSPACE_DIR!,
  },
  agent: {
    /**
     * Environment variables forwarded to the agent subprocess.
     * Only these keys are passed — everything else is stripped to avoid
     * leaking secrets (DB creds, internal tokens, etc.).
     * Override via AGENT_ENV_ALLOWLIST (comma-separated).
     */
    envAllowlist: (
      process.env.AGENT_ENV_ALLOWLIST ??
      'PATH,HOME,USER,SHELL,LANG,LC_ALL,NODE_ENV,CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS'
    ).split(',').map((s) => s.trim()).filter(Boolean),
  },
  smtp: {
    /** 256-bit hex key for AES-256-GCM encryption of SMTP passwords at rest. */
    encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  },
  rateLimit: {
    short: {
      ttl: Number(process.env.RATE_LIMIT_SHORT_TTL),
      limit: Number(process.env.RATE_LIMIT_SHORT_LIMIT),
    },
    medium: {
      ttl: Number(process.env.RATE_LIMIT_MEDIUM_TTL),
      limit: Number(process.env.RATE_LIMIT_MEDIUM_LIMIT),
    },
    long: {
      ttl: Number(process.env.RATE_LIMIT_LONG_TTL),
      limit: Number(process.env.RATE_LIMIT_LONG_LIMIT),
    },
  },
  redis: {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT),
    /** Empty string = no auth (ioredis skips AUTH when password is falsy). */
    password: process.env.REDIS_PASSWORD!,
  },
  debug: {
    /**
     * When true AND NODE_ENV !== 'production', dump full system + user prompts
     * to `debug-prompts/` before sending them to the LLM provider.
     * Each dump gets a unique ID that is also printed in the existing logs.
     */
    dumpPrompts: process.env.DEBUG_DUMP_PROMPTS === 'true' && process.env.NODE_ENV !== 'production',
  },
  strands: createStrandsConfig(),
});

export default configFactory;

/**
 * Strongly-typed configuration shape derived from the factory return type.
 *
 * Usage in services:
 * ```typescript
 * import type { AppConfig } from '../config/configuration.js';
 * constructor(private readonly config: ConfigService<AppConfig, true>) {}
 * // Then: this.config.get('ai.model', { infer: true })
 * ```
 *
 * The `true` second generic enables strict mode — `.get()` only accepts
 * valid dot-paths and returns the correct type. A typo becomes a compile error.
 */
export type AppConfig = ReturnType<typeof configFactory>;
