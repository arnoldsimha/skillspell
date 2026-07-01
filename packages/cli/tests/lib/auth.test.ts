jest.mock('node:fs/promises');
jest.mock('node:child_process');
// promisify is mocked as identity; Windows icacls branch is excluded from test scope (win32 only)
jest.mock('node:util', () => ({
  promisify: jest.fn((fn: unknown) => fn),
}));

import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { resolveToken, storeCredential, readCredential, clearCredential, isValidPat } from '../../src/lib/auth.js';

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockUnlink = unlink as jest.MockedFunction<typeof unlink>;
const mockChmod = chmod as jest.MockedFunction<typeof chmod>;

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined as unknown as void);
  mockWriteFile.mockResolvedValue(undefined as unknown as void);
  mockChmod.mockResolvedValue(undefined as unknown as void);
  mockUnlink.mockResolvedValue(undefined as unknown as void);
  delete process.env.SKILLSPELL_TOKEN;
});

describe('isValidPat', () => {
  it('returns true for valid PAT (starts with sksp_ and length > 10)', () => {
    expect(isValidPat('sksp_abc12345')).toBe(true);
  });

  it('returns false for JWT (eyJ prefix)', () => {
    expect(isValidPat('eyJhbGciOiJIUzI1NiJ9.payload.signature')).toBe(false);
  });

  it('returns false for short sksp_ token', () => {
    expect(isValidPat('sksp_abc')).toBe(false);
  });
});

describe('resolveToken (AUTH-02, D-05)', () => {
  it('returns SKILLSPELL_TOKEN env var when set (highest priority)', async () => {
    process.env.SKILLSPELL_TOKEN = 'sksp_envtoken';
    const token = await resolveToken({});
    delete process.env.SKILLSPELL_TOKEN;
    expect(token).toBe('sksp_envtoken');
  });

  it('returns --token flag value when env var not set', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const token = await resolveToken({ token: 'sksp_flagtoken' });
    expect(token).toBe('sksp_flagtoken');
  });

  it('returns credential file token when only file source available', async () => {
    mockReadFile.mockResolvedValue('sksp_filetoken' as unknown as Buffer);
    const token = await resolveToken({});
    expect(token).toBe('sksp_filetoken');
  });

  it('returns null when no token source available', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const token = await resolveToken({});
    expect(token).toBeNull();
  });
});

describe('storeCredential / readCredential / clearCredential (AUTH-03, AUTH-04)', () => {
  it('stores a PAT — calls writeFile and chmod with 0o600 on non-win32', async () => {
    await storeCredential('sksp_test12345');
    expect(mockMkdir).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('credentials'),
      'sksp_test12345',
      { encoding: 'utf8' },
    );
    // On non-win32 (macOS/Linux test environment): chmod 0o600 must be called
    if (process.platform !== 'win32') {
      expect(mockChmod).toHaveBeenCalledWith(expect.stringContaining('credentials'), 0o600);
    }
  });

  it('reads back a stored PAT from file', async () => {
    mockReadFile.mockResolvedValue('sksp_test12345' as unknown as Buffer);
    const token = await readCredential();
    expect(token).toBe('sksp_test12345');
  });

  it('returns null when credential file does not exist (ENOENT)', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const token = await readCredential();
    expect(token).toBeNull();
  });

  it('returns null for empty credential file', async () => {
    mockReadFile.mockResolvedValue('   ' as unknown as Buffer);
    const token = await readCredential();
    expect(token).toBeNull();
  });

  it('clearCredential calls unlink with correct path', async () => {
    await clearCredential();
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('credentials'));
  });

  it('clearCredential is idempotent — does not throw when file does not exist', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(clearCredential()).resolves.not.toThrow();
  });
});
