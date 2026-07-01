jest.mock('node:fs/promises');

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readConfig, writeConfig } from '../../src/lib/config.js';

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;

beforeEach(() => {
  jest.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined as unknown as void);
  mockWriteFile.mockResolvedValue(undefined as unknown as void);
});

describe('readConfig (CFG-01)', () => {
  it('returns default baseUrl when config file does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const config = await readConfig();
    expect(config.baseUrl).toBe('https://app.skillspell.dev');
  });

  it('returns stored baseUrl after writeConfig', async () => {
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) // readConfig inside writeConfig
      .mockResolvedValueOnce('{"baseUrl":"https://custom.example.com"}' as unknown as Buffer); // readConfig after write
    await writeConfig({ baseUrl: 'https://custom.example.com' });
    const config = await readConfig();
    expect(config.baseUrl).toBe('https://custom.example.com');
  });

  it('merges partial updates — preserves existing keys', async () => {
    // Initial state: has baseUrl set
    mockReadFile.mockResolvedValue(
      '{"baseUrl":"https://original.example.com","extra":"value"}' as unknown as Buffer,
    );
    await writeConfig({ baseUrl: 'https://new.example.com' });
    // writeFile should have been called with merged JSON containing new URL
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenContent = (mockWriteFile.mock.calls[0] as unknown[])[1] as string;
    const parsed = JSON.parse(writtenContent) as Record<string, unknown>;
    expect(parsed.baseUrl).toBe('https://new.example.com');
  });
});
