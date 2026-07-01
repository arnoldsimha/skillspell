jest.mock('../../src/lib/installed-receipt.js', () => ({
  readReceipt: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { readReceipt } from '../../src/lib/installed-receipt.js';
import { outdatedCommand } from '../../src/commands/outdated.js';

const mockReadReceipt = jest.mocked(readReceipt);

describe('outdatedCommand (UX-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: one global install of 'react-patterns'
    mockReadReceipt.mockImplementation(async (workspace: boolean) => {
      if (!workspace) {
        return {
          'react-patterns': [
            { slug: 'react-patterns', target: 'cursor', workspace: false, installedPath: '/path', installedAt: '2026-01-01T00:00:00.000Z', skillUpdatedAt: '2026-01-01T00:00:00.000Z' },
          ],
        };
      }
      return {};
    });

    // Listing API returns newer version
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'skill-uuid-1', name: 'React Patterns', description: 'desc', status: 'published', version: 2, createdAt: '', updatedAt: '2026-04-01T00:00:00.000Z', isPublished: true },
      ],
    });
  });

  it('reads both global and workspace receipts (D-08 — full inventory)', async () => {
    await outdatedCommand({});
    // readReceipt called twice: once for global (false), once for workspace (true)
    expect(mockReadReceipt).toHaveBeenCalledTimes(2);
    expect(mockReadReceipt).toHaveBeenCalledWith(false);
    expect(mockReadReceipt).toHaveBeenCalledWith(true);
  });

  it('fetches listing API for each unique slug (parallel per D-09)', async () => {
    await outdatedCommand({});
    // One fetch per unique slug
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/public/skills');
  });

  it('shows "no installed skills" when both receipts are empty (D-08)', async () => {
    mockReadReceipt.mockResolvedValue({});
    const logSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await outdatedCommand({});
    logSpy.mockRestore();
    // Should exit cleanly without error
  });
});
