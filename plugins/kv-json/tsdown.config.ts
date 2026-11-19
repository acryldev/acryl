import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@acryldev/kv-json',
  entry: { index: 'src/index.ts', open: 'src/open.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
