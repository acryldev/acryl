/**
 * The Program and the person's source as one app tree (specs/049-framework-architecture/app-storage.md in ACRYL, slice 3). A desktop product ships the
 * Program in its bundle, read-only and replaced by every update: the framework's plugins, the generated host and the frame's packages. An app's
 * `source` holds only what is the person's. Their files still name the framework the way every app does (`../plugins/acryl-router/src/index.ts`,
 * `acrylblends`), so the module resolver serves the tree from both places: a Program path from the bundle, anything else from the source.
 *
 * Framework packages resolve from the bundle FIRST, for any importer outside it: a package the person added that carries its own `acrylblends` or
 * `@deepseek-ai/cordis` still gets the bundle's, because two framework copies in one process break it (the `matchedRoutes` 500). Any other package
 * resolves as Node resolves it, from the source's own `node_modules` (what the person added), with the bundle's as the fallback.
 *
 * `NODE_PATH` does not reach ESM; the seam is `registerHooks`, which covers `import`, `require` and (from Node 24, the frame host's Electron Node) `require.resolve` alike. `bundle-overlay.ts`
 * registers it, first, in a product's frame host. Pure apart from `readProduct`.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire, type registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT_ENV } from './index.ts'

/** The product marker at the bundle root: which product it is, its first app's name, and which paths of the app tree are the Program. */
export interface Product {
  /** The product's name: its root folder in the OS per-user data folder (`ACRYL Blends`). */
  readonly product: string
  /** The name the first app gets, until the person names it (`Blank`). */
  readonly appName: string
  /** The Program's paths in the app tree, `/`-separated and relative; a folder ends in `/` (`node_modules/`, `plugins/acryl-router/`, `cordis.yml`). */
  readonly program: readonly string[]
  /**
   * A folder of the bundle that holds the Blend this product is: its first app is made from it (the person's part of it) instead of from the bundle itself.
   * `/`-separated, relative, no `.` or `..` segment. Absent in a product that ships the starting app as its own tree (the Blank product).
   */
  readonly seed?: string
}

export const PRODUCT_FILE = 'product.json'

/** The product marker at `bundle`, or undefined for an app made with `acrylblends init`. One reader for the file: the desktop shell and the resolver. */
export function readProduct(bundle: string): Product | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(bundle, PRODUCT_FILE), 'utf8'))
    if (value === null || typeof value !== 'object') return undefined
    const { product, appName, program, seed } = value as {
      product?: unknown
      appName?: unknown
      program?: unknown
      seed?: unknown
    }
    if (typeof product !== 'string' || product.trim() === '') return undefined
    return {
      product: product.trim(),
      appName:
        typeof appName === 'string' && appName.trim() !== '' ? appName.trim() : product.trim(),
      program: Array.isArray(program)
        ? program.filter((path): path is string => isProgramPath(path))
        : [],
      ...(isProgramPath(seed) ? { seed: seed.replace(/\/$/u, '') } : {}),
    }
  } catch {
    return undefined
  }
}

/** A Program path as product.json may name it: relative, `/`-separated, no `.` or `..` segment. Anything else is ignored, never followed. */
function isProgramPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path !== '' &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path
      .replace(/\/$/u, '')
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

/** Whether a path of the app tree (relative, `/`-separated) is the Program's. */
export function inProgram(program: readonly string[], path: string): boolean {
  return program.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))
}

/**
 * The framework's package names: its own (`acrylblends`, the frame's `acryl-*` and `@acrylblends/*`, the brand row's `dsh-*`), the engine's
 * (`@deepseek-ai/*`), and the shared ones the frame is built from (`@acryl/*`, `@webboxes/*`). One copy each per process, the bundle's.
 */
const FRAMEWORK_PACKAGE =
  /^(?:acrylblends(?:\/|$)|acryl-|dsh-|@acrylblends\/|@deepseek-ai\/|@acryl\/|@webboxes\/)/u

export function isFrameworkPackage(specifier: string): boolean {
  return FRAMEWORK_PACKAGE.test(specifier)
}

/** The two halves of one app tree, as `file:` URLs ending in `/`. */
export interface AppTree {
  /** The bundle: the Program, read-only. */
  readonly bundle: string
  /** The app's source: the person's. */
  readonly source: string
  readonly program: readonly string[]
}

