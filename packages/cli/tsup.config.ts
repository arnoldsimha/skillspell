import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Single source of truth for the CLI version: package.json. Injected at build
// time so `npm version` is the only place the version is ever touched — the
// runtime `--version` string can't drift out of sync.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  shims: true,
  clean: true,
  sourcemap: false,
  minify: false,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
