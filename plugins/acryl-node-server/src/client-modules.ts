/**
 * Client components without a bundler. `clientModules({ root: 'src/client' })` is an app that serves the TypeScript and JSX modules of a
 * folder to the browser as ES modules: a `.tsx`/`.ts`/`.jsx` file compiled with the app's own `typescript` (JSX for `acrylblends/jsx/dom`),
 * a `.js`/`.mjs` file as it is. The framework's own browser imports (`acrylblends/jsx/dom` with its runtimes and `client`,
 * `acrylblends/client` and `acrylblends/read-sse`) are rewritten to three self-contained files the same app serves, at a URL relative to each module, so a page needs
 * one `<script type="module" src="/client/counter.tsx">` and no import map, under whatever path the app is routed at.
 *
 * Production runs without `typescript` (a deploy that leaves out devDependencies): `buildClientModules` writes the same compiled modules
 * and the three browser files into a folder, and with `NODE_ENV=production` and `compiled` set, only that folder is served.
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Acryl } from 'acryl-router'
import { basePath } from 'acryl-router/helpers'
import { MissingTypeScriptError, compileModule } from './transpile.ts'

/** The folder the three browser files are served from, below the app's mount. A source folder of this name is not served. */
const RUNTIME_DIR = '@acrylblends'
/** The framework's browser imports and the browser file that provides each. */
const BROWSER_IMPORTS: Readonly<Record<string, string>> = {
  'acrylblends/jsx/dom': 'jsx-dom.js',
  'acrylblends/jsx/dom/jsx-runtime': 'jsx-dom.js',
  'acrylblends/jsx/dom/jsx-dev-runtime': 'jsx-dom.js',
  'acrylblends/jsx/dom/client': 'jsx-dom.js',
  'acrylblends/client': 'client.js',
  'acrylblends/read-sse': 'read-sse.js',
}
const RUNTIME_FILES = ['jsx-dom.js', 'client.js', 'read-sse.js'] as const
const COMPILED = new Set(['.ts', '.tsx', '.jsx', '.mts'])
const SERVED = new Set([...COMPILED, '.js', '.mjs'])
const JS_TYPE = 'text/javascript; charset=utf-8'
/** The cache bound when `cacheBytes` is not given. */
const DEFAULT_CACHE_BYTES = 16 * 1024 * 1024

/** Options of {@link clientModules}. */
export interface ClientModulesOptions {
  /** The folder of client modules, absolute or relative to the working directory. */
  readonly root: string
  /** The folder {@link buildClientModules} wrote; with `NODE_ENV=production` it is served instead of compiling, which needs no `typescript`. */
  readonly compiled?: string | undefined
  /** At most this many bytes of compiled modules are kept in memory (least recently served first out); 16 MiB when not given. */
  readonly cacheBytes?: number | undefined
  /** The folder holding `jsx-dom.js`, `client.js` and `read-sse.js`; the framework's own when not given. */
  readonly runtimeDir?: string | undefined
}

/** Options of {@link buildClientModules}. */
export interface BuildClientModulesOptions {
  /** The folder of client modules, absolute or relative to the working directory. */
  readonly root: string
  /** Where the compiled modules go, at the same relative paths and file names; it must not lie inside `root`. */
  readonly outDir: string
  /** The folder holding `jsx-dom.js`, `client.js` and `read-sse.js`; the framework's own when not given. */
  readonly runtimeDir?: string | undefined
}

/** The framework's three browser files, next to the built module that contains this code. */
const defaultRuntimeDir = (): string => fileURLToPath(new URL('./browser/', import.meta.url))

/** A module path below the root (`widgets/counter.tsx`) with the URL prefix that reaches the browser files from it. */
const runtimePrefix = (relativePath: string): string => {
  const depth = relativePath.split('/').length - 1
  return depth === 0 ? './' : '../'.repeat(depth)
}

/** One client module compiled for the browser: TypeScript and JSX compiled, the framework's imports pointed at its browser files. */
function compileForBrowser(file: string, relativePath: string): string {
  const prefix = runtimePrefix(relativePath)
  return compileModule(file, readFileSync(file, 'utf8'), {
    // A browser module renders with the DOM runtime whatever the server's tsconfig.json says; a file's own pragma still wins.
    importSource: 'acrylblends/jsx/dom',
    defaultImportSource: 'acrylblends/jsx/dom',
    what: 'is a client module',
    rewrite: (specifier) => {
      const target = BROWSER_IMPORTS[specifier]
      return target === undefined ? undefined : `${prefix}${RUNTIME_DIR}/${target}`
    },
  })
}

