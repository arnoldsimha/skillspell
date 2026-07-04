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
