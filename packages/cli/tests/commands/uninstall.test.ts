jest.mock('node:os', () => ({ ...jest.requireActual('node:os'), homedir: () => '/home/user' }));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('../../src/lib/installed-receipt.js', () => ({
  readReceipt: jest.fn(),
  removeReceiptEntry: jest.fn(),
}));

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { readReceipt, removeReceiptEntry } from '../../src/lib/installed-receipt.js';
import { uninstallCommand } from '../../src/commands/uninstall.js';

const mockReadFile = jest.mocked(readFile);
const mockWriteFile = jest.mocked(writeFile);
const mockUnlink = jest.mocked(unlink);
const mockReadReceipt = jest.mocked(readReceipt);
const mockRemoveReceiptEntry = jest.mocked(removeReceiptEntry);

describe('uninstallCommand (LIFE-02, LIFE-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRemoveReceiptEntry.mockResolvedValue(true);

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
  });

  it('unlinks installed file and removes receipt entry (LIFE-02, LIFE-03)', async () => {
    await uninstallCommand('react-patterns', { yes: true });

    expect(mockUnlink).toHaveBeenCalledWith('/home/user/.cursor/rules/react-patterns.mdc');
    expect(mockRemoveReceiptEntry).toHaveBeenCalledWith('react-patterns', 'cursor', false);
  });

  it('calls removeSection (not unlink) for section-managed files (D-12)', async () => {
    mockReadReceipt.mockResolvedValue({
      'my-skill': [
        {
          slug: 'my-skill',
          target: 'copilot',
          workspace: true,
          installedPath: '.github/copilot-instructions.md',
          installedAt: '2026-01-01T00:00:00.000Z',
          skillUpdatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mockReadFile.mockResolvedValue(
      '<!-- skillspell-begin: my-skill -->\ncontent\n<!-- skillspell-end: my-skill -->\n' as unknown as Buffer,
    );

    await uninstallCommand('my-skill', { yes: true });

    // Should NOT unlink the shared file
    expect(mockUnlink).not.toHaveBeenCalled();
    // Should write the file with section removed
    expect(mockWriteFile).toHaveBeenCalledWith(
      '.github/copilot-instructions.md',
      expect.not.stringContaining('my-skill'),
      'utf8',
    );
    expect(mockRemoveReceiptEntry).toHaveBeenCalledWith('my-skill', 'copilot', true);
  });

  it('exits non-zero when skill not in receipt', async () => {
    mockReadReceipt.mockResolvedValue({});

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await expect(uninstallCommand('nonexistent', { yes: true })).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
