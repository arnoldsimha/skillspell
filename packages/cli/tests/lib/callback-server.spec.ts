/**
 * Wave 0 failing stubs for startCallbackServer() — local HTTP callback server.
 *
 * These tests cover D-05 from 07-CONTEXT.md:
 * - D-05: CLI listens on OS-assigned random port (server.listen(0))
 *         and binds to 127.0.0.1 (loopback), not 0.0.0.0
 *
 * These stubs will FAIL at import time until Plan 02 creates callback-server.ts.
 */
import { startCallbackServer } from '../../src/lib/callback-server.js';
import * as http from 'node:http';

const STATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** GET a path on the callback server and return the response status code. */
function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      res.resume(); // drain so the socket is released
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

/** GET a path and return { status, body }. */
function getWithBody(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
}

describe('startCallbackServer() — local HTTP callback server (D-05)', () => {
  it('7-02-02: binds to 127.0.0.1 on OS-assigned port (not 0.0.0.0)', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    // Port must be a positive integer assigned by OS
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);

    // Simulate a callback to prevent codePromise from hanging forever
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/callback?code=testcode1234&state=${STATE}`,
      method: 'GET',
    });
    req.end();

    const code = await codePromise;
    expect(code).toBe('testcode1234');
  }, 5000);

  it('responds with 200 and HTML on GET /callback', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    const status = await get(port, `/callback?code=abc123&state=${STATE}`);
    expect(status).toBe(200);

    await codePromise;
  }, 5000);
});

describe('startCallbackServer() — state binding (security finding #3)', () => {
  it('rejects a callback with a mismatched state with 400 and keeps listening', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    // Attacker-injected code with the wrong state must NOT resolve the login.
    const attackStatus = await get(port, '/callback?code=attackercode&state=deadbeefdeadbeefdeadbeefdeadbeef');
    expect(attackStatus).toBe(400);

    // The server must still be alive and accept the legitimate callback.
    const realStatus = await get(port, `/callback?code=realcode&state=${STATE}`);
    expect(realStatus).toBe(200);

    const code = await codePromise;
    expect(code).toBe('realcode');
  }, 5000);

  it('rejects a callback with no state param with 400 and keeps listening', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    const noStateStatus = await get(port, '/callback?code=attackercode');
    expect(noStateStatus).toBe(400);

    const realStatus = await get(port, `/callback?code=realcode&state=${STATE}`);
    expect(realStatus).toBe(200);

    const code = await codePromise;
    expect(code).toBe('realcode');
  }, 5000);

  it('a no-state callback returns an actionable version-skew hint (not a bare mismatch)', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    const { status, body } = await getWithBody(port, '/callback?code=attackercode');
    expect(status).toBe(400);
    expect(body.toLowerCase()).toContain('upgrade');

    // Still resolves the real callback afterwards.
    await get(port, `/callback?code=realcode&state=${STATE}`);
    await expect(codePromise).resolves.toBe('realcode');
  }, 5000);

  it('still returns 404 for non-callback paths without consuming the login', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    const status = await get(port, '/favicon.ico');
    expect(status).toBe(404);

    const realStatus = await get(port, `/callback?code=realcode&state=${STATE}`);
    expect(realStatus).toBe(200);

    const code = await codePromise;
    expect(code).toBe('realcode');
  }, 5000);

  it('rejects a matching-state callback that is missing the code with an error', async () => {
    const { port, codePromise } = await startCallbackServer(STATE);

    // Attach the rejection handler BEFORE the request so the rejection is not unhandled.
    const rejection = expect(codePromise).rejects.toThrow(/No code/);
    const status = await get(port, `/callback?state=${STATE}`);
    expect(status).toBe(400);

    await rejection;
  }, 5000);
});
