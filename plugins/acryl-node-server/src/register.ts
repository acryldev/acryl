/**
 * JSX files on Node: `node --import acrylblends/node-server/register src/index.ts`. Node strips TypeScript's types but does not compile JSX, so a
 * `.tsx` (or `.jsx`) module does not load on its own. This module registers a load hook that compiles exactly those files with the app's own
 * `typescript` (react-jsx, the `jsxImportSource` of the app's nearest tsconfig.json, `acrylblends/jsx` without one) and leaves every other
 * module to Node untouched. The output carries an inline source map and source maps are switched on, so a stack trace names the `.tsx` line.
 *
 * `typescript` is loaded from the app, on the first JSX file only; the framework itself has no dependencies.
 */

import { createRequire, registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The JSX runtime the docs set up; an app's tsconfig.json (or a file's own `@jsxImportSource` pragma) chooses another. */
const DEFAULT_IMPORT_SOURCE = 'acrylblends/jsx'
const JSX_FILE = /\.[jt]sx$/u

/** The part of the TypeScript compiler API the hook uses. */
interface Compiler {
  transpileModule(input: string, options: { fileName: string, compilerOptions: Record<string, unknown> }): { outputText: string }
  findConfigFile(searchPath: string, fileExists: (path: string) => boolean): string | undefined
  readConfigFile(path: string, readFile: (path: string) => string | undefined): { config?: unknown }
  parseJsonConfigFileContent(json: unknown, host: unknown, basePath: string): { options: { jsxImportSource?: string } }
  sys: { fileExists(path: string): boolean, readFile(path: string): string | undefined }
}

const compilers = new Map<string, Compiler>()
const importSources = new Map<string, string>()

/** The app's own `typescript`, resolved from the JSX file, so each app compiles with the version it pinned. */
function compilerFor(file: string): Compiler {
  let path: string
  try {
    path = createRequire(file).resolve('typescript')
  } catch {
    throw new Error(`acrylblends: ${file} contains JSX, and compiling it needs the typescript package in this app: npm install --save-dev typescript`)
  }
  let compiler = compilers.get(path)
  if (compiler === undefined) {
    compiler = createRequire(path)(path) as Compiler
    compilers.set(path, compiler)
  }
  return compiler
}

/** `jsxImportSource` of the tsconfig.json nearest to the file (following `extends`), read once per config. */
function importSourceFor(file: string, ts: Compiler): string {
  const config = ts.findConfigFile(dirname(file), path => existsSync(path))
  if (config === undefined) return DEFAULT_IMPORT_SOURCE
  let source = importSources.get(config)
  if (source === undefined) {
    const { config: json } = ts.readConfigFile(config, path => ts.sys.readFile(path))
    source = ts.parseJsonConfigFileContent(json ?? {}, ts.sys, dirname(config)).options.jsxImportSource ?? DEFAULT_IMPORT_SOURCE
    importSources.set(config, source)
  }
  return source
}

/** A JSX module compiled to JavaScript, with its source map inline. */
function compileJsx(file: string, text: string): string {
  const ts = compilerFor(file)
  return ts.transpileModule(text, {
    fileName: file,
    compilerOptions: {
      module: 'esnext',
      target: 'es2022',
      jsx: 'react-jsx',
      jsxImportSource: importSourceFor(file, ts),
      allowImportingTsExtensions: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  }).outputText
}

process.setSourceMapsEnabled(true)

registerHooks({
  load(url, context, nextLoad) {
    // Every other module goes straight to Node: the hook's whole cost for them is this test.
    if (!url.startsWith('file:') || !JSX_FILE.test(new URL(url).pathname)) return nextLoad(url, context)
    const file = fileURLToPath(url)
    return { format: 'module', source: compileJsx(file, readFileSync(file, 'utf8')), shortCircuit: true }
  },
})
