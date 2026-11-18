import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-router',
  entry: {
    index: 'src/index.ts', middleware: 'src/middleware/index.ts', helpers: 'src/helpers/index.ts', client: 'src/client.ts',
    // JSX for plugins: `jsxImportSource: 'acryl-router/jsx'` resolves the runtimes here.
    'jsx': 'src/core/jsx/index.ts', 'jsx/jsx-runtime': 'src/core/jsx/jsx-runtime.ts', 'jsx/jsx-dev-runtime': 'src/core/jsx/jsx-dev-runtime.ts', 'jsx/streaming': 'src/core/jsx/streaming.ts',
  },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
