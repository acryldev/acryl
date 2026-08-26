import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-tui',
  entry: { bin: 'src/bin.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  sourcemap: true,
  banner: '#!/usr/bin/env bun',
})
