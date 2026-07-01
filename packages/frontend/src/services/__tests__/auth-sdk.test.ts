import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// __BACKEND_URL__ is '' in tests (see vitest.config.ts), so API_BASE === '/api'.
const REFRESH_URL = '/api/auth/refresh';
const STORAGE_KEY = 'skillspell_auth';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a (signature-less) JWT the SDK can decode. exp is in seconds. */
function makeJwt(overrides: Record<string, unknown> = {}): string {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = {
    sub: 'user-1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'A',
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + 3600, // valid for 1h
    ...overrides,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errResponse(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as Response;
}

type AuthSDKModule = typeof import('../auth-sdk');
let authSDK: AuthSDKModule['authSDK'];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  // Fresh module = fresh singleton state per test.
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  ({ authSDK } = await import('../auth-sdk'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── restoreSession ─────────────────────────────────────────────────────────

describe('restoreSession', () => {
  it('exchanges the refresh cookie for a token and returns the user', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ accessToken: makeJwt() }));

    const user = await authSDK.restoreSession();

    expect(user?.id).toBe('user-1');
    expect(user?.email).toBe('alice@example.com');
    expect(authSDK.isAuthenticated()).toBe(true);
  });

  it('calls POST /auth/refresh with credentials and NO Authorization header', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ accessToken: makeJwt() }));

    await authSDK.restoreSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(REFRESH_URL);
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    const headers = (opts.headers ?? {}) as Record<string, string>;
    // No access token in memory on cold boot → cookie-only refresh.
    expect(headers.Authorization).toBeUndefined();
  });

  it('returns null and stays unauthenticated when the cookie is invalid', async () => {
    fetchMock.mockResolvedValueOnce(errResponse(401, { message: 'No refresh token' }));

    const user = await authSDK.restoreSession();

    expect(user).toBeNull();
    expect(authSDK.isAuthenticated()).toBe(false);
  });
});

// ── F-01: access token is never persisted ───────────────────────────────────

describe('access token is in-memory only (F-01)', () => {
  it('does not write the token to localStorage or sessionStorage after restore', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ accessToken: makeJwt() }));

    await authSDK.restoreSession();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not persist the token after login', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ user: { id: 'user-1', email: 'alice@example.com', firstName: 'Alice', lastName: 'A', role: 'user' }, accessToken: makeJwt() }),
    );

    await authSDK.login('alice@example.com', 'pw');

    expect(authSDK.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('wipes a token left in storage by an older build (clearLegacyStorage)', async () => {
    // Simulate a pre-fix build that persisted the token.
    localStorage.setItem(STORAGE_KEY, 'legacy-persisted-token');
    fetchMock.mockResolvedValueOnce(errResponse(401));

    await authSDK.restoreSession();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ── getAccessToken ───────────────────────────────────────────────────────────

describe('getAccessToken', () => {
  it('returns the in-memory token when it is still valid', async () => {
    const jwt = makeJwt();
    fetchMock.mockResolvedValueOnce(okResponse({ accessToken: jwt }));
    await authSDK.restoreSession();

    const token = await authSDK.getAccessToken();
    expect(token).toBe(jwt);
    // No extra refresh needed — only the restore call happened.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no session', async () => {
    expect(await authSDK.getAccessToken()).toBeNull();
  });
});

// ── logout ─────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('clears the in-memory session', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ accessToken: makeJwt() }));
    await authSDK.restoreSession();
    expect(authSDK.isAuthenticated()).toBe(true);

    fetchMock.mockResolvedValueOnce(okResponse({})); // logout endpoint
    await authSDK.logout();

    expect(authSDK.isAuthenticated()).toBe(false);
    expect(await authSDK.getAccessToken()).toBeNull();
  });
});
