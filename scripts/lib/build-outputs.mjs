/**
 * Whether the built output a surface runs from exists, checked before anything is spawned.
 *
 * A surface runs from `lib/`: its own entry and the entry of every workspace package it depends on, directly or through another workspace
 * package. In a checkout that was never built the app died with ERR_MODULE_NOT_FOUND on some package's lib/index.mjs, which does not say what
 * to do. This finds the first package whose entry is missing so the caller can name it and the build command. It never builds: a build
 * rewrites lib/ in place, and a running app in the same checkout reads from it.
 *
 * @module scripts/lib/build-outputs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** The folders that hold workspace packages (`pnpm-workspace.yaml`, enforced by `scripts/verify-layout.mjs`). */
const PACKAGE_GROUPS = ['apps', 'runtime', 'plugins', 'examples', 'distribution']

/** The command that builds every package under the build lock, printed when something is unbuilt. */
export const BUILD_COMMAND = 'node scripts/with-build-lock.mjs corepack pnpm run build'

/** The workspace packages under `root`, by name: their folder and manifest. */
function workspacePackages(root) {
  const packages = new Map()
  for (const group of PACKAGE_GROUPS) {
    const groupDir = join(root, group)
    if (!existsSync(groupDir)) continue
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      const manifestPath = join(groupDir, entry.name, 'package.json')
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name === 'string') packages.set(manifest.name, { dir: join(groupDir, entry.name), manifest })
    }
  }
  return packages
}

/** The built file a package's `.` export (or `main`) names, or undefined when it names none. */
function entryFile(manifest) {
  let target = manifest.exports?.['.'] ?? manifest.main
  while (target !== null && typeof target === 'object') target = target.import ?? target.default
  return typeof target === 'string' ? target : undefined
}

/**
 * The first missing built output a surface needs.
 * @param {string} root - the checkout's root folder.
 * @param {string} surfaceDir - the surface package's folder, relative to `root` (for example `apps/acryl-desktop`).
 * @param {readonly string[]} [surfaceFiles] - files of the surface itself that are run directly, relative to its folder (for example `lib/bin.js`).
 * @returns {{ packageName: string, file: string } | undefined} the package and the missing file (relative to `root`), or undefined when all exist.
 */
export function findMissingBuildOutput(root, surfaceDir, surfaceFiles = []) {
  const packages = workspacePackages(root)
  const surface = [...packages.values()].find(entry => relative(root, entry.dir) === surfaceDir)
  if (surface === undefined) throw new Error(`build-outputs: no workspace package in ${surfaceDir}`)
  for (const file of surfaceFiles) {
    if (!existsSync(join(surface.dir, file))) return { packageName: surface.manifest.name, file: join(surfaceDir, file) }
  }
  const seen = new Set()
  const queue = [surface.manifest.name]
  while (queue.length > 0) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    const entry = packages.get(name)
    if (entry === undefined) continue
    // A package without a build script ships its source as is; only built packages have output that can be missing.
    const built = typeof entry.manifest.scripts?.build === 'string'
    const file = entryFile(entry.manifest)
    if (built && file !== undefined && !existsSync(join(entry.dir, file))) return { packageName: name, file: relative(root, join(entry.dir, file)) }
    for (const dependency of Object.keys({ ...entry.manifest.dependencies, ...entry.manifest.optionalDependencies })) {
      if (packages.has(dependency)) queue.push(dependency)
    }
  }
  return undefined
}

/**
 * What to print when a surface's built output is missing.
 * @param {{ packageName: string, file: string }} missing - the result of `findMissingBuildOutput`.
 * @returns {string} the message naming the unbuilt package, its missing file and the build command.
 */
export function unbuiltMessage(missing) {
  return `live-run: ${missing.packageName} is not built (${missing.file} is missing); build the checkout first with\n  ${BUILD_COMMAND}\n`
    + 'live-run does not build by itself: a build rewrites lib/ in place, under any app running from this checkout.'
}
