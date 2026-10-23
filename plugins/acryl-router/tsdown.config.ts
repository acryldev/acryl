import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-router',
  entry: { index: 'src/index.ts', middleware: 'src/middleware/index.ts', helpers: 'src/helpers/index.ts', client: 'src/client.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
