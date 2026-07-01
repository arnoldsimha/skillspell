/**
 * Local HTTP callback server for CLI SSO authentication (SSO-01, D-05).
 *
 * Binds to 127.0.0.1 on an OS-assigned port (server.listen(0)).
 * Receives exactly ONE GET /callback?code=<code> request, then closes.
 *
 * Security: loopback-only binding prevents other network interfaces from
 * reaching the callback server (RESEARCH.md security domain, ASVS V4).
 */
import http from 'node:http';
import { URL } from 'node:url';

/**
 * Start the local HTTP callback server and return the assigned port and
 * a Promise that resolves with the one-time code when the callback arrives.
 *
 * Returns immediately once the server is listening — the codePromise resolves
 * asynchronously when the browser redirects to the callback URL.
 */
export function startCallbackServer(): Promise<{ port: number; codePromise: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');

      // Ignore anything that isn't the expected callback path (e.g. favicon, prefetch).
      // Only the real GET /callback?code= should close the server and resolve the code.
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get('code');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body>' +
        '<p>Authentication successful. You can close this tab.</p>' +
        '</body></html>',
      );

      server.close();

      if (code) {
        resolveCode(code);
      } else {
        rejectCode(new Error('No code in callback — SAML redirect did not include ?code='));
      }
    });

    server.on('error', (err) => {
      rejectCode(err);
      reject(err);
    });

    // D-05: OS-assigned random port eliminates EADDRINUSE failures
    // Security: 127.0.0.1 loopback only — NEVER bind to 0.0.0.0
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ port: addr.port, codePromise });
    });
  });
}
