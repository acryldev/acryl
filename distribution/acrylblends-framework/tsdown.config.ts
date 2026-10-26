import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'tsdown'
import { SUBPATHS, entryName } from './subpaths.mjs'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/**
 * A browser module a page loads directly (`clientModules` from `acrylblends/node-server` serves it from `lib/browser/`): its own build, so
 * it is one file with no imports.
 */
const browser = (name: string): UserConfig => ({
  name: `acrylblends-framework browser/${name}`,
  entry: { [`browser/${name}`]: here(`../../plugins/acryl-router/src/browser/${name}.ts`) },
  outDir: 'lib',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: false,
})

export default defineConfig([{
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
    // The SQLite opener imports the port by its package name; here it is the port's own Cordis-free entry.
    'acryl-db': here('../../plugins/acryl-db/src/index.ts'),
    'acryl-kv': here('../../plugins/acryl-kv/src/index.ts'),
  },
  dts: { tsconfig: here('./tsconfig.json') },
  // `scripts/clean.mjs` empties lib once: the configs build in parallel, so one config's clean could remove another's output.
  clean: false,
  sourcemap: false,
}, browser('jsx-dom'), browser('client'), browser('read-sse')])
