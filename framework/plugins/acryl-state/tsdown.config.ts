import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-state',
  entry: { index: 'src/index.ts', react: 'src/react.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
