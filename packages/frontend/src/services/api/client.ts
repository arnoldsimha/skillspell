import { authSDK } from '../auth-sdk.js';
import { MAX_429_RETRIES, get429Delay, sleep } from '../../utils/retryUtils.js';

/**
 * API base URL. In dev mode, Vite injects the full backend URL
 * (e.g. "http://api.skillspell.localhost:1355/api").
 * In production, this resolves to "/api" (same-origin).
 */
export const API_BASE = `${__BACKEND_URL__}/api`;

/** Error class with additional status code information. */
export class ApiError extends Error {
  readonly statusCode: number;
  /** Backend-defined error code (e.g. 'SETUP_REQUIRED'). */
  readonly errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

// SETUP_REQUIRED_ERROR is defined in auth-sdk.ts — import from there if needed.

/**
 * Build headers with an optional Authorization bearer token.
 */
function buildHeaders(
  token: string | null,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}


/**
 * Execute a fetch call and handle network errors.
 */
async function doFetch(
  url: string,
  options: RequestInit | undefined,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    // Include credentials so httpOnly cookies (refresh token) are sent
    return await fetch(url, { ...options, headers, credentials: 'include' });
  } catch (err) {
    throw new ApiError(
      err instanceof Error
        ? `Network error: ${err.message}`
        : 'Network error: unable to reach the server',
      0,
    );
  }
}

/**
 * Generic fetch wrapper that throws on non-ok responses.
 * Automatically injects the Authorization header from the Auth SDK.
 *
 * On 401, attempts one token refresh + retry before clearing the session.
 * On 429, retries up to 3 times with exponential backoff (respects Retry-After).
 * Supports AbortController via options.signal for request cancellation.
 */
export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  // Get access token (auto-refreshes if near expiry)
  let token = await authSDK.getAccessToken();

  // If we think we're logged in but got no token (refresh may have failed
  // transiently), force one explicit refresh before sending a naked request.
  if (!token && authSDK.isAuthenticated()) {
    token = await authSDK.getAccessToken(true);
  }

  // CR-02: use `let` so headers can be updated after a 401 token refresh —
  // the 429 retry loop must always use the most current (possibly refreshed) token.
  let headers = buildHeaders(
    token,
    options?.headers as Record<string, string> | undefined,
  );

  let res = await doFetch(url, options, headers);

  // On 401, try one refresh + retry before giving up
  if (res.status === 401) {
    const freshToken = await authSDK.getAccessToken(true);
    if (freshToken) {
      headers = buildHeaders(
        freshToken,
        options?.headers as Record<string, string> | undefined,
      );
      res = await doFetch(url, options, headers);
    }

    // If still 401 after retry, session is truly invalid
    if (res.status === 401) {
      await authSDK.logout();
      throw new ApiError('Session expired. Please log in again.', 401);
    }
  }

  // On 429, back off and retry up to MAX_429_RETRIES times using current headers
  for (let attempt = 0; res.status === 429 && attempt < MAX_429_RETRIES; attempt++) {
    await sleep(get429Delay(res, attempt));
    res = await doFetch(url, options, headers);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const obj = body as Record<string, unknown>;
    const message = obj.message
      ? String(obj.message)
      : `Request failed with status ${res.status}`;
    const errorCode = typeof obj.errorCode === 'string' ? obj.errorCode : undefined;
    throw new ApiError(message, res.status, errorCode);
  }

  // 204 No Content (e.g. DELETE) returns no body
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/**
 * Create an AbortController for managing request cancellation.
 * Useful for long-running operations (optimization, evaluation, etc.)
 */
export function createAbortController(): AbortController {
  return new AbortController();
}
