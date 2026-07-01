/**
 * Lightweight SSE client built on `fetch-event-stream`.
 *
 * Uses native `fetch` for the HTTP request and `fetch-event-stream` to parse
 * the SSE stream.  `AbortController.abort()` on the signal closes both the
 * fetch request AND the stream iterator, which should trigger `req.on('close')`
 * on the backend.
 *
 * Falls back to a dedicated cancel endpoint for environments where a reverse
 * proxy (e.g. portless) keeps the backend connection alive after client abort.
 */

import { events } from 'fetch-event-stream';
import { authSDK } from '../services/auth-sdk.js';
import { MAX_429_RETRIES, get429Delay, sleep } from './retryUtils.js';

export interface FetchSseOptions {
  /** Full URL to POST to. */
  url: string;
  /** HTTP method (defaults to POST). */
  method?: string;
  /** Request headers. */
  headers?: Record<string, string>;
  /** JSON-serializable request body. */
  body?: unknown;
  /** AbortSignal for cancellation — calling abort() closes the connection. */
  signal?: AbortSignal;
  /** Called for each SSE `data:` line (excluding the final `[DONE]`). */
  onMessage: (data: string) => void;
  /** Called when the stream ends normally. */
  onClose?: () => void;
  /** Called on error (network failure, non-ok response, etc.). */
  onError?: (error: Error) => void;
}

/**
 * Open an SSE connection using native `fetch` and read the response
 * body via `fetch-event-stream`. Returns a promise that resolves when
 * the stream ends or rejects on error.
 */
export async function fetchSse(opts: FetchSseOptions): Promise<void> {
  const { url, method = 'POST', headers, body, signal, onMessage, onClose, onError } = opts;

  const fetchOpts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    // WR-04: match client.ts — send httpOnly cookies (refresh token) on SSE requests too
    credentials: 'include',
    signal,
  };

  // CR-03: wrap the initial fetch + 429 retry loop so AbortError and network
  // errors before a response arrives are handled consistently.
  let response: Response;
  try {
    response = await fetch(url, fetchOpts);

    // On 429, back off and retry before opening the stream
    for (let attempt = 0; response.status === 429 && attempt < MAX_429_RETRIES; attempt++) {
      await sleep(get429Delay(response, attempt));
      response = await fetch(url, fetchOpts);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return; // signal was already aborted before the request — not an error
    }
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
    throw error;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`SSE request failed: ${response.status} ${text}`);
    onError?.(err);
    throw err;
  }

  try {
    const stream = events(response, signal);

    for await (const event of stream) {
      const data = event.data;
      if (!data || data === '[DONE]') continue;
      onMessage(data);
    }

    onClose?.();
  } catch (err) {
    // AbortError is expected when cancel is called — ensure the body stream
    // is fully released so the proxy connection doesn't leak.
    if (err instanceof DOMException && err.name === 'AbortError') {
      response.body?.cancel().catch(() => {});
      return;
    }
    // For any other error, also release the body stream
    response.body?.cancel().catch(() => {});
    const error = err instanceof Error ? err : new Error(String(err));
    onError?.(error);
    throw error;
  }
}

/**
 * Authenticated SSE helper — acquires a Bearer token from authSDK
 * and injects it into the request headers before calling `fetchSse`.
 *
 * Use this instead of calling `fetchSse` directly when the endpoint
 * requires authentication.
 */
export async function authenticatedSse(
  opts: Omit<FetchSseOptions, 'headers'> & { headers?: Record<string, string> },
): Promise<void> {
  // WR-02: mirror the token-refresh guard from request() in client.ts —
  // force a refresh when we appear authenticated but have no token yet.
  let token = await authSDK.getAccessToken();
  if (!token && authSDK.isAuthenticated()) {
    token = await authSDK.getAccessToken(true);
  }
  return fetchSse({
    ...opts,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
}
