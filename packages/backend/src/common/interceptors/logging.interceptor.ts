import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

/**
 * Global logging interceptor — logs every HTTP request with
 * method, URL, status code, and response time at `debug` level.
 *
 * Using `debug` instead of `log` keeps per-request lines visible during
 * development (NestJS default log level includes debug) while allowing
 * production deployments to suppress them by setting a higher log level
 * (e.g., `LOG_LEVEL=log` or `LOG_LEVEL=warn`).
 *
 * Errors are always logged at `warn` level regardless of configuration.
 *
 * Registered via APP_INTERCEPTOR in AppModule so it captures
 * both successful and failed responses (the exception filter
 * handles error-specific logging separately).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;

    const SILENT_PATHS = ['/api/health'];
    if (SILENT_PATHS.some((path) => url.startsWith(path))) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const duration = Date.now() - start;
          this.logger.debug(`${method} ${url} ${res.statusCode} ${duration}ms`);
        },
        error: () => {
          // Errors are logged by AllExceptionsFilter — just record the timing
          const duration = Date.now() - start;
          this.logger.warn(`${method} ${url} ERR ${duration}ms`);
        },
      }),
    );
  }
}