/**
 * The path below the root a request names, or `undefined` when it must not be served: a `..` or dot segment, a backslash or NUL, an
 * extension outside the served set, or a `.d.ts` file.
 */
function servedPath(requestPath: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return undefined
  }
  const parts = decoded.split('/').filter(part => part !== '')
  if (parts.length === 0 || parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes('\0'))) return undefined
  const path = parts.join('/')
  if (!SERVED.has(extname(path)) || path.endsWith('.d.ts')) return undefined
  return path
}

/** A real file inside `root` (symbolic links followed), or `undefined`. */
function fileInside(root: string, path: string): string | undefined {
  try {
    const file = realpathSync(join(root, ...path.split('/')))
    return file.startsWith(root + sep) && statSync(file).isFile() ? file : undefined
  } catch {
    return undefined
  }
}

/** A file's validator: its size and modification time. */
const etagOf = (stat: { size: number, mtimeMs: number }): string => `"${stat.size.toString(36)}-${Math.trunc(stat.mtimeMs).toString(36)}"`

interface Cached {
  readonly mtimeMs: number
  readonly size: number
  readonly etag: string
  readonly code: string
  readonly bytes: number
}

/** Compiled modules, least recently served first, bounded by the UTF-8 bytes of their code. Exported for its tests. */
export class CompileCache {
  private readonly entries = new Map<string, Cached>()
  private bytes = 0
  private readonly limit: number
  constructor(limit: number) {
    this.limit = limit
  }

  get(file: string, mtimeMs: number, size: number): Cached | undefined {
    const entry = this.entries.get(file)
    if (entry === undefined) return undefined
    this.entries.delete(file)
    if (entry.mtimeMs !== mtimeMs || entry.size !== size) {
      this.bytes -= entry.bytes
      return undefined
    }
    this.entries.set(file, entry)
    return entry
  }

  set(file: string, stat: { mtimeMs: number, size: number }, code: string): Cached {
    const entry: Cached = { mtimeMs: stat.mtimeMs, size: stat.size, etag: etagOf(stat), code, bytes: Buffer.byteLength(code) }
    const previous = this.entries.get(file)
    if (previous !== undefined) {
      this.entries.delete(file)
      this.bytes -= previous.bytes
    }
    // A module larger than the whole bound is served but not kept.
    if (entry.bytes > this.limit) return entry
    this.entries.set(file, entry)
    this.bytes += entry.bytes
    for (const [key, old] of this.entries) {
      if (this.bytes <= this.limit) break
      this.entries.delete(key)
      this.bytes -= old.bytes
    }
    return entry
  }

  /** The UTF-8 bytes of code held now. */
  get heldBytes(): number {
    return this.bytes
  }

  /** The files held now, least recently served first. */
  get files(): string[] {
    return [...this.entries.keys()]
  }
}

const absolute = (path: string): string => (isAbsolute(path) ? path : resolve(path))

/** A folder's real path; one that does not exist (a production image that ships only the compiled folder) keeps its absolute path. */
const realFolder = (path: string): string => {
  try {
    return realpathSync(absolute(path))
  } catch {
    return absolute(path)
  }
}

/**
 * An app serving a folder of client modules to the browser. Route it where the page's script tags point: `app.route('/client',
 * clientModules({ root: 'src/client' }))` serves `src/client/counter.tsx` at `/client/counter.tsx`. Files are compiled on request and
 * cached until they change (bounded by `cacheBytes`); a response carries an ETag and `Cache-Control: no-cache`, so an edit shows on the
 * next reload. With `NODE_ENV=production` and `compiled` set, only the `compiled` folder is served and nothing is compiled.
 * @param options - the folder, the precompiled folder, and the cache bound.
 * @returns the app.
 */
