import { Logger } from '@nestjs/common';

const logger = new Logger('RateLimitRetry');

/**
 * Returns true for 429 / quota-exhausted errors.
 *
 * Detects rate-limit errors from Azure AI Foundry (and any other provider)
 * via HTTP status, error code, and message pattern — without relying on
 * Anthropic SDK error class instances, since Azure wraps errors in its own shape.
 *
 * Handled variants:
 *   {"error":{"code":"RateLimitReached","message":"Rate limit exceeded..."}}
 *   HTTP 429 with status property on the error object
 */
export function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.includes('RateLimitReached') || err.message.includes('Rate limit')) return true;
    const e = err as unknown as Record<string, unknown>;
    if (e['status'] === 429) return true;
    if (e['code'] === 'RateLimitReached') return true;
  }
  return false;
}

/**
 * Sleep that respects an AbortSignal — rejects immediately if the signal fires.
 */
export function rateLimitSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Request cancelled by client')); return; }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Request cancelled by client'));
    };
    // Remove the abort listener on the normal (resolve) path too, so a long-lived
    // signal reused across many retries doesn't accumulate listeners.
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wraps an async call with exponential-backoff retry for rate-limit errors.
 *
 * The Anthropic SDK's built-in maxRetries handles standard 429s, but some
 * quota errors (e.g. "Requested tokens: 0") arrive as non-retryable variants.
 * This wrapper adds an outer layer that catches any rate-limit-shaped error
 * and retries with jitter.
 *
 * @param fn         Factory that produces the promise to retry (called fresh each attempt).
 * @param signal     Optional AbortSignal — cancels the retry loop and sleep.
 * @param context    Label used in log messages.
 * @param maxAttempts Total attempts including the first (default 4).
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal | undefined,
  context: string,
  maxAttempts = 4,
): Promise<T> {
  const BASE_DELAY_MS = 2_000;
  const MAX_DELAY_MS = 60_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxAttempts;

      if (!isRateLimitError(err) || isLast || signal?.aborted) throw err;

      const base = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      const waitMs = Math.round(base + base * 0.2 * (Math.random() - 0.5));

      logger.warn(
        `⚠️ Rate limit hit during ${context} (attempt ${attempt}/${maxAttempts}) — ` +
          `retrying in ${waitMs}ms`,
      );

      await rateLimitSleep(waitMs, signal);
    }
  }
  throw new Error('withRateLimitRetry: exceeded attempts without throwing');
}

/**
 * Races a promise against a timeout. On timeout, aborts the optional controller
 * (cancelling the in-flight request) and rejects with a labelled error.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  abortController?: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abortController?.abort();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}
