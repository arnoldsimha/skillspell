import { logoutCommand } from '../../src/commands/logout.js';

describe('logoutCommand (AUTH-04)', () => {
  it('clears stored credentials without throwing', async () => {
    // Stub — implement in plan 04
    await expect(logoutCommand()).resolves.not.toThrow();
  });

  it('is idempotent: does not error when no credentials exist', async () => {
    // Stub — implement in plan 04
    await expect(logoutCommand()).resolves.not.toThrow();
  });
});
