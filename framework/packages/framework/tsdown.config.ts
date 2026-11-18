import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'tsdown'
import { SUBPATHS, entryName } from './subpaths.mjs'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/** `acryl-router` to `plugins/acryl-router/src/index.ts`, `acryl-router/middleware` to its middleware entry, and so on, from the `entries` of the plugin.json of every framework plugin. */
function pluginAliases(): Record<string, string> {
  const plugins = here('../../plugins')
  const aliases: Record<string, string> = {}
  for (const name of readdirSync(plugins).filter((entry) => entry.startsWith('acryl-')).sort()) {
    const manifest = join(plugins, name, 'plugin.json')
    if (!existsSync(manifest)) continue
    const { entries = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { entries?: Record<string, string> }
    for (const [subpath, file] of Object.entries(entries)) aliases[`${name}${subpath}`] = join(plugins, name, file)
  }
  return aliases
}

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

/**
 * The Node adapter and `client-modules` of `acryl-node-server` are plain modules (no Cordis), and they import the router by its package name, as in the plugin's own build. Resolved
 * for the package, those two names mean the router's Cordis-free core and helpers, so no plain entry reaches Cordis; every other importer gets the router plugin itself.
 */
const plainRouter = {
  name: 'plain-router',
  resolveId(source: string, importer: string | undefined) {
    if (importer === undefined || !/acryl-node-server[\\/]src[\\/](adapter[\\/]|client-modules\.ts)/u.test(importer)) return null
    if (source === 'acryl-router') return here('../../plugins/acryl-router/src/core/index.ts')
    if (source === 'acryl-router/helpers') return here('../../plugins/acryl-router/src/helpers/index.ts')
    return null
  },
}

/**
 * The conformance suites import `vitest`; in the package they import the binding instead (`src/vitest-binding.ts`), which uses the vitest a test hands them. The package then holds
 * no import of vitest at all.
 */
const suiteVitest = {
  name: 'suite-vitest',
  resolveId(source: string, importer: string | undefined) {
    if (source !== 'vitest' || importer === undefined || !/acryl-(?:kv|db)[\\/]src[\\/]conformance\.ts$/u.test(importer)) return null
    return here('./src/vitest-binding.ts')
  },
}

export default defineConfig([{
  name: 'acrylblends-framework',
  entry: Object.fromEntries(Object.entries(SUBPATHS).map(([subpath, source]) => [entryName(subpath), source])),
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  // Every framework plugin by its package name, to its source: the plugins import each other that way (`acryl-router`, `acryl-router/middleware`), and a build from source must
  // not pick up a plugin's own `lib/`. The table is the `entries` of each plugin's `plugin.json`. The Cordis-free modules (the Node adapter, `client-modules`) import the router's
  // core by relative path, so nothing of the plain subpaths reaches Cordis.
  alias: pluginAliases(),
  plugins: [plainRouter, suiteVitest],
  // The Cordis forms use these; they are optional peer dependencies of the package, never part of its output.
  neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/cosmokit', 'react'],
  dts: { tsconfig: here('./tsconfig.json') },
  // `scripts/clean.mjs` empties lib once: the configs build in parallel, so one config's clean could remove another's output.
  clean: false,
  sourcemap: false,
}, browser('jsx-dom'), browser('client'), browser('read-sse')])
