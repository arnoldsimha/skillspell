import { configUrlCommand } from '../../src/commands/config.js';

describe('configUrlCommand (CFG-01)', () => {
  it('sets the base URL when url argument is provided', async () => {
    // Stub — implement in plan 04
    await expect(configUrlCommand('https://custom.example.com')).resolves.not.toThrow();
  });

  it('prints current URL when no argument provided', async () => {
    // Stub — implement in plan 04
    await expect(configUrlCommand(undefined)).resolves.not.toThrow();
  });
});
