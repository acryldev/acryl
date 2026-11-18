import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  fixedExtension: false,
  dts: true,
  clean: true,
  sourcemap: true,
})
