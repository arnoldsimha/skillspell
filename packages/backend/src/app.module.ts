import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { CacheModule } from '@nestjs/cache-manager';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { OpenTelemetryModule } from 'nestjs-otel';
import { ClsModule, ClsGuard } from 'nestjs-cls';
import { otelSdk } from './telemetry/tracing.js';
import { OtelShutdownService } from './telemetry/otel-shutdown.service.js';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { PostgresStorageModule } from '@skillspell/storage-postgres';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController, RedisHealthIndicator } from './health/health.controller.js';
import { LifecycleService } from './common/lifecycle.service.js';
import { SkillsModule } from './skills/skills.module.js';
import { PublicModule } from './public/public.module.js';
import { GenerationModule } from './generation/generation.module.js';
import { ExportModule } from './export/export.module.js';
import { EvalModule } from './eval/eval.module.js';
import { SharingModule } from './sharing/sharing.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { SetupGuard } from './auth/guards/setup.guard.js';
import { OrganizationContextGuard } from './auth/guards/organization-context.guard.js';
import { SkillOwnerGuard } from './ownership/guards/skill-owner.guard.js';
import { OwnershipModule } from './ownership/ownership.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { StreamingModule } from './streaming/streaming.module.js';
import { MarketplaceModule } from './marketplace/marketplace.module.js';
import { CategoryModule } from './category/category.module.js';
import { AdminAnalyticsModule } from './analytics/admin-analytics.module.js';
import { RequestContextModule } from './common/context/request-context.module.js';
import configuration, { validateEnv, type AppConfig } from './config/configuration.js';

// In compiled mode __dirname = dist/src/, so go up one level to reach dist/,
// which is inside the backend package. The .env file sits at the package root
// (packages/backend/.env) — one level above dist/.
const backendRoot = resolve(__dirname, '..');

// In production, the Vite-built frontend is copied into dist/public/.
// In development, this directory won't exist — ServeStaticModule is
// conditionally imported only when the directory is present.
const frontendDistPath = join(__dirname, '..', 'public');
const serveStaticImports = existsSync(frontendDistPath)
  ? [
      ServeStaticModule.forRoot({
        rootPath: frontendDistPath,
        exclude: ['/api{*path}'],
      }),
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(backendRoot, '.env'), // packages/backend/.env
        resolve(process.cwd(), '.env'), // <repo-root>/.env (fallback)
      ],
      load: [configuration],
      validate: validateEnv,
    }),
    // AsyncLocalStorage-based request context (nestjs-cls).
    // Middleware creates the ALS context; guard populates it after JWT auth.
    // guard.mount = false so we register ClsGuard manually for ordering control.
    // @see https://docs.nestjs.com/recipes/async-local-storage
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      guard: {
        mount: false,
        setup: (cls, context) => {
          const request = context.switchToHttp().getRequest();
          if (request.user) {
            cls.set('userId', request.user.id);
            cls.set('user', request.user);
            cls.set('userRole', request.user.role);
          }
        },
      },
    }),
    // Security: global rate limiting to prevent brute-force and abuse.
    // Routes can override with @Throttle() or skip with @SkipThrottle().
    // Tune via RATE_LIMIT_SHORT_* and RATE_LIMIT_LONG_* env vars.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const host = config.get('redis.host', { infer: true });
        const port = config.get('redis.port', { infer: true });
        const password = config.get('redis.password', { infer: true });
        const url = password
          ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
          : `redis://${host}:${port}`;
        return {
          throttlers: [
            { name: 'short', ttl: config.get('rateLimit.short.ttl', { infer: true }), limit: config.get('rateLimit.short.limit', { infer: true }) },
            { name: 'medium', ttl: config.get('rateLimit.medium.ttl', { infer: true }), limit: config.get('rateLimit.medium.limit', { infer: true }) },
            { name: 'long', ttl: config.get('rateLimit.long.ttl', { infer: true }), limit: config.get('rateLimit.long.limit', { infer: true }) },
          ],
          storage: new ThrottlerStorageRedisService(url),
        };
      },
    }),
    // Redis cache — global, isGlobal: true so all modules can inject CACHE_MANAGER.
    // Default TTL: 1 hour — applies when set() is called without an explicit TTL.
    // Call sites that need a different TTL pass it as the third arg to set().
    // Uses @keyv/redis (Keyv v2 API) — cache-manager-ioredis-yet was deprecated.
    // password absent / empty → omit from URL so Redis skips AUTH in no-auth envs.
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const host = config.get('redis.host', { infer: true });
        const port = config.get('redis.port', { infer: true });
        const password = config.get('redis.password', { infer: true });
        const url = password
          ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
          : `redis://${host}:${port}`;
        return {
          stores: [new Keyv({ store: new KeyvRedis(url), ttl: 3_600_000 })],
        };
      },
    }),
    // OpenTelemetry NestJS integration — only registered when OTEL is active.
    // When OTEL_EXPORTER_OTLP_ENDPOINT is unset, the SDK doesn't start in tracing.ts,
    // and we skip this module entirely to avoid wasted CPU on host-metrics polling.
    ...(otelSdk
      ? [
          OpenTelemetryModule.forRoot({
            metrics: {
              hostMetrics: true, // CPU, memory, event loop metrics via @opentelemetry/host-metrics
            },
          }),
        ]
      : []),
    ...serveStaticImports,
    RequestContextModule,
    OwnershipModule,
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
    AuthModule,
    UsersModule,
    OrganizationModule,
    SkillsModule,
    PublicModule,
    GenerationModule,
    ExportModule,
    EvalModule,
    SharingModule,
    StreamingModule,
    TerminusModule,
    MarketplaceModule,
    CategoryModule,
    AdminAnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    // Tracks SIGTERM so the readiness probe can drain (see /api/ready).
    LifecycleService,
    // Flush OTEL buffered data during NestJS shutdown (no-op when OTEL is disabled).
    OtelShutdownService,
    // Register AllExceptionsFilter via DI so it can inject other services.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Log every HTTP request (method, URL, status, duration).
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Global guards — applied to all routes. ORDER MATTERS:
    // 0. ThrottlerGuard           — rate limiting (before auth to block brute-force)
    // 1. SetupGuard               — blocks everything if first-run setup not complete
    // 2. JwtAuthGuard             — requires valid JWT (unless @Public())
    // 3. ClsGuard                 — stores request.user in CLS (must run AFTER JwtAuthGuard)
    // 4. OrganizationContextGuard — fetches and stores org in CLS (must run AFTER ClsGuard)
    // 5. SkillOwnerGuard          — checks @CheckOwnership() decorator, stores skill in CLS
    // 6. RolesGuard               — checks @Roles() decorator
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: SetupGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ClsGuard },
    { provide: APP_GUARD, useClass: OrganizationContextGuard },
    { provide: APP_GUARD, useClass: SkillOwnerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