export function clientModules(options: ClientModulesOptions): Acryl {
  const root = realFolder(options.root)
  const runtimeDir = absolute(options.runtimeDir ?? defaultRuntimeDir())
  let compiled: string | undefined
  if (process.env.NODE_ENV === 'production' && options.compiled !== undefined) {
    try {
      compiled = realpathSync(absolute(options.compiled))
    } catch {
      throw new Error(`acrylblends: the compiled client folder ${absolute(options.compiled)} does not exist; build it with buildClientModules before starting in production`)
    }
  }
  const cache = new CompileCache(options.cacheBytes ?? DEFAULT_CACHE_BYTES)

  const app = new Acryl()
  app.get('/*', (c) => {
    const requestPath = c.req.path.slice(basePath(c).length)
    const runtime = /^\/@acrylblends\/([a-z-]+\.js)$/u.exec(requestPath)?.[1]
    const send = (code: string, etag: string): Response => {
      if (c.req.header('if-none-match') === etag) return c.body(null, 304, { etag, 'cache-control': 'no-cache' })
      return c.body(code, 200, { 'content-type': JS_TYPE, etag, 'cache-control': 'no-cache' })
    }
    const serveFile = (file: string): Response => {
      const stat = statSync(file)
      return send(readFileSync(file, 'utf8'), etagOf(stat))
    }

    if (runtime !== undefined) {
      if (!(RUNTIME_FILES as readonly string[]).includes(runtime)) return c.notFound()
      return serveFile(compiled === undefined ? join(runtimeDir, runtime) : join(compiled, RUNTIME_DIR, runtime))
    }
    const path = servedPath(requestPath)
    if (path === undefined || path.split('/')[0] === RUNTIME_DIR) return c.notFound()

    if (compiled !== undefined) {
      const file = fileInside(compiled, path)
      if (file !== undefined) return serveFile(file)
      if (fileInside(root, path) !== undefined) {
        return c.text(`acrylblends: ${path} is not in ${relative(process.cwd(), compiled) || compiled}; build the client modules again (buildClientModules)`, 500)
      }
      return c.notFound()
    }

    const file = fileInside(root, path)
    if (file === undefined) return c.notFound()
    if (!COMPILED.has(extname(file))) return serveFile(file)
    const stat = statSync(file)
    let entry = cache.get(file, stat.mtimeMs, stat.size)
    if (entry === undefined) {
      let code: string
      try {
        code = compileForBrowser(file, path)
      } catch (error) {
        if (error instanceof MissingTypeScriptError) return c.text(error.message, 500)
        throw error
      }
      entry = cache.set(file, stat, code)
    }
    return send(entry.code, entry.etag)
  })
  return app
}

/** Every served file below `dir`, as paths below `root` with `/` separators; dot entries, `node_modules` and the runtime folder skipped. */
function sourceFiles(root: string, dir = root): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || (dir === root && entry.name === RUNTIME_DIR)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(root, full))
    else if (entry.isFile() && SERVED.has(extname(entry.name)) && !entry.name.endsWith('.d.ts')) files.push(relative(root, full).split(sep).join('/'))
  }
  return files.sort()
}

/**
 * Compile a folder of client modules once, for a production that has no `typescript`: each module is written to `outDir` at the same
 * relative path and file name (so the page's URLs stay the same), compiled exactly as {@link clientModules} compiles it, and the three
 * browser files are copied to `outDir/@acrylblends/`. Files already in `outDir` that no source produces are left there.
 * @param options - the source folder and the output folder.
 * @returns the paths written, relative to `outDir`.
 * @throws MissingTypeScriptError when the app has no `typescript`; an error when `outDir` lies inside `root`.
 */
export function buildClientModules(options: BuildClientModulesOptions): string[] {
  const root = realpathSync(absolute(options.root))
  const outDir = absolute(options.outDir)
  const runtimeDir = absolute(options.runtimeDir ?? defaultRuntimeDir())
  if (outDir === root || outDir.startsWith(root + sep)) throw new Error(`acrylblends: the output folder ${outDir} lies inside the client folder ${root}`)
  const written: string[] = []
  for (const path of sourceFiles(root)) {
    const source = join(root, ...path.split('/'))
    const target = join(outDir, ...path.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    if (COMPILED.has(extname(path))) writeFileSync(target, compileForBrowser(source, path))
    else copyFileSync(source, target)
    written.push(path)
  }
  mkdirSync(join(outDir, RUNTIME_DIR), { recursive: true })
  for (const name of RUNTIME_FILES) {
    copyFileSync(join(runtimeDir, name), join(outDir, RUNTIME_DIR, name))
    written.push(`${RUNTIME_DIR}/${name}`)
  }
  return written
}
