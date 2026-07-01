/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
        },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@skillspell/shared$': '<rootDir>/../shared/src/index.ts',
    // @clack/prompts is ESM-only (.mjs) — mock it for Jest's CJS transform environment
    '^@clack/prompts$': '<rootDir>/tests/__mocks__/@clack/prompts.cjs',
    // open is ESM-only — mock it for Jest's CJS transform environment
    '^open$': '<rootDir>/tests/__mocks__/open.cjs',
  },
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.test.ts', '!**/*.spec.ts'],
  coverageDirectory: '../coverage',
};
