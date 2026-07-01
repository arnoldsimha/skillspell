// Mock fetch before imports
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { loginCommand } from '../../src/commands/login.js';

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
