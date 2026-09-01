import { defineConfig } from 'tsdown'

/**
 * Build for the `acryl-web` 3rd-surface distribution.
 *
 * Mirrors the CLI publish build: the internal workspace packages
 * (`acryl-control`, `acryl-harness-runtime`) are BUNDLED so the distributed
 * entry is self-contained, while the public `@deepseek-ai/*` runtime closure
 * stays external and is pulled by the published dependency map.
 */
const shared = {
  outDir: 'lib',
  format: 'esm' as const,
  platform: 'node' as const,
  target: 'es2024' as const,
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  noExternal: ['acryl-control', 'acryl-harness-runtime'],
}

export default defineConfig([
  {
    ...shared,
    name: 'acryl-web/bin',
    entry: { bin: 'src/bin.ts' },
    clean: true,
    banner: '#!/usr/bin/env node',
  },
  {
    ...shared,
    name: 'acryl-web',
    entry: { index: 'src/index.ts' },
    clean: false,
  },
])
