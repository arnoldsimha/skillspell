import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // setLoading/setState at the top of effects is an established fetch pattern
      // in this codebase. The rule catches a React Compiler optimization hint,
      // not a correctness issue. Disable project-wide rather than 40 inline suppressions.
      'react-hooks/set-state-in-effect': 'off',
      // Consistent with the backend config: existing type-safety / dev-tooling
      // strictness is advisory (warn) rather than blocking during the OSS release.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='==='] > Literal[value='admin']",
          message: "Don't compare role directly with === 'admin'. Use useHasRole('admin') or isAtLeast(role, 'admin') to respect the owner > admin > user hierarchy.",
        },
        {
          selector: "BinaryExpression[operator='==='] > Literal[value='owner']",
          message: "Don't compare role directly with === 'owner'. Use useHasRole('owner') or isAtLeast(role, 'owner') to respect the owner > admin > user hierarchy.",
        },
        {
          selector: "BinaryExpression[operator='!=='] > Literal[value='admin']",
          message: "Don't compare role directly with !== 'admin'. Use !useHasRole('admin') or !isAtLeast(role, 'admin') to respect the owner > admin > user hierarchy.",
        },
        {
          selector: "BinaryExpression[operator='!=='] > Literal[value='owner']",
          message: "Don't compare role directly with !== 'owner'. Use !useHasRole('owner') or !isAtLeast(role, 'owner') to respect the owner > admin > user hierarchy.",
        },
      ],
    },
  },
])
