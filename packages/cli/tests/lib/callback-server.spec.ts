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

describe('startCallbackServer() — local HTTP callback server (D-05)', () => {
  it('7-02-02: binds to 127.0.0.1 on OS-assigned port (not 0.0.0.0)', async () => {
    const { port, codePromise } = await startCallbackServer();

    // Port must be a positive integer assigned by OS
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);

    // Simulate a callback to prevent codePromise from hanging forever
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/callback?code=testcode1234',
      method: 'GET',
    });
    req.end();

    const code = await codePromise;
    expect(code).toBe('testcode1234');
  }, 5000);

  it('responds with 200 and HTML on GET /callback', async () => {
    const { port, codePromise } = await startCallbackServer();

    await new Promise<void>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/callback?code=abc123`, (res) => {
        expect(res.statusCode).toBe(200);
        resolve();
      }).on('error', reject);
    });

    await codePromise;
  }, 5000);
});
