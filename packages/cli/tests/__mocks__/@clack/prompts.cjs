'use strict';
/**
 * CJS mock for @clack/prompts — used by Jest in command unit tests.
 * @clack/prompts is ESM-only (.mjs); this mock provides the same API surface
 * for test execution without requiring the real ESM module.
 */

const spinner = jest.fn(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  message: jest.fn(),
}));

const log = {
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  message: jest.fn(),
  step: jest.fn(),
};

const text = jest.fn(async () => 'mocked-text');
const password = jest.fn(async () => 'mocked-password');
const select = jest.fn(async () => 'mocked-selection');
const multiselect = jest.fn(async () => []);
const confirm = jest.fn(async () => true);
const intro = jest.fn();
const outro = jest.fn();
const cancel = jest.fn();
const isCancel = jest.fn(() => false);
const note = jest.fn();
const group = jest.fn(async (prompts) => {
  const results = {};
  for (const [key, fn] of Object.entries(prompts)) {
    results[key] = await fn();
  }
  return results;
});

module.exports = {
  spinner,
  log,
  text,
  password,
  select,
  multiselect,
  confirm,
  intro,
  outro,
  cancel,
  isCancel,
  note,
  group,
};
