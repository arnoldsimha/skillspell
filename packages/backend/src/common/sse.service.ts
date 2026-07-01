import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Subject } from 'rxjs';

/**
 * Holds the SSE connection state returned by {@link SseService.setup}.
 *
 * - `subject`  — push `MessageEvent`s here; they are written as `data:` lines.
 * - `signal`   — fires when the client disconnects (abort detection).
 * - `cleanup`  — call when done to unsubscribe and end the response.
 */
export interface SseConnection {
  /** RxJS Subject — push SSE events via `.next()`, end the stream via `.complete()`. */
  subject: Subject<MessageEvent>;
  /** AbortController — use `.signal` to check abort state, or pass the full controller to services. */
  ac: AbortController;
  /** Unsubscribe the Subject and end the HTTP response. */
  cleanup: () => void;
}

/**
 * Reusable service for Server-Sent Events (SSE) over POST endpoints.
 *
 * Handles:
 * - Setting SSE response headers (Content-Type, Cache-Control, Connection, X-Accel-Buffering)
 * - Client disconnect detection via `res.on('close')` (reliable) + `req.on('close')` (fallback)
 * - Piping an RxJS Subject to the response as `data:` lines
 * - Sending `[DONE]` on stream completion
 * - Cleanup (unsubscribe + end response)
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  /**
   * Set up an SSE connection on the given request/response pair.
   *
   * @param req - Express Request
   * @param res - Express Response
   * @returns An {@link SseConnection} with subject, signal, and cleanup.
   *
   * @example
   * ```ts
   * const { subject, signal, cleanup } = this.sseService.setup(req, res);
   * try {
   *   await this.myService.doWork(subject, signal);
   * } finally {
   *   cleanup();
   * }
   * ```
   */
  setup(req: Request, res: Response): SseConnection {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Abort detection
    const ac = new AbortController();

    const onDisconnect = () => {
      if (!ac.signal.aborted) {
        this.logger.log('⚠️ SSE client disconnected');
        ac.abort();
      }
    };

    // res.on('close') is the reliable event for detecting client abort in
    // Node.js/Express SSE streams. req.on('close') alone does NOT fire
    // when the browser aborts a fetch() via AbortController.
    req.on('close', onDisconnect);
    res.on('close', onDisconnect);

    // Subject → response piping
    const subject = new Subject<MessageEvent>();
    const subscription = subject.subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
      },
      complete: () => {
        res.write('data: [DONE]\n\n');
        if (!res.writableEnded) res.end();
      },
    });

    const cleanup = () => {
      subscription.unsubscribe();
      if (!res.writableEnded) res.end();
    };

    return { subject, ac, cleanup };
  }
}

/**
 * Create an AbortController that fires when the HTTP client disconnects.
 *
 * For **non-SSE** endpoints where you want to abort in-progress work
 * (e.g. LLM calls) when the client navigates away or cancels the fetch.
 *
 * Pass `res` (via `@Res({ passthrough: true })`) for reliable abort detection
 * through reverse proxies. `req.on('close')` alone may not fire through
 * proxies like portless; `res.on('close')` is more reliable.
 *
 * For SSE streaming endpoints, use {@link SseService.setup} instead.
 */
export function onClientDisconnect(req: Request, res?: Response): AbortController {
  const ac = new AbortController();
  const onClose = () => {
    if (!ac.signal.aborted) {
      ac.abort();
    }
  };
  req.on('close', onClose);
  res?.on('close', onClose);
  return ac;
}
