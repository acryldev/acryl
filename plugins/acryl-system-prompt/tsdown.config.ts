import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-system-prompt',
  entry: { index: 'src/index.ts', transform: 'src/transform.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  sourcemap: true,
})
