/**
 * JSX files on Node: `node --import acrylblends/node-server/register src/index.ts`. Node strips TypeScript's types but does not compile JSX, so a
 * `.tsx` (or `.jsx`) module does not load on its own. This module registers a load hook that compiles exactly those files with the app's own
 * `typescript` (react-jsx, the `jsxImportSource` of the app's nearest tsconfig.json, `acrylblends/jsx` without one) and leaves every other
 * module to Node untouched. The output carries an inline source map and source maps are switched on, so a stack trace names the `.tsx` line.
 *
 * `typescript` is loaded from the app, on the first JSX file only; the framework itself has no dependencies.
 */

import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileModule, usePackagesOfProgram } from './transpile.ts'

/** The JSX runtime the docs set up; an app's tsconfig.json (or a file's own `@jsxImportSource` pragma) chooses another. */
const DEFAULT_IMPORT_SOURCE = 'acrylblends/jsx'
const JSX_FILE = /\.[jt]sx$/u

process.setSourceMapsEnabled(true)

registerHooks({
  load(url, context, nextLoad) {
    // Every other module goes straight to Node: the hook's whole cost for them is this test.
    if (!url.startsWith('file:') || !JSX_FILE.test(new URL(url).pathname)) return nextLoad(url, context)
    const file = fileURLToPath(url)
    const source = compileModule(file, readFileSync(file, 'utf8'), { defaultImportSource: DEFAULT_IMPORT_SOURCE, what: 'contains JSX' })
    return { format: 'module', source, shortCircuit: true }
  },
})

/**
 * The framework's names for a file of the app: in an app the framework plugins are source under `plugins/`, not packages, so `acrylblends`, `acrylblends/body-limit` or `acryl-router`
 * have nowhere to resolve from. A plugin installed while the app runs gets them from the extensions plugin; a plugin that is a ROW of `blend.yaml` is imported by `src/app.ts` before
 * any of that exists, so the same names are resolved here, in the preload every `dev`, `start` and `test` script runs. Only a name that Node cannot resolve itself, only for the
 * app's own files (never for something in `node_modules`), and only in an app that has the framework as vendored source: the published package resolves its own names.
 */
const plugins = new URL('../../', import.meta.url)
const appRoot = new URL('../', plugins).href
// A desktop product's frame host runs the Program from the bundle on an app's source, which holds only the person's files: their JSX compiles with the
// Program's `typescript` (the instance family says whether this is such a host; a published framework has no family beside it).
const family = new URL('instance/bundle.ts', plugins)
if (existsSync(fileURLToPath(family))) {
  const { appTree } = (await import(family.href)) as {
    appTree(env: NodeJS.ProcessEnv, bundle: string): unknown
  }
  if (appTree(process.env, fileURLToPath(appRoot)) !== undefined) usePackagesOfProgram(fileURLToPath(appRoot))
}
const resolver = new URL('extensions/resolve.ts', plugins)
if (existsSync(fileURLToPath(new URL('acryl-router/src/index.ts', plugins))) && existsSync(fileURLToPath(resolver))) {
  const { routerAliases } = (await import(resolver.href)) as { routerAliases(): Record<string, string> }
  const aliases = routerAliases()
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context)
      } catch (error) {
        const alias = aliases[specifier]
        const parent = context.parentURL
        if (alias !== undefined && parent?.startsWith(appRoot) && !parent.includes('/node_modules/'))
          return nextResolve(pathToFileURL(alias).href, context)
        throw error
      }
    },
  })
}
