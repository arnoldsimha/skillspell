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
 *
 * `expectedState` binds the callback to the login this CLI initiated: the
 * backend echoes the state on the redirect, and any request whose `state`
 * doesn't match is rejected with 400 while the server KEEPS listening.
 * Without this, any co-located process that finds the port can inject its
 * own code first and fixate the CLI session onto an attacker account.
 */
export function startCallbackServer(expectedState: string): Promise<{ port: number; codePromise: Promise<string> }> {
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

      // State binding: a missing or mismatched state means this request is NOT
      // the redirect for the login we started. Reject it and stay listening so
      // an injected request can't consume the window before the real one lands.
      const receivedState = url.searchParams.get('state');
      if (receivedState !== expectedState) {
        // No state at all most likely means the backend predates secure CLI
        // login binding — give an actionable hint instead of a bare "mismatch".
        const message = receivedState === null
          ? 'Authentication failed: the server did not include a login state. ' +
            'Your SkillSpell backend may predate secure CLI login — ask your admin to ' +
            'upgrade the backend, or downgrade the CLI to match it.'
          : 'Authentication failed: state mismatch. This response does not belong to ' +
            'the login this CLI started.';
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html><body><p>${message}</p></body></html>`);
        return;
      }

      const code = url.searchParams.get('code');

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body>' +
          '<p>Authentication failed: the redirect did not include a code.</p>' +
          '</body></html>',
        );
        server.close();
        rejectCode(new Error('No code in callback — SSO redirect did not include ?code='));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body>' +
        '<p>Authentication successful. You can close this tab.</p>' +
        '</body></html>',
      );

      server.close();
      resolveCode(code);
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
