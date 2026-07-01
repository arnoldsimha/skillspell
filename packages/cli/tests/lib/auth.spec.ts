jest.mock('node:fs/promises');
jest.mock('node:child_process');
jest.mock('node:util', () => ({
  promisify: jest.fn((fn: unknown) => fn),
}));
jest.mock('node:os', () => ({
  default: { platform: () => 'linux', userInfo: () => ({ username: 'testuser' }), homedir: () => '/tmp/testhome' },
  platform: () => 'linux',
  userInfo: () => ({ username: 'testuser' }),
  homedir: () => '/tmp/testhome',
}));

import { readFile, writeFile } from 'node:fs/promises';
import { resolveToken } from '../../src/lib/auth.js';

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SKILLSPELL_TOKEN;
});

/**
 * Wave 0 failing stubs for resolveToken() SSO proactive refresh behavior.
 *
 * These tests cover D-13 and D-14 from 07-CONTEXT.md:
 * - D-13: proactively refresh when accessToken expires within 60s
 * - D-14: return null and log "Session expired" when refresh fails
 *
 * These stubs will FAIL until Plan 05 extends resolveToken() to handle sso-credentials.
 */
describe('resolveToken() — SSO proactive refresh (D-13, D-14)', () => {
  const nearExpiry = Date.now() + 30 * 1000; // 30 seconds: within 60s window -> refresh

  it('7-05-01: proactively refreshes when accessToken expires within 60 seconds', async () => {
    // SSO credential with near-expiry access token
    const ssoCredential = JSON.stringify({
      type: 'sso',
      accessToken: 'expiring.access.token',
      refreshToken: 'stored.refresh.token',
      expiresAt: nearExpiry,
      userId: 'u1',
      email: 'user@example.com',
    });

    // PAT credentials file not found, SSO file found
    mockReadFile.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('credentials') && !p.endsWith('sso-credentials')) {
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      }
      if (p.endsWith('sso-credentials')) {
        return Promise.resolve(ssoCredential as unknown as Buffer);
      }
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    // Mock global fetch for /auth/cli/refresh
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'new.access.token', refreshToken: 'new.refresh.token' }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const token = await resolveToken({});

    // Expects resolveToken to call /auth/cli/refresh and return the new access token
    expect(token).toBe('new.access.token');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/cli/refresh'),
      expect.objectContaining({ method: 'POST' }),
    );
    // sso-credentials should be updated with new token
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('sso-credentials'),
      expect.stringContaining('new.access.token'),
      expect.anything(),
    );
  });

  it('7-05-02: returns null and emits "Session expired" message when refresh fails', async () => {
    const ssoCredential = JSON.stringify({
      type: 'sso',
      accessToken: 'expiring.access.token',
      refreshToken: 'stored.refresh.token',
      expiresAt: nearExpiry,
      userId: 'u1',
      email: 'user@example.com',
    });

    mockReadFile.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('credentials') && !p.endsWith('sso-credentials')) {
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      }
      if (p.endsWith('sso-credentials')) {
        return Promise.resolve(ssoCredential as unknown as Buffer);
      }
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    // Mock fetch returning 401 (refresh token expired or revoked)
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = mockFetch as unknown as typeof fetch;

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const token = await resolveToken({});

    // Expects null when refresh fails (D-14)
    expect(token).toBeNull();
    stderrSpy.mockRestore();
  });

  it('returns PAT token when credentials file exists (SSO file ignored)', async () => {
    // PAT file exists and is read successfully — SSO file should not be checked
    mockReadFile.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('credentials') && !p.endsWith('sso-credentials')) {
        return Promise.resolve('sksp_pattoken' as unknown as Buffer);
      }
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    const token = await resolveToken({});
    expect(token).toBe('sksp_pattoken');
  });
});
