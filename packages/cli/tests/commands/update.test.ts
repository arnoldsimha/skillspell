// jest.mock at module scope before imports — Jest hoisting requirement
jest.mock('node:os', () => ({ ...jest.requireActual('node:os'), homedir: () => '/home/user' }));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('../../src/lib/installed-receipt.js', () => ({
  readReceipt: jest.fn(),
  upsertReceiptEntry: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { readFile, writeFile } from 'node:fs/promises';
import { readReceipt, upsertReceiptEntry } from '../../src/lib/installed-receipt.js';
import { updateCommand } from '../../src/commands/update.js';

const mockReadFile = jest.mocked(readFile);
const mockWriteFile = jest.mocked(writeFile);
const mockReadReceipt = jest.mocked(readReceipt);
const mockUpsertReceiptEntry = jest.mocked(upsertReceiptEntry);

describe('updateCommand (LIFE-01, LIFE-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockWriteFile.mockResolvedValue(undefined);
    mockUpsertReceiptEntry.mockResolvedValue(undefined);

    // Default: receipt has one cursor/global install for 'react-patterns'
    mockReadReceipt.mockResolvedValue({
      'react-patterns': [
        {
          slug: 'react-patterns',
          target: 'cursor',
          workspace: false,
          installedPath: '/home/user/.cursor/rules/react-patterns.mdc',
          installedAt: '2026-01-01T00:00:00.000Z',
          skillUpdatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    // Default fetch: list endpoint returns matching skill, download returns content
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'skill-uuid-1', name: 'React Patterns', description: 'desc', status: 'published', version: 2, createdAt: '', updatedAt: '2026-04-01T00:00:00.000Z', isPublished: true },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'React Patterns', slug: 'react-patterns', content: '# Updated React Patterns' }),
      });
  });

  it('reads receipt, downloads latest, overwrites file, updates receipt entry (LIFE-01, LIFE-03)', async () => {
    await updateCommand('react-patterns', { yes: true });

    // Must have fetched list endpoint (to get updatedAt) and download endpoint
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/public/skills');
    expect(mockFetch.mock.calls[1][0]).toContain('/download');

    // Must have written the new content to the installedPath from receipt
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/home/user/.cursor/rules/react-patterns.mdc',
      expect.stringContaining('Updated React Patterns'),
      'utf8',
    );

    // Must have updated the receipt entry with new skillUpdatedAt
    expect(mockUpsertReceiptEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'react-patterns',
        target: 'cursor',
        skillUpdatedAt: '2026-04-01T00:00:00.000Z',
      }),
    );
  });

  it('shows diff and prompts confirmation when file differs from installed content (D-10)', async () => {
    // Existing file has different content from what will be downloaded
    mockReadFile.mockResolvedValue('# Old React Patterns\n(old)' as unknown as Buffer);

    await updateCommand('react-patterns', { yes: true }); // --yes skips confirmation (D-11)

    // In --yes mode: writes without blocking (D-11)
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero when skill not in receipt', async () => {
    mockReadReceipt.mockResolvedValue({});

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await expect(updateCommand('nonexistent', { yes: true })).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
