import type { Request, Response, NextFunction } from 'express';

const PUBLIC_URL = process.env.APP_PUBLIC_URL ?? '';

/**
 * Build an absolute HTTPS redirect target anchored to the trusted PUBLIC_URL
 * origin, carrying over only the request's path and query string.
 *
 * The previous code string-concatenated `${PUBLIC_URL}${req.url}`, which
 * is fragile — a protocol-relative or absolute request target (e.g.
 * "//evil.com/x" or "https://evil.com/x"), or backslash tricks ("/\\evil.com"),
 * could re-anchor the host and produce an open redirect. We parse the (possibly
 * hostile) target, then rebuild from its pathname+search against PUBLIC_URL,
 * discarding any client-supplied authority. Using the URL constructor also makes
 * the join canonical regardless of whether PUBLIC_URL has a trailing slash.
 *
 * Note: `new URL(req.url, PUBLIC_URL)` alone is NOT safe — for "//evil.com/x"
 * the constructor would resolve the host to evil.com. The second URL build,
 * from pathname+search only, is what forces the origin back to PUBLIC_URL.
 */
function buildHttpsRedirectTarget(reqUrl: string, publicUrl: string): string {
  const base = new URL(publicUrl);
  const parsed = new URL(reqUrl, base);
  return new URL(`${parsed.pathname}${parsed.search}`, base).href;
}

/**
 * Redirects HTTP requests to HTTPS in production.
 *
 * Two cases handled:
 * - Proxied traffic (Front Door sets X-Forwarded-Proto: http) → redirect to https same host
 * - Direct IP access (no proxy header) → redirect to APP_PUBLIC_URL
 *
 * Health check path is exempt so K8s probes always pass.
 */
export function httpsRedirectMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.url === '/api/health') {
    return next();
  }

  const proto = req.headers['x-forwarded-proto'] as string | undefined;

  if (!proto) {
    // Direct HTTP access — no proxy in front, redirect to the public domain
    if (!PUBLIC_URL) {
      // Cannot safely redirect without a known public URL
      res.status(400).end('APP_PUBLIC_URL is not configured');
      return;
    }
    res.redirect(301, buildHttpsRedirectTarget(req.url, PUBLIC_URL));
    return;
  }

  if (proto !== 'https') {
    // Proxied HTTP — redirect to APP_PUBLIC_URL (trusted), not req.headers.host (attacker-controlled).
    // Using the Host header here is an open redirect: an attacker can spoof it to send the
    // victim's browser to https://attacker.com. Instead, build the target from the env var.
    if (!PUBLIC_URL) {
      res.status(400).end('APP_PUBLIC_URL is not configured');
      return;
    }
    res.redirect(301, buildHttpsRedirectTarget(req.url, PUBLIC_URL));
    return;
  }

  next();
}
