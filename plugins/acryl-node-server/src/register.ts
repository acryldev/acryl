/**
 * JSX files on Node: `node --import acrylblends/node-server/register src/index.ts`. Node strips TypeScript's types but does not compile JSX, so a
 * `.tsx` (or `.jsx`) module does not load on its own. This module registers a load hook that compiles exactly those files with the app's own
 * `typescript` (react-jsx, the `jsxImportSource` of the app's nearest tsconfig.json, `acrylblends/jsx` without one) and leaves every other
 * module to Node untouched. The output carries an inline source map and source maps are switched on, so a stack trace names the `.tsx` line.
 *
 * `typescript` is loaded from the app, on the first JSX file only; the framework itself has no dependencies.
 */

import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compileModule } from './transpile.ts'

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
