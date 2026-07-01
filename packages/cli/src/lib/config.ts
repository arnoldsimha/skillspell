import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import type { CliConfig } from '../types.js';

export const CONFIG_DIR = join(os.homedir(), '.skillspell');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const DEFAULT_BASE_URL = 'https://app.skillspell.dev';

export async function readConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return { baseUrl: parsed.baseUrl ?? DEFAULT_BASE_URL };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL };
  }
}

export async function writeConfig(config: Partial<CliConfig>): Promise<void> {
  const current = await readConfig();
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify({ ...current, ...config }, null, 2), 'utf8');
}
