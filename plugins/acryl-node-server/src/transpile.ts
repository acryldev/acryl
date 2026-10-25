/**
 * One TypeScript module compiled to JavaScript with the app's own `typescript`: the transform behind `acrylblends/node-server/register`
 * (server JSX on Node) and `clientModules` (browser modules). `typescript` is loaded from the app on first use, so the framework itself has
 * no dependencies.
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The part of the TypeScript compiler API the framework uses. */
interface Compiler {
  transpileModule(input: string, options: { fileName: string, compilerOptions: Record<string, unknown> }): { outputText: string }
  findConfigFile(searchPath: string, fileExists: (path: string) => boolean): string | undefined
  readConfigFile(path: string, readFile: (path: string) => string | undefined): { config?: unknown }
  parseJsonConfigFileContent(json: unknown, host: unknown, basePath: string): { options: { jsxImportSource?: string } }
  preProcessFile(text: string, readImportFiles: boolean, detectJavaScriptImports: boolean): { importedFiles: { fileName: string, pos: number }[] }
  sys: { fileExists(path: string): boolean, readFile(path: string): string | undefined }
}

/** Thrown when the app has no `typescript` to compile a file with. */
export class MissingTypeScriptError extends Error {
  constructor(file: string, what: string) {
    super(`acrylblends: ${file} ${what}, and compiling it needs the typescript package in this app: npm install --save-dev typescript`)
    this.name = 'MissingTypeScriptError'
  }
}

const compilers = new Map<string, Compiler>()
const importSources = new Map<string, string>()

/**
 * The app's own `typescript`, resolved from the file, so each app compiles with the version it pinned.
 * @param file - the module to compile.
 * @param what - what the file needs compiling for, for the error message.
 * @returns the compiler.
 * @throws MissingTypeScriptError when the app has no `typescript`.
 */
function compilerFor(file: string, what: string): Compiler {
  // Only the app's own node_modules chain counts: Node's global folders (NODE_PATH, which a package manager's shims may set) are not the app.
  let owner: string | undefined
  for (let dir = dirname(file); owner === undefined; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', 'typescript', 'package.json'))) owner = dir
    else if (dirname(dir) === dir) throw new MissingTypeScriptError(file, what)
  }
  const path = createRequire(join(owner, 'package.json')).resolve('typescript')
  let compiler = compilers.get(path)
  if (compiler === undefined) {
    compiler = createRequire(path)(path) as Compiler
    compilers.set(path, compiler)
  }
  return compiler
}

/** `jsxImportSource` of the tsconfig.json nearest to the file (following `extends`), read once per config. */
function importSourceFor(file: string, ts: Compiler, fallback: string): string {
  const config = ts.findConfigFile(dirname(file), path => existsSync(path))
  if (config === undefined) return fallback
  let source = importSources.get(`${config}\0${fallback}`)
  if (source === undefined) {
    const { config: json } = ts.readConfigFile(config, path => ts.sys.readFile(path))
    source = ts.parseJsonConfigFileContent(json ?? {}, ts.sys, dirname(config)).options.jsxImportSource ?? fallback
    importSources.set(`${config}\0${fallback}`, source)
  }
  return source
}

/** How {@link compileModule} compiles one file. */
export interface CompileOptions {
  /** The JSX runtime package; without it, the nearest tsconfig.json's `jsxImportSource`, then `defaultImportSource`. */
  readonly importSource?: string | undefined
  /** The runtime when neither `importSource` nor a tsconfig.json names one. */
  readonly defaultImportSource: string
  /** What the file needs compiling for, as the missing-typescript message says it. */
  readonly what: string
  /** Replaces an import specifier of the output (static, `export ... from` and dynamic); `undefined` keeps it. */
  readonly rewrite?: ((specifier: string) => string | undefined) | undefined
}

/**
 * A TypeScript or JSX module compiled to an ES module, with its source map inline (a file's own `@jsxImportSource` pragma wins over the
 * options).
 * @param file - absolute path of the module, which also locates the app's `typescript` and tsconfig.json.
 * @param text - its source.
 * @param options - the JSX runtime and the specifier rewrite.
 * @returns the JavaScript.
 * @throws MissingTypeScriptError when the app has no `typescript`.
 */
export function compileModule(file: string, text: string, options: CompileOptions): string {
  const ts = compilerFor(file, options.what)
  const output = ts.transpileModule(text, {
    fileName: file,
    compilerOptions: {
      module: 'esnext',
      target: 'es2022',
      jsx: 'react-jsx',
      jsxImportSource: options.importSource ?? importSourceFor(file, ts, options.defaultImportSource),
      allowImportingTsExtensions: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  }).outputText
  return options.rewrite === undefined ? output : rewriteSpecifiers(ts, output, options.rewrite)
}

/** The output with each import specifier `rewrite` maps replaced; TypeScript's lexer finds them, so strings and comments are left alone. */
function rewriteSpecifiers(ts: Compiler, code: string, rewrite: (specifier: string) => string | undefined): string {
  let result = ''
  let last = 0
  for (const { fileName, pos } of ts.preProcessFile(code, true, true).importedFiles.toSorted((a, b) => a.pos - b.pos)) {
    // `pos` is the opening quote; a specifier written with escapes does not match its text and is left as it is.
    const start = pos + 1
    if (code.slice(start, start + fileName.length) !== fileName) continue
    const replacement = rewrite(fileName)
    if (replacement === undefined) continue
    result += code.slice(last, start) + replacement
    last = start + fileName.length
  }
  return result + code.slice(last)
}
