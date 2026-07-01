/**
 * list.test.ts — TDD tests for the list command (DISC-01, DISC-02, UX-04)
 * RED phase: these tests are written before list.ts is implemented.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock auth so tests never read real credentials from ~/.skillspell
jest.mock('../../src/lib/auth.js', () => ({
  resolveToken: jest.fn().mockResolvedValue(null),
}));

// Mock config so tests use a stable base URL regardless of ~/.skillspell/config.json
jest.mock('../../src/lib/config.js', () => ({
  readConfig: jest.fn().mockResolvedValue({ baseUrl: 'https://app.skillspell.dev' }),
}));

import { listCommand } from '../../src/commands/list.js';

const mockSkills = [
  {
    id: 'skill-1',
    name: 'React Patterns',
    description: 'React best practices',
    status: 'published',
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'skill-2',
    name: 'Commit Message',
    description: 'Write good commits',
    status: 'published',
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
];

describe('listCommand (DISC-01, DISC-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockSkills,
    });
  });

  it('calls GET /api/public/skills with limit=50 in non-interactive mode (DISC-01)', async () => {
    await listCommand({ yes: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/public/skills');
    expect(url).toContain('limit=50');
  });

  it('appends search param when --search provided (DISC-02)', async () => {
    await listCommand({ search: 'react', yes: true });
    const url: string = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('search=react');
  });

  it('exits non-zero on API error (UX-04)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    });
    const mockExit = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => {
        throw new Error('exit');
      });
    await expect(listCommand({ yes: true })).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
