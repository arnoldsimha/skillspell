import * as p from '@clack/prompts';
import { clearCredential, clearSsoCredential } from '../lib/auth.js';

/**
 * skillspell logout
 * AUTH-04: clears both PAT and SSO credentials.
 * Idempotent — exits 0 even if no credential files exist.
 */
export async function logoutCommand(): Promise<void> {
  try {
    await Promise.all([clearCredential(), clearSsoCredential()]);
    p.log.success('Logged out successfully.');
  } catch (err) {
    p.cancel(`Logout failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
