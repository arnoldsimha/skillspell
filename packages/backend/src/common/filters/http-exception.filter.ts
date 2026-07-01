import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';

/**
 * Global exception filter that catches all exceptions and returns
 * a consistent JSON error response shape.
 *
 * Marked @Injectable() so it can participate in NestJS DI (e.g. for
 * injecting services like a metrics reporter in the future).
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Guard: only handle HTTP contexts (covers both HTTP and HTTPS — NestJS
    // uses 'http' for both). If this filter is accidentally registered in a
    // WebSocket ('ws') or microservice ('rpc') module, fall through gracefully.
    if (host.getType() !== 'http') {
      this.logger.warn(
        `AllExceptionsFilter received non-HTTP context (${host.getType()}); skipping.`,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, unknown>;
        message = Array.isArray(obj.message)
          ? obj.message.join('; ')
          : String(obj.message ?? exception.message);
        error = String(obj.error ?? error);
        if (typeof obj.errorCode === 'string') {
          errorCode = obj.errorCode;
        }
      }
    } else if (exception instanceof Error) {
      // Log the actual error message server-side but don't expose to client
      // to prevent leaking internal details (DB strings, file paths, etc.)
      this.logger.error(`Unhandled error: ${exception.message}`);
      message = 'Internal server error';
    }

    // Log server errors
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${statusCode}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${statusCode}: ${message}`,
      );
    }

    // Strip query parameters from the logged path to avoid logging sensitive data.
    const safePath = request.url.split('?')[0];

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      ...(errorCode !== undefined && { errorCode }),
      timestamp: new Date().toISOString(),
      path: safePath,
    });
  }
}
