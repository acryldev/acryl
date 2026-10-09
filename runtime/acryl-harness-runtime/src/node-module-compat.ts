/**
 * The two public `node:module` functions this package needs that Bun 1.3 does not implement (specs/042, Bun experiment). On Node and Deno the platform's own function is used
 * unchanged; on Bun a small equivalent answers the same question. Importing the names directly (`import { findPackageJSON } from 'node:module'`) is a link-time error on Bun,
 * which is why every caller goes through here.
 */
import * as nodeModule from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

type FindPackageJSON = (specifier: string | URL, base?: string | URL) => string | undefined

const native = (nodeModule as { findPackageJSON?: FindPackageJSON }).findPackageJSON

/** The folder a `file:` URL, a path or a base names; a folder is returned as is, a file gives its folder. */
function startFolder(base: string | URL): string {
  const path = typeof base === 'string' && !base.startsWith('file:') ? base : fileURLToPath(base)
  return path.endsWith('/') || path.endsWith('\\') ? path : dirname(path)
}

/** Walk up from `folder` and return the first `<folder>/package.json`, or the first `<folder>/node_modules/<name>/package.json` when `name` is given. */
function walkUp(folder: string, name?: string): string | undefined {
  for (let current = folder; ; current = dirname(current)) {
    const candidate = name === undefined ? join(current, 'package.json') : join(current, 'node_modules', name, 'package.json')
    if (existsSync(candidate)) return realpathSync(candidate)
    if (parse(current).root === current) return undefined
  }
}

/** The package name of a bare specifier: `pkg` or `@scope/pkg` (a subpath is dropped). */
function bareName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

/**
 * The `package.json` that owns a module or a package, like `module.findPackageJSON`. A `file:` URL or an absolute path gives the nearest manifest above it; a bare package
 * name is looked up in the `node_modules` folders above `base`. Returns `undefined` when there is none (Node throws for a package that is not found; callers treat both the same).
 */
export const findPackageJSON: FindPackageJSON = native ?? ((specifier, base) => {
  const text = specifier instanceof URL ? specifier.href : specifier
  if (text.startsWith('file:') || isAbsolute(text)) return walkUp(startFolder(specifier instanceof URL ? specifier : text))
  if (base === undefined) return undefined
  return walkUp(startFolder(base), bareName(text))
})

/** Whether this runtime implements `module.registerHooks` (Node 22.15+ and Deno do; Bun 1.3 does not, it has `Bun.plugin` instead). */
export const hasModuleHooks = typeof (nodeModule as { registerHooks?: unknown }).registerHooks === 'function'
