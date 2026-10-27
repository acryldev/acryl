import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-door',
  entry: { index: 'src/index.ts', cli: 'src/cli/acryl.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
