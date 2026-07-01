import * as p from '@clack/prompts';
import { readConfig, writeConfig } from '../lib/config.js';

/**
 * skillspell config url [<url>]
 * CFG-01: get/set the API base URL.
 * If url provided: writes to ~/.skillspell/config.json and prints confirmation.
 * If url omitted: reads and prints the currently configured URL.
 */
export async function configUrlCommand(url: string | undefined): Promise<void> {
  try {
    if (url !== undefined && url.trim() !== '') {
      await writeConfig({ baseUrl: url.trim() });
      p.log.success(`API URL set to ${url.trim()}`);
    } else {
      const config = await readConfig();
      p.log.info(`API URL: ${config.baseUrl}`);
    }
  } catch (err) {
    p.cancel(`Failed to update config: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
