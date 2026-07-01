// ── OpenTelemetry MUST be imported before any other module ──
// The OTEL SDK patches Node.js internals (http, pg, etc.) at import time.
// If NestJS or dotenv loads first, those modules won't be instrumented.
import './telemetry/tracing.js';

import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env early so NODE_TLS_REJECT_UNAUTHORIZED is set before any TLS connections.
// In compiled mode __dirname = dist/src/, so go up two levels to reach the package root.
config({ path: resolve(__dirname, '..', '..', '.env') });

// Guard: NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate verification.
// Only allow this in non-production environments; log a warning when active.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  if (process.env.NODE_ENV === 'production') {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    console.error(
      '⚠️  NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden in production — removed.',
    );
  } else {
    console.warn(
      '⚠️  NODE_TLS_REJECT_UNAUTHORIZED=0 — TLS certificate verification is DISABLED.',
    );
  }
}

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { StreamingAdapter } from './streaming/streaming.adapter.js';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { httpsRedirectMiddleware } from './common/middleware/https-redirect.middleware.js';
import { createAppLogger } from './common/logger/logger.factory.js';

async function bootstrap() {
  // Register HTTPS redirect before NestJS initializes so it runs ahead of
  // ServeStaticModule's express.static middleware (which is added during AppModule init).
  const server = express();
  if (process.env.NODE_ENV === 'production') {
    server.use(httpsRedirectMiddleware);
  }

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    {
      logger: createAppLogger(),
    },
  );
  const logger = new Logger('Bootstrap');

  // Wire the Socket.IO Redis adapter (rooms/broadcasts span all pods) before
  // attaching it — required for multi-instance (k8s) deployments.
  const streamingAdapter = new StreamingAdapter(app);
  await streamingAdapter.connectToRedis();
  app.useWebSocketAdapter(streamingAdapter);

  // Enable NestJS graceful shutdown hooks — listens for SIGTERM, SIGINT
  // and calls onModuleDestroy() / onApplicationShutdown() on all providers.
  // This ensures in-flight requests complete and DB connections are returned to the pool
  // before the process exits (critical for Kubernetes rolling deployments).
  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  // ── Security headers ──
  // Sets X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options, etc.
  // CSP is relaxed for the SPA — tighten as needed for your deployment.
  app.use(helmet({
    contentSecurityPolicy: false, // SPA manages its own CSP via meta tags
  }));

  // ── Cookie parsing ──
  // Required for reading httpOnly refresh token cookies on /api/auth/* routes.
  app.use(cookieParser());

  // ── Security: explicit request body size limits ──
  // Prevents denial-of-service via oversized payloads.
  // 2 MB covers skill content + scripts/references; increase if needed.
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // ── CORS ──
  // In production the frontend is served from the same origin (via
  // ServeStaticModule), so CORS is unnecessary. Enable it only in
  // development where Vite runs on a different port.
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({
      origin: true,
      credentials: true,
    });
    logger.log('CORS enabled for all origins (development mode)');
  }

  // AllExceptionsFilter is registered via APP_FILTER in AppModule (DI-friendly).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Swagger / OpenAPI Explorer (development + staging only) ──
  // Available at /api/docs — disabled in production via NODE_ENV check.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SkillSpell API')
      .setDescription('SkillSpell backend REST API — skill generation, evaluation, and management')
      .setVersion('0.0.9')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger UI available at /api/docs');
  }

  // Use || instead of ?? so empty string PORT="" falls back to default.
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  const portlessUrl = process.env.PORTLESS_URL;
  logger.log(
    portlessUrl
      ? `Application listening on ${portlessUrl} (port ${port})`
      : `Application listening on http://localhost:${port}`,
  );
}
bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
