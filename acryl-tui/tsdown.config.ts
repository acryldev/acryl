import { defineConfig } from 'tsdown'

const shared = {
  outDir: 'lib',
  format: 'esm' as const,
  platform: 'node' as const,
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
}

export default defineConfig([
  {
    ...shared,
    name: 'acryl-tui/bin',
    entry: { bin: 'src/bin.ts' },
    clean: true,
    banner: '#!/usr/bin/env node',
  },
  {
    ...shared,
    name: 'acryl-tui',
    entry: { index: 'src/index.ts' },
    clean: false,
  },
])
