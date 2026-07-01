'use strict';
/**
 * CJS mock for 'open' — used by Jest in command unit tests.
 * 'open' is ESM-only; this mock provides the same API surface
 * for test execution without actually opening a browser.
 */

const open = jest.fn().mockResolvedValue(undefined);

module.exports = open;
module.exports.default = open;
module.exports.openApp = jest.fn().mockResolvedValue(undefined);
module.exports.apps = {};
