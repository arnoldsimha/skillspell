import { isRateLimitError, rateLimitSleep, withRateLimitRetry } from './rate-limit-retry';

// Helper: build an Error that looks like a 429 rate-limit response
const makeRateLimitErr = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new Error('Rate limit exceeded'), { status: 429, ...overrides });

const makeApiErr = (status: number) =>
  Object.assign(new Error('API error'), { status });

// ── isRateLimitError ───────────────────────────────────────────────────────

describe('isRateLimitError', () => {
  it('returns true for error with status 429', () => {
    expect(isRateLimitError(makeRateLimitErr())).toBe(true);
  });

  it('returns true for error with code RateLimitReached', () => {
    expect(isRateLimitError(Object.assign(new Error('quota'), { code: 'RateLimitReached' }))).toBe(true);
  });

  it('returns true for Error with RateLimitReached in message', () => {
    expect(isRateLimitError(new Error('RateLimitReached: quota exceeded'))).toBe(true);
  });

  it('returns true for Error with "Rate limit" in message', () => {
    expect(isRateLimitError(new Error('Rate limit exceeded. Quota request exceeds the tokens limit. Requested tokens: 0.'))).toBe(true);
  });

  it('returns false for a generic Error', () => {
    expect(isRateLimitError(new Error('Something went wrong'))).toBe(false);
  });

  it('returns false for error with status 500', () => {
    expect(isRateLimitError(makeApiErr(500))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError('string error')).toBe(false);
    expect(isRateLimitError(429)).toBe(false);
  });
});

// ── rateLimitSleep ────────────────────────────────────────────────────────

describe('rateLimitSleep', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves after the specified delay', async () => {
    const p = rateLimitSleep(1000);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects immediately if signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(rateLimitSleep(1000, ac.signal)).rejects.toThrow('Request cancelled by client');
  });

  it('rejects when signal aborts during sleep', async () => {
    const ac = new AbortController();
    const p = rateLimitSleep(5000, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow('Request cancelled by client');
  });
});

// ── withRateLimitRetry ────────────────────────────────────────────────────

describe('withRateLimitRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRateLimitRetry(fn, undefined, 'test');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on rate limit and succeeds on second attempt', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(makeRateLimitErr())
      .mockResolvedValueOnce('ok');

    const promise = withRateLimitRetry(fn, undefined, 'test', 3);
    await jest.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts all attempts and re-throws the last rate-limit error', async () => {
    const err = makeRateLimitErr();
    const fn = jest.fn().mockRejectedValue(err);

    const promise = withRateLimitRetry(fn, undefined, 'test', 3);
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(promise).rejects.toBe(err);
    await jest.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-rate-limit errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Internal server error'));
    await expect(withRateLimitRetry(fn, undefined, 'test', 3)).rejects.toThrow('Internal server error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops retrying when abort signal fires during sleep', async () => {
    const ac = new AbortController();
    const fn = jest.fn().mockRejectedValue(makeRateLimitErr());

    const promise = withRateLimitRetry(fn, ac.signal, 'test', 4);
    ac.abort();
    await expect(promise).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry when signal is already aborted before first call', async () => {
    const ac = new AbortController();
    ac.abort();
    const fn = jest.fn().mockRejectedValue(makeRateLimitErr());

    const promise = withRateLimitRetry(fn, ac.signal, 'test', 4);
    const assertion = expect(promise).rejects.toThrow();
    await jest.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with RateLimitReached code in error', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'RateLimitReached' }))
      .mockResolvedValueOnce('done');

    const promise = withRateLimitRetry(fn, undefined, 'test', 3);
    await jest.runAllTimersAsync();
    expect(await promise).toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
