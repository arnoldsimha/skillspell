jest.mock('node:fs/promises');

import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import {
  readReceipt,
  writeReceipt,
  upsertReceiptEntry,
  removeReceiptEntry,
} from '../../src/lib/installed-receipt.js';

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockOpen = open as jest.MockedFunction<typeof open>;
const mockUnlink = unlink as jest.MockedFunction<typeof unlink>;

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined as unknown as void);
  mockWriteFile.mockResolvedValue(undefined as unknown as void);
  // Mock the advisory lock: open succeeds immediately (exclusive create), close and unlink are no-ops
  mockOpen.mockResolvedValue({ close: jest.fn().mockResolvedValue(undefined) } as unknown as Awaited<ReturnType<typeof open>>);
  mockUnlink.mockResolvedValue(undefined as unknown as void);
});

describe('readReceipt', () => {
  it('returns empty object when receipt file does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const receipt = await readReceipt(false);
    expect(receipt).toEqual({});
  });

  it('parses existing receipt JSON from global path', async () => {
    const existing = { 'react-patterns': [{ slug: 'react-patterns', target: 'cursor', workspace: false, installedPath: '/path', installedAt: '2026-01-01T00:00:00.000Z', skillUpdatedAt: '2026-01-01T00:00:00.000Z' }] };
    mockReadFile.mockResolvedValue(JSON.stringify(existing) as unknown as Buffer);
    const receipt = await readReceipt(false);
    expect(receipt['react-patterns']).toHaveLength(1);
    expect(receipt['react-patterns'][0].target).toBe('cursor');
  });
});

describe('writeReceipt', () => {
  it('creates global receipt directory and writes JSON', async () => {
    await writeReceipt({ 'test-skill': [] }, false);
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('.skillspell'), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('installed.json'),
      expect.stringContaining('"test-skill"'),
      'utf8',
    );
  });

  it('creates workspace receipt in .skillspell/ directory', async () => {
    await writeReceipt({}, true);
    expect(mockMkdir).toHaveBeenCalledWith('.skillspell', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(require('node:path').join('.skillspell', 'installed.json')),
      expect.any(String),
      'utf8',
    );
  });
});

describe('upsertReceiptEntry (Pitfall 5 — replace, not append)', () => {
  it('adds new entry when slug is not yet in receipt', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await upsertReceiptEntry({
      slug: 'commit-msg',
      target: 'cursor',
      workspace: false,
      installedPath: '/path/to/file',
      installedAt: '2026-01-01T00:00:00.000Z',
      skillUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    const written = JSON.parse((mockWriteFile.mock.calls[0] as unknown[])[1] as string);
    expect(written['commit-msg']).toHaveLength(1);
  });

  it('replaces existing entry for same slug+target+workspace (not appends)', async () => {
    const existing = {
      'commit-msg': [
        { slug: 'commit-msg', target: 'cursor', workspace: false, installedPath: '/old', installedAt: '2026-01-01T00:00:00.000Z', skillUpdatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(existing) as unknown as Buffer);
    await upsertReceiptEntry({
      slug: 'commit-msg',
      target: 'cursor',
      workspace: false,
      installedPath: '/new',
      installedAt: '2026-04-01T00:00:00.000Z',
      skillUpdatedAt: '2026-04-01T00:00:00.000Z',
    });
    const written = JSON.parse((mockWriteFile.mock.calls[0] as unknown[])[1] as string);
    expect(written['commit-msg']).toHaveLength(1);
    expect(written['commit-msg'][0].installedPath).toBe('/new');
  });

  it('allows same slug with different target (D-03 — multi-target tracking)', async () => {
    const existing = {
      'commit-msg': [
        { slug: 'commit-msg', target: 'cursor', workspace: false, installedPath: '/cursor-path', installedAt: '2026-01-01T00:00:00.000Z', skillUpdatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(existing) as unknown as Buffer);
    await upsertReceiptEntry({
      slug: 'commit-msg',
      target: 'roo',
      workspace: false,
      installedPath: '/roo-path',
      installedAt: '2026-04-01T00:00:00.000Z',
      skillUpdatedAt: '2026-04-01T00:00:00.000Z',
    });
    const written = JSON.parse((mockWriteFile.mock.calls[0] as unknown[])[1] as string);
    expect(written['commit-msg']).toHaveLength(2);
  });
});

describe('removeReceiptEntry', () => {
  it('removes matching entry and returns true', async () => {
    const existing = {
      'commit-msg': [
        { slug: 'commit-msg', target: 'cursor', workspace: false, installedPath: '/path', installedAt: '2026-01-01T00:00:00.000Z', skillUpdatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(existing) as unknown as Buffer);
    const removed = await removeReceiptEntry('commit-msg', 'cursor', false);
    expect(removed).toBe(true);
    const written = JSON.parse((mockWriteFile.mock.calls[0] as unknown[])[1] as string);
    expect(written['commit-msg']).toBeUndefined();
  });

  it('returns false when entry does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const removed = await removeReceiptEntry('nonexistent', 'cursor', false);
    expect(removed).toBe(false);
  });
});
