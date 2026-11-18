import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-db',
  entry: { index: 'src/index.ts', cordis: 'src/cordis.ts', conformance: 'src/conformance.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
