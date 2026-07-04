// Mock fetch before imports
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { loginCommand, fetchOidcLoginUrl, buildSamlLoginUrl } from '../../src/commands/login.js';

describe('SSO login URL construction — CLI state nonce (security finding #3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildSamlLoginUrl includes cli_redirect and the state nonce as query params', () => {
    const url = buildSamlLoginUrl(
      'https://api.example.com',
      'http://localhost:9876/callback',
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.example.com/api/auth/saml/login');
    expect(parsed.searchParams.get('cli_redirect')).toBe('http://localhost:9876/callback');
    expect(parsed.searchParams.get('state')).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
  });

  it('fetchOidcLoginUrl sends cli_state alongside cli_redirect and cli_code_verifier in the POST body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ redirectUrl: 'https://idp.example.com/authorize?x=1' }),
    });

    const redirectUrl = await fetchOidcLoginUrl(
      'https://api.example.com',
      'http://localhost:9876/callback',
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    );

    expect(redirectUrl).toBe('https://idp.example.com/authorize?x=1');
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/auth/oidc/login');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.cli_redirect).toBe('http://localhost:9876/callback');
    expect(body.cli_state).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
    expect(typeof body.cli_code_verifier).toBe('string');
    expect(body.cli_code_verifier.length).toBeGreaterThan(20);
  });
});

describe('loginCommand (AUTH-01 — two-step login flow)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls POST /api/auth/login then POST /api/auth/tokens in sequence', async () => {
    // Step 1 response: JWT (never stored)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'eyJfakeJWT', user: { id: '1', email: 'a@b.com', name: 'A' } }),
      })
      // Step 2: GET /api/auth/tokens — no existing PAT with this name
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      // Step 3: POST /api/auth/tokens — create PAT
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rawToken: 'sksp_fakePAT', id: 'pat-1', name: 'skillspell-cli-localhost', prefix: 'sksp_', createdAt: new Date().toISOString(), expiresAt: null, lastUsedAt: null }),
      });

    // loginCommand in CI mode (no interactive prompts)
    await loginCommand('test@example.com', 'password123', { yes: true, token: undefined });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // First call is login
    expect(mockFetch.mock.calls[0][0]).toContain('/api/auth/login');
    // Second call lists existing PATs (dedup check)
    expect(mockFetch.mock.calls[1][0]).toContain('/api/auth/tokens');
    // Third call creates the new PAT
    expect(mockFetch.mock.calls[2][0]).toContain('/api/auth/tokens');
    // JWT must NOT be stored — only PAT (sksp_...) written to disk
    // This test verifies the call sequence; storeCredential is tested in auth.test.ts
  });

  it('exits non-zero when login API returns 401 (UX-04)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
    await expect(
      loginCommand('bad@example.com', 'wrongpass', { yes: true, token: undefined })
    ).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
