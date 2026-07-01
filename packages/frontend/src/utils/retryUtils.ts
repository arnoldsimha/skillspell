/** Max number of times to retry a 429 response before giving up. */
export const MAX_429_RETRIES = 3;

/**
 * Milliseconds to wait before the next retry after a 429.
 * Respects the server's Retry-After header when present; otherwise
 * uses exponential backoff: 500ms → 1s → 2s (capped at 4s).
 */
export function get429Delay(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }
  return Math.min(500 * Math.pow(2, attempt), 4000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
