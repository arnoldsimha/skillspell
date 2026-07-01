// jest.mock MUST be at module scope — before any imports — so Jest hoists it
// correctly and the mock is active when install.ts is first imported.
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));

// Mock installed-receipt so the real fs is never touched during tests.
// D-01/D-02/D-03: receipt writes are isolated from filesystem in tests.
jest.mock('../../src/lib/installed-receipt.js', () => ({
  upsertReceiptEntry: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { upsertReceiptEntry } from '../../src/lib/installed-receipt.js';
import { installCommand } from '../../src/commands/install.js';

// Typed references to the mocked fs functions — set return values in beforeEach.
const mockMkdir = jest.mocked(mkdir);
const mockWriteFile = jest.mocked(writeFile);
const mockReadFile = jest.mocked(readFile);
const mockUpsertReceiptEntry = jest.mocked(upsertReceiptEntry);

describe('installCommand (INST-01, INST-02, INST-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default fs behaviour: mkdir and writeFile succeed; readFile throws ENOENT
    // (shared-file branch — file does not exist yet).
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    // Default fetch behaviour: list returns one skill, download returns content.
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'skill-uuid-1',
            name: 'React Patterns',
            description: 'desc',
            status: 'published',
            version: 1,
            createdAt: '',
            updatedAt: '',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'React Patterns',
          slug: 'react-patterns',
          content: '# React Patterns\n...',
        }),
      });
  });

  it('calls list endpoint then download endpoint in sequence', async () => {
    await installCommand('react-patterns', { target: 'cursor', yes: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/public/skills');
    expect(mockFetch.mock.calls[1][0]).toContain('/api/public/skills/skill-uuid-1/download');
  });

  it('exits non-zero when skill not found (UX-04)', async () => {
    // Override: list returns empty — no matching skill.
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    const mockExit = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => { throw new Error('exit'); });
    await expect(
      installCommand('nonexistent-skill', { target: 'cursor', yes: true }),
    ).rejects.toThrow('exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('writes receipt entry with slug, target, workspace, installedPath, and skillUpdatedAt after successful install (D-01/D-02)', async () => {
    // list response provides updatedAt so resolveSlugToId can capture skillUpdatedAt
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'skill-uuid-1',
            name: 'React Patterns',
            description: 'desc',
            status: 'published',
            version: 1,
            createdAt: '',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'React Patterns',
          slug: 'react-patterns',
          content: '# React Patterns\n...',
        }),
      });

    await installCommand('react-patterns', { target: 'cursor', yes: true });

    expect(mockUpsertReceiptEntry).toHaveBeenCalledTimes(1);
    const call = mockUpsertReceiptEntry.mock.calls[0][0];
    expect(call.slug).toBe('react-patterns');
    expect(call.target).toBe('cursor');
    expect(call.workspace).toBe(false);
    expect(call.skillUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(typeof call.installedPath).toBe('string');
    expect(typeof call.installedAt).toBe('string');
  });
});