/** A folder as Node names the modules in it: its real path (macOS's temporary folders sit behind `/var` -> `/private/var`), as a `file:` URL ending in `/`. */
const folderUrl = (path: string): string => {
  let real = path
  try {
    real = realpathSync(path)
  } catch {
    // A folder that does not exist yet keeps its name: nothing in it can be imported anyway.
  }
  const href = pathToFileURL(real).href
  return href.endsWith('/') ? href : `${href}/`
}

/** The tree of a product's frame host: the bundle this module sits in, the source `ACRYLBLENDS_ROOT` names. Undefined outside a product. */
export function appTree(
  env: Readonly<Record<string, string | undefined>>,
  bundle: string,
): AppTree | undefined {
  const root = env[ROOT_ENV]?.trim()
  const product = readProduct(bundle)
  if (root === undefined || root === '' || product === undefined) return undefined
  const tree = { bundle: folderUrl(bundle), source: folderUrl(root), program: product.program }
  return tree.bundle === tree.source ? undefined : tree
}

/** Split a `file:` URL of the tree into its half and its relative path (decoded, `/`-separated), keeping any query or hash for the way back. */
function locate(
  url: string,
  tree: AppTree,
): { half: 'bundle' | 'source'; path: string; suffix: string } | undefined {
  const cut = url.search(/[?#]/u)
  const bare = cut === -1 ? url : url.slice(0, cut)
  const suffix = cut === -1 ? '' : url.slice(cut)
  for (const half of ['bundle', 'source'] as const) {
    const base = tree[half]
    if (bare.startsWith(base))
      return { half, path: decodeURIComponent(bare.slice(base.length)), suffix }
  }
  return undefined
}

/**
 * Where a file of the app tree is served from: a Program path from the bundle, any other path from the source (a bundle file importing `../src/app.ts`
 * gets the person's). A URL outside the tree is returned as it is.
 */
export function servedFrom(url: string, tree: AppTree): string {
  const found = locate(url, tree)
  if (found === undefined) return url
  const half = inProgram(tree.program, found.path) ? 'bundle' : 'source'
  if (half === found.half) return url
  return `${new URL(found.path.split('/').map(encodeURIComponent).join('/'), tree[half]).href}${found.suffix}`
}

/** What Node answers when the source has no such package or import: the cases the bundle may serve. Any other failure is the module's own. */
const NOT_THERE = new Set([
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
  'ERR_PACKAGE_IMPORT_NOT_DEFINED',
])

const isBare = (specifier: string): boolean =>
  !/^(?:\.{1,2}(?:\/|$)|\/|[a-z][a-z0-9+.-]*:)/iu.test(specifier) && !specifier.startsWith('#')

type Resolve = Parameters<typeof registerHooks>[0]['resolve'] & {}

/** The resolve hook for one tree (exported for the tests; `installBundleOverlay` registers it). */
export function overlayResolve(tree: AppTree): Resolve {
  const fromBundle = `${tree.bundle}package.json`
  const bundleRequire = createRequire(fromBundle)
  const insideBundle = (parent: string | undefined): boolean =>
    parent !== undefined && locate(parent, tree)?.half === 'bundle'
  /** A bare name as the bundle resolves it. `import` honours a changed parent; `require` resolves from its caller's own paths, so it is asked of the bundle. */
  const resolveInBundle: Resolve = (specifier, context, nextResolve) =>
    context.conditions.includes('require')
      ? nextResolve(bundleRequire.resolve(specifier), context)
      : nextResolve(specifier, { ...context, parentURL: fromBundle })
  return (specifier, context, nextResolve) => {
    // A package name, or a `#` name of the package's import map (the framework's own, `#acryl-jsx/jsx-runtime`, is the bundle manifest's).
    if (isBare(specifier) || specifier.startsWith('#')) {
      if (insideBundle(context.parentURL)) return nextResolve(specifier, context)
      // The framework: the bundle's copy, whoever imports it.
      if (isFrameworkPackage(specifier)) return resolveInBundle(specifier, context, nextResolve)
      try {
        return nextResolve(specifier, context)
      } catch (error) {
        // Anything else the person's files use and their source does not have: the bundle's packages and import map serve it.
        if (!NOT_THERE.has((error as { code?: string }).code ?? '')) throw error
        return resolveInBundle(specifier, context, nextResolve)
      }
    }
    // A path of the tree: the half it belongs to, decided before Node checks that the file exists.
    let target: string
    try {
      target = new URL(specifier, context.parentURL).href
    } catch {
      return nextResolve(specifier, context)
    }
    const served = servedFrom(target, tree)
    return nextResolve(served === target ? specifier : served, context)
  }
}
