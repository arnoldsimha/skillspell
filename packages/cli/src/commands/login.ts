import * as p from '@clack/prompts';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import open from 'open';
import { storeCredential, isValidPat, storeSsoCredential, getJwtExpiry } from '../lib/auth.js';
import { readConfig } from '../lib/config.js';
import { createApiClient, ApiError } from '../lib/api-client.js';
import { startCallbackServer } from '../lib/callback-server.js';
import type { LoginResponse, CreatePatResponse, PatListItem, SsoCredential, CliConfig } from '../types.js';

interface LoginOptions {
  yes?: boolean;
  token?: string;
  sso?: boolean;   // D-15 through D-18: browser-based SSO flag
}

interface SsoStatusResponse {
  activeSsoProtocol: 'saml' | 'oidc' | null;
  samlEnabled: boolean;
  oidcEnabled: boolean;
  passwordLoginEnabled: boolean;
}

/**
 * Initiate OIDC login via POST to keep the PKCE code_verifier out of server access logs.
 * Per D-09: CLI generates PKCE inline using node:crypto (openid-client NOT installed in CLI).
 * CR-01 fix: code_verifier is sent in the POST body, not the URL query string.
 * Returns the IdP authorization URL that the CLI should open in the browser.
 */
async function fetchOidcLoginUrl(baseUrl: string, cliRedirect: string): Promise<string> {
  const codeVerifier = randomBytes(32).toString('base64url');
  const resp = await fetch(`${baseUrl}/api/auth/oidc/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cli_redirect: cliRedirect,
      cli_code_verifier: codeVerifier,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OIDC login initiation failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as { redirectUrl: string };
  return data.redirectUrl;
}

/**
 * Browser-based SSO login flow (SSO-01, SSO-02).
 * Supports both SAML and OIDC protocols — detected via GET /api/auth/sso-status (D-08).
 *
 * Flow:
 * 1. Start local callback HTTP server on random port (D-05)
 * 2. Detect active SSO protocol via sso-status endpoint (D-08)
 * 3. Build login URL based on active protocol:
 *    - OIDC: buildOidcLoginUrl() with PKCE code_verifier/code_challenge (D-09)
 *    - SAML: existing SAML URL construction (unchanged from Phase 7)
 * 4. Open browser to login URL with cli_redirect param (D-15)
 * 5. Show spinner while waiting for callback (D-16)
 * 6. Race: code arrival vs 5-minute timeout (D-17)
 * 7. Exchange code for token pair via /api/auth/cli/exchange (D-10 — same endpoint for both protocols)
 * 8. Store tokens in ~/.skillspell/sso-credentials (D-01, D-03)
 * 9. Show success message with email (D-18)
 */
async function ssoLoginFlow(config: CliConfig): Promise<void> {
  p.intro('SkillSpell SSO Login');

  // Start local callback server — must resolve before opening browser (Pitfall 2)
  const { port, codePromise } = await startCallbackServer();
  const cliRedirect = `http://localhost:${port}/callback`;

  // D-08: Detect active SSO protocol before building login URL
  let ssoStatus: SsoStatusResponse;
  try {
    const statusRes = await fetch(`${config.baseUrl}/api/auth/sso-status`);
    ssoStatus = await statusRes.json() as SsoStatusResponse;
  } catch {
    p.cancel('Failed to reach the SkillSpell server. Check your connection and server URL.');
    process.exit(1);
    return; // TypeScript narrowing
  }

  if (!ssoStatus.activeSsoProtocol) {
    p.cancel('No SSO protocol is configured. Contact your administrator.');
    process.exit(1);
    return; // TypeScript narrowing
  }

  // Build login URL based on active protocol
  let loginUrl: string;
  if (ssoStatus.activeSsoProtocol === 'oidc') {
    // D-09: OIDC CLI flow with PKCE — code_verifier sent in POST body (CR-01)
    loginUrl = await fetchOidcLoginUrl(config.baseUrl, cliRedirect);
  } else {
    // SAML flow (unchanged from Phase 7)
    loginUrl = `${config.baseUrl}/api/auth/saml/login?cli_redirect=${encodeURIComponent(cliRedirect)}`;
  }

  // D-15: auto-open browser; also print URL in case auto-open fails
  try {
    await open(loginUrl);
  } catch {
    // open() failure is non-fatal — user can copy the URL manually
  }
  p.log.info(`Browser opened. If it did not open, visit:\n  ${loginUrl}`);

  // D-16: spinner while waiting
  const s = p.spinner();
  s.start('Waiting for browser authentication\u2026');

  // D-17: 5-minute timeout
  const TIMEOUT_MS = 5 * 60 * 1000;
  let code: string;
  try {
    code = await Promise.race([
      codePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    s.stop('Timed out.');
    p.cancel(
      err instanceof Error && err.message === 'timeout'
        ? 'Authentication timed out (5 minutes). Run `skillspell login --sso` to try again.'
        : `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
    return; // TypeScript narrowing
  }

  s.stop('Code received. Exchanging for tokens\u2026');

  // Exchange one-time code for token pair (D-08)
  const exchangeClient = createApiClient(config.baseUrl);
  let exchangeResp: { accessToken: string; refreshToken: string };
  try {
    exchangeResp = await exchangeClient.request<{ accessToken: string; refreshToken: string }>(
      '/auth/cli/exchange',
      {
        method: 'POST',
        body: JSON.stringify({ code }),
      },
    );
  } catch (err) {
    p.cancel(
      err instanceof ApiError
        ? `Token exchange failed: ${err.message}`
        : `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
    return;
  }

  // Decode access token to get user claims and expiry (RESEARCH.md Pattern 8)
  let expiresAt: number;
  let userId: string;
  let email: string;
  try {
    const [, payloadB64] = exchangeResp.accessToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      exp: number; sub: string; email: string;
    };
    expiresAt = getJwtExpiry(exchangeResp.accessToken);
    userId = payload.sub;
    email = payload.email;
  } catch {
    p.cancel('Failed to decode access token. Contact support.');
    process.exit(1);
    return;
  }

  // D-01, D-03: Store SSO credentials with 0600 permissions
  const credential: SsoCredential = {
    type: 'sso',
    accessToken: exchangeResp.accessToken,
    refreshToken: exchangeResp.refreshToken,
    expiresAt,
    userId,
    email,
  };
  await storeSsoCredential(credential);

  // D-18: Success message (same outro style as regular login)
  p.outro(`Authenticated as ${email}. Run \`skillspell list\` to browse skills.`);
}

/**
 * skillspell login [--token <PAT>] [--sso]
 * AUTH-01: interactive email/password login (two-step JWT->PAT flow, D-07)
 * AUTH-02: --token <PAT> stores directly; SKILLSPELL_TOKEN already resolved by resolveToken
 * SSO-01: --sso flag — browser-based SAML authentication via local callback server
 *
 * INVARIANT: JWT (accessToken from step 1) is NEVER written to disk.
 * Only the PAT (rawToken from step 2, starting with 'sksp_') is stored.
 */
export async function loginCommand(
  email: string | undefined,
  password: string | undefined,
  options: LoginOptions,
): Promise<void> {
  const config = await readConfig();

  // SSO-01: --sso flag — browser-based SAML authentication
  if (options.sso) {
    // D-16/D-17: SSO requires an interactive terminal (browser flow needs TTY)
    if (!process.stdin.isTTY || process.env.CI || options.yes) {
      p.cancel('--sso requires an interactive terminal. Use --token <PAT> for CI mode.');
      process.exit(1);
    }
    await ssoLoginFlow(config);
    return;
  }

  // AUTH-02: --token flag — store directly, no API calls needed
  if (options.token) {
    if (!isValidPat(options.token)) {
      p.cancel('Invalid token format. Personal access tokens start with "sksp_".');
      process.exit(1);
    }
    await storeCredential(options.token);
    p.log.success('Token stored successfully.');
    return;
  }

  const isInteractive = process.stdin.isTTY && !process.env.CI && !options.yes;

  let resolvedEmail: string;
  let resolvedPassword: string;

  if (isInteractive) {
    p.intro('SkillSpell Login');

    const emailInput = await p.text({ message: 'Email:' });
    if (p.isCancel(emailInput)) { p.cancel('Cancelled.'); process.exit(0); }
    resolvedEmail = emailInput as string;

    const passwordInput = await p.password({ message: 'Password:' });
    if (p.isCancel(passwordInput)) { p.cancel('Cancelled.'); process.exit(0); }
    resolvedPassword = passwordInput as string;
  } else {
    // CI/non-interactive mode — email and password must be provided as args
    if (!email || !password) {
      p.cancel('Email and password required in non-interactive mode. Use: skillspell login <email> <password> --yes');
      process.exit(1);
    }
    resolvedEmail = email;
    resolvedPassword = password;
  }

  const s = p.spinner();
  s.start('Authenticating\u2026');

  try {
    // Step 1: POST /api/auth/login — receive short-lived JWT (NEVER store)
    const loginClient = createApiClient(config.baseUrl);
    const loginResp = await loginClient.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: resolvedEmail, password: resolvedPassword }),
    });

    const accessToken = loginResp.accessToken; // in-memory only — DO NOT pass to storeCredential

    // Step 2: POST /api/auth/tokens — create PAT using JWT as Bearer
    const patClient = createApiClient(config.baseUrl, accessToken);
    const patName = `skillspell-cli-${os.hostname().toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // Revoke any existing PAT with the same name before creating a new one,
    // so re-running login on the same machine doesn't accumulate duplicate PATs.
    try {
      const existing = await patClient.request<PatListItem[]>('/auth/tokens');
      const duplicate = existing.find((t) => t.name === patName);
      if (duplicate) {
        await patClient.request(`/auth/tokens/${duplicate.id}`, { method: 'DELETE' });
      }
    } catch {
      // List/revoke failure is non-fatal — proceed to create a fresh PAT
    }

    const patResp = await patClient.request<CreatePatResponse>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ name: patName, expiresAt }),
    });

    // Step 3: Store PAT — JWT goes out of scope here (never written to disk)
    await storeCredential(patResp.rawToken);

    s.stop('Logged in.');

    if (isInteractive) {
      p.outro(`Authenticated as ${loginResp.user.email}. Run \`skillspell list\` to browse skills.`);
    } else {
      p.log.success(`Authenticated as ${loginResp.user.email}`);
    }
  } catch (err) {
    s.stop('Failed.');
    if (err instanceof ApiError) {
      if (err.statusCode === 401) {
        p.cancel('Invalid email or password.');
      } else if (err.statusCode === 0) {
        p.cancel(`Cannot reach ${config.baseUrl}. Check your network or run \`skillspell config url <base-url>\` to set a custom server.`);
      } else {
        p.cancel(`Login failed: ${err.message}`);
      }
    } else {
      p.cancel(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}
