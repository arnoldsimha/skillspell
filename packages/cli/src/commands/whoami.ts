import * as p from '@clack/prompts';
import { resolveToken } from '../lib/auth.js';
import { readConfig } from '../lib/config.js';
import { createApiClient, ApiError } from '../lib/api-client.js';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * skillspell whoami
 * AUTH-05: prints authenticated user's email and name.
 * Uses stored PAT (or SKILLSPELL_TOKEN / --token) to call GET /api/auth/me.
 */
export async function whoamiCommand(options: { token?: string }): Promise<void> {
  const token = await resolveToken(options);

  if (!token) {
    p.cancel('Not logged in. Run `skillspell login` first.');
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Checking authentication\u2026');

  try {
    const config = await readConfig();
    const client = createApiClient(config.baseUrl, token);
    const user = await client.request<UserProfile>('/auth/me');
    s.stop('Authenticated.');
    p.log.info(`Logged in as ${user.firstName} ${user.lastName} <${user.email}>`);
  } catch (err) {
    s.stop('Failed.');
    if (err instanceof ApiError && err.statusCode === 401) {
      p.cancel('Credential is invalid or expired. Run `skillspell login` again.');
    } else {
      p.cancel(`whoami failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}
