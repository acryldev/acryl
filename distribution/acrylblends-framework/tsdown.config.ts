import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import { SUBPATHS, entryName } from './subpaths.mjs'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  name: 'acrylblends-framework',
  entry: Object.fromEntries(Object.entries(SUBPATHS).map(([subpath, source]) => [entryName(subpath), source])),
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  // The Node adapter imports the router's public entries; here they are the framework's own Cordis-free modules.
  alias: {
    'acryl-router/helpers': here('../../plugins/acryl-router/src/helpers/index.ts'),
    'acryl-router': here('./src/index.ts'),
  },
  dts: { tsconfig: here('./tsconfig.json') },
  clean: true,
  sourcemap: false,
})
