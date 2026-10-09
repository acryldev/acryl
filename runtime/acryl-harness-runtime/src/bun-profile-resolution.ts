/**
 * Bare-package resolution from the profile for a Bun host (specs/042, Bun experiment). The Bun counterpart of `deno-profile-resolution.ts`.
 *
 * A plugin installed while the app runs lives only in the profile's own `node_modules`, and without Node's private loader internals the Cordis Loader imports it by name from
 * the Loader package's own place in the installation, which fails. Deno answers that with a `module.registerHooks` resolve hook. Bun 1.3.14 has neither that function nor a working
 * substitute (measured, specs/042 B-findings): a runtime plugin's `onResolve` is called for the entry file only, never for imports made inside modules; `NODE_PATH` and a
 * tsconfig `paths` wildcard are not applied to packages that appear after the process started; a failed resolution is cached. What does work is a virtual module: `build.module(name,
 * load)` registered at any time answers a later bare `import(name)` from any file, and a second registration under the same name wins. So the profile's packages are exposed
 * by name: all of them when the resolver is installed, and one more each time the live activation service is about to mount a freshly installed package.
 *
 * Freshness comes from the path, not from this module: the installer stages every changed package at a new path, so a re-exposed package is a different module to Bun.
 * A Bun runtime plugin cannot be removed, so the disposer switches this one off.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

interface BunBuilder { module(specifier: string, load: () => Promise<{ exports: Record<string, unknown>; loader: 'object' }>): void }
interface BunRuntime { plugin(plugin: { name: string; setup(build: BunBuilder): void }): void }

/** The Bun runtime object, or `undefined` on any other runtime. */
function bunRuntime(): BunRuntime | undefined {
  return (globalThis as { Bun?: BunRuntime }).Bun
}

/** The entry file an ESM `import` of this package folder reaches: `exports["."]` (string, or the first of the import/bun/node/default conditions), else `main`, else `index.js`. */
function packageEntry(packageDir: string): string | undefined {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { exports?: unknown; main?: string }
  const pick = (target: unknown): string | undefined => {
    if (typeof target === 'string') return target
    if (target === null || typeof target !== 'object') return undefined
    for (const condition of ['import', 'bun', 'node', 'default']) {
      const found = pick((target as Record<string, unknown>)[condition])
      if (found !== undefined) return found
    }
    return undefined
  }
  const exported = typeof manifest.exports === 'object' && manifest.exports !== null && '.' in manifest.exports ? (manifest.exports as Record<string, unknown>)['.'] : manifest.exports
  const relative = pick(exported) ?? manifest.main ?? 'index.js'
  const entry = join(packageDir, relative)
  return existsSync(entry) ? entry : undefined
}

interface InstalledResolver {
  readonly expose: (packageName: string) => void
  readonly exposeAll: () => void
}

let current: InstalledResolver | undefined

/**
 * Make one profile package importable by its bare name (no-op on a runtime without the Bun resolver). Called by the live activation service right before it mounts a package.
 * @param packageName - the package name as it appears in the profile's `package.json`.
 */
export function exposeProfilePackage(packageName: string): void {
  current?.expose(packageName)
}

/**
 * Expose the profile's packages as bare-name imports.
 * @param profileDir - the profile folder (its `package.json` and `node_modules`).
 * @returns an idempotent disposer (switches every exposure off).
 */
export function installBunProfileResolver(profileDir: string): () => void {
  const bun = bunRuntime()
  if (bun === undefined) throw new Error('installBunProfileResolver: this is not a Bun runtime')
  const base = profileDir.replace(/[\\/]+$/, '')
  let active = true
  let generation = 0
  const expose = (packageName: string): void => {
    if (!active) return
    // Not `require.resolve`: once a name has a virtual module, Bun resolves that name to itself, and the next exposure would import itself.
    const packageDir = join(base, 'node_modules', packageName)
    const entry = existsSync(packageDir) ? packageEntry(realpathSync(packageDir)) : undefined
    if (entry === undefined) return // not a profile package (or one with no importable entry)
    const target = entry
    generation += 1
    bun.plugin({
      name: `acryl-profile-package:${packageName}:${generation}`,
      setup(build) {
        build.module(packageName, async () => {
          const namespace = (await import(target)) as Record<string, unknown>
          return { exports: { ...namespace }, loader: 'object' }
        })
      },
    })
  }
  const exposeAll = (): void => {
    const manifestPath = `${base}/package.json`
    if (!existsSync(manifestPath)) return
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies?: Record<string, string> }
    for (const name of Object.keys(manifest.dependencies ?? {})) expose(name)
  }
  const installed: InstalledResolver = { expose, exposeAll }
  current = installed
  exposeAll()
  return () => {
    active = false
    if (current === installed) current = undefined
  }
}
