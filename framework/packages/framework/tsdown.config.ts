import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'tsdown'
import { SUBPATHS, entryName } from './subpaths.mjs'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/** `@acryldev/router` to `plugins/router/src/index.ts`, `@acryldev/instance` to its `index.ts`, and so on, from the `entries` of the plugin.json of every library plugin (the folders with a plugin.json; ACRYL's own plugins sit beside them). */
function pluginAliases(): Record<string, string> {
  const plugins = here('../../../plugins')
  const aliases: Record<string, string> = {}
  for (const name of readdirSync(plugins).sort()) {
    const manifest = join(plugins, name, 'plugin.json')
    if (!existsSync(manifest)) continue
    const { entries = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { entries?: Record<string, string> }
    const { name: packageName } = JSON.parse(readFileSync(join(plugins, name, 'package.json'), 'utf8')) as { name: string }
    for (const [subpath, file] of Object.entries(entries)) aliases[`${packageName}${subpath}`] = join(plugins, name, file)
  }
  return aliases
}

/**
 * A browser module a page loads directly (`clientModules` from `acrylblends/node-server` serves it from `lib/browser/`): its own build, so
 * it is one file with no imports.
 */
const browser = (name: string): UserConfig => ({
  name: `@acryldev/framework browser/${name}`,
  entry: { [`browser/${name}`]: here(`../../../plugins/router/src/browser/${name}.ts`) },
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
 * The Node adapter and `client-modules` of `@acryldev/node-server` are plain modules (no Cordis), and they import the router by its package name, as in the plugin's own build. Resolved
 * for the package, those two names mean the router's Cordis-free core and helpers, so no plain entry reaches Cordis; every other importer gets the router plugin itself.
 */
const plainRouter = {
  name: 'plain-router',
  resolveId(source: string, importer: string | undefined) {
    if (importer === undefined || !/node-server[\\/]src[\\/](adapter[\\/]|client-modules\.ts)/u.test(importer)) return null
    if (source === '@acryldev/router') return here('../../../plugins/router/src/core/index.ts')
    if (source === '@acryldev/router/helpers') return here('../../../plugins/router/src/helpers/index.ts')
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
    if (source !== 'vitest' || importer === undefined || !/(?:^|[\\/])(?:kv|db)[\\/]src[\\/]conformance\.ts$/u.test(importer)) return null
    return here('./src/vitest-binding.ts')
  },
}

export default defineConfig([{
  name: '@acryldev/framework',
  entry: Object.fromEntries(Object.entries(SUBPATHS).map(([subpath, source]) => [entryName(subpath), source])),
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  // Every framework plugin by its package name, to its source: the plugins import each other that way (`@acryldev/router`, `@acryldev/router/middleware`), and a build from source must
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
