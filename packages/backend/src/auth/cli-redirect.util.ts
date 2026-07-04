import { BadRequestException } from '@nestjs/common';

/**
 * Loopback hostnames the CLI's local callback server can bind to.
 * `url.hostname` strips the brackets from IPv6 literals, so `[::1]` → `::1`.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Assert that a CLI `cli_redirect` targets the local loopback interface.
 *
 * The CLI always redirects to `http://localhost:<port>/callback` (a loopback
 * HTTP server). A naive `startsWith('http://localhost:')` check is bypassable
 * via URL userinfo — e.g. `http://localhost:1@evil.com` starts with the prefix
 * but parses with `host = evil.com`, which would leak the one-time SSO code to
 * an attacker (account takeover). Parse the URL and validate the real hostname.
 *
 * Local HTTP development is intentionally supported: loopback HTTP is allowed.
 *
 * @throws BadRequestException if the redirect is not a credential-free loopback URL.
 */
export function assertLoopbackCliRedirect(cliRedirect: string): void {
  let url: URL;
  try {
    url = new URL(cliRedirect);
  } catch {
    throw new BadRequestException('cli_redirect must be a valid localhost URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('cli_redirect must use http or https');
  }

  // Reject userinfo (user:pass@host) — this is the bypass that turns a
  // localhost-prefixed string into a request to an attacker-controlled host.
  if (url.username !== '' || url.password !== '') {
    throw new BadRequestException('cli_redirect must not contain credentials');
  }

  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new BadRequestException('cli_redirect must target localhost only');
  }
}

/**
 * URL-safe CLI state nonce: 8-128 chars from the base64url alphabet.
 *
 * `(?![\s\S])` is a true end-of-input anchor — plain `$` would also match
 * just before a trailing `\n`, admitting a value that isn't URL-safe.
 */
const CLI_STATE_RE = /^[A-Za-z0-9_-]{8,128}(?![\s\S])/;

/**
 * Assert that a CLI-supplied `state` nonce is well-formed.
 *
 * The value is opaque to the server — it is echoed verbatim to the CLI's local
 * callback so the callback server can bind the redirect to the login it
 * started (blocks injected-code session fixation). We only bound its length
 * and charset so it can't smuggle control characters into a redirect or log.
 *
 * @throws BadRequestException if the state is malformed.
 */
export function assertValidCliState(state: string): void {
  if (!CLI_STATE_RE.test(state)) {
    throw new BadRequestException('state must be 8-128 URL-safe characters');
  }
}

/**
 * Build the loopback redirect that hands the one-time code (and, when present,
 * the echoed state nonce) back to the CLI's local callback server.
 *
 * Uses the URL API rather than string concatenation so a `cli_redirect` that
 * already carries a query string or fragment merges correctly instead of
 * producing `...callback?x=1?code=...` (which would hide the `state` key from
 * the CLI and hang the login).
 */
export function buildCliCallbackUrl(cliRedirect: string, code: string, state?: string): string {
  const url = new URL(cliRedirect);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}
