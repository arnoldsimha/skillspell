import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CONFIG_DIR, readConfig } from './config.js';
import type { SsoCredential } from '../types.js';

const CRED_FILE = join(CONFIG_DIR, 'credentials');
const SSO_CRED_FILE = join(CONFIG_DIR, 'sso-credentials');
const execFileAsync = promisify(execFile);

export function isValidPat(token: string): boolean {
  return typeof token === 'string' && token.startsWith('sksp_') && token.length > 10;
}

// ─── Phase 7: SSO Credential Functions ────────────────────────────────────────

/**
 * Decode a JWT access token's expiry without a JWT library (RESEARCH.md Pattern 8).
 * Returns epoch milliseconds. Throws if token is malformed or missing `exp` claim.
 */
export function getJwtExpiry(token: string): number {
  const parts = token.split('.');
  if (parts.length < 3 || !parts[1]) {
    throw new Error('Malformed JWT token');
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: number };
  if (typeof payload.exp !== 'number') {
    throw new Error('JWT payload missing exp claim');
  }
  return payload.exp * 1000; // seconds → ms
}

/**
 * Store SSO credentials in ~/.skillspell/sso-credentials (D-01, D-03).
 * Writes JSON with 0600 permissions (icacls on Windows).
 * Replicates storeCredential() pattern exactly.
 */
export async function storeSsoCredential(data: SsoCredential): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(SSO_CRED_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  if (os.platform() === 'win32') {
    try {
      await execFileAsync('icacls', [
        SSO_CRED_FILE,
        '/inheritance:r',
        '/grant:r',
        `${os.userInfo().username}:F`,
      ]);
    } catch {
      // icacls unavailable — file written, permissions not restricted
    }
  } else {
    await chmod(SSO_CRED_FILE, 0o600);
  }
}

/**
 * Read SSO credentials from ~/.skillspell/sso-credentials.
 * Returns null if the file does not exist or is invalid JSON.
 */
export async function readSsoCredential(): Promise<SsoCredential | null> {
  try {
    const raw = await readFile(SSO_CRED_FILE, 'utf8');
    return JSON.parse(raw) as SsoCredential;
  } catch {
    return null;
  }
}

/**
 * Clear stored SSO credentials (for logout).
 */
export async function clearSsoCredential(): Promise<void> {
  try {
    await unlink(SSO_CRED_FILE);
  } catch {
    // File does not exist — idempotent
  }
}

/**
 * Resolve the bearer token for API calls.
 *
 * Priority (D-02):
 * 1. SKILLSPELL_TOKEN env var
 * 2. --token flag
 * 3. PAT credentials file (~/.skillspell/credentials)
 * 4. SSO credentials file (~/.skillspell/sso-credentials) with proactive refresh (D-13)
 */
export async function resolveToken(options: { token?: string }): Promise<string | null> {
  if (process.env.SKILLSPELL_TOKEN) return process.env.SKILLSPELL_TOKEN;
  if (options.token) return options.token;

  // Check PAT first (PAT takes precedence over SSO — D-02)
  const pat = await readCredential();
  if (pat) return pat;

  // Check SSO credentials
  const sso = await readSsoCredential();
  if (!sso) return null;

  // D-13: proactive refresh if access token expires within 60 seconds
  const msUntilExpiry = sso.expiresAt - Date.now();
  if (msUntilExpiry > 60_000) {
    // Access token still valid with comfortable margin — return it directly
    return sso.accessToken;
  }

  // Access token expired or expiring soon — attempt silent refresh
  try {
    const config = await readConfig();
    const resp = await fetch(`${config.baseUrl}/api/auth/cli/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sso.refreshToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: sso.userId }),
    });

    if (!resp.ok) {
      // D-14: refresh failed — return null, caller will show error
      process.stderr.write(
        `Session expired — run \`skillspell login --sso\` to re-authenticate.\n`,
      );
      return null;
    }

    const body = await resp.json() as { accessToken?: unknown; refreshToken?: unknown };
    if (typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string') {
      process.stderr.write(
        `Session expired — run \`skillspell login --sso\` to re-authenticate.\n`,
      );
      return null;
    }
    const newAccessToken = body.accessToken;
    const newRefreshToken = body.refreshToken;

    // Update stored credentials with new token pair
    let newExpiresAt: number;
    try {
      newExpiresAt = getJwtExpiry(newAccessToken);
    } catch {
      newExpiresAt = Date.now() + 15 * 60 * 1000; // 15-minute fallback
    }

    await storeSsoCredential({
      ...sso,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
    });

    return newAccessToken;
  } catch {
    // D-14: network error or other failure
    process.stderr.write(
      `Session expired — run \`skillspell login --sso\` to re-authenticate.\n`,
    );
    return null;
  }
}

export async function storeCredential(rawToken: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CRED_FILE, rawToken, { encoding: 'utf8' });
  if (os.platform() === 'win32') {
    try {
      await execFileAsync('icacls', [
        CRED_FILE,
        '/inheritance:r',
        '/grant:r',
        `${os.userInfo().username}:F`,
      ]);
    } catch {
      // icacls unavailable on this Windows environment — file written, permissions not restricted
      // Warn: credential file could not be access-restricted. Consider running icacls manually.
    }
  } else {
    await chmod(CRED_FILE, 0o600);
  }
}

export async function readCredential(): Promise<string | null> {
  try {
    const raw = await readFile(CRED_FILE, 'utf8');
    const token = raw.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function clearCredential(): Promise<void> {
  try {
    await unlink(CRED_FILE);
  } catch {
    // File does not exist — idempotent logout is correct behavior
  }
}
