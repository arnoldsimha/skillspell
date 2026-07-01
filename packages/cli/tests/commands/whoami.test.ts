const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { whoamiCommand } from '../../src/commands/whoami.js';

describe('whoamiCommand (AUTH-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SKILLSPELL_TOKEN;
  });

  it('calls GET /api/auth/me with stored token and prints user info', async () => {
    // Stub — implement in plan 04
    process.env.SKILLSPELL_TOKEN = 'sksp_testtoken';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', email: 'a@b.com', name: 'Alice' }),
    });
    await expect(whoamiCommand({ token: 'sksp_testtoken' })).resolves.not.toThrow();
    expect(mockFetch.mock.calls[0][0]).toContain('/auth/me');
  });

  it('exits non-zero when no token is stored (UX-04)', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
    await expect(whoamiCommand({})).rejects.toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
