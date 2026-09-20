import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * Static checks for the two failures measured in spec 037 research Q7 that make
 * a package install but never go live, or not install at all. Cheap and
 * deterministic; the full mount-level verification is a separate task.
 * @returns {{ name?: string, errors: string[] }}
 */
export function lintPackageDir(dir, fs = { existsSync, readFileSync }) {
  const errors = []
  const manifestPath = join(dir, 'package.json')
  if (!fs.existsSync(manifestPath)) return { errors: [`no package.json in ${dir}`] }
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (cause) { return { errors: [`package.json is not valid JSON: ${cause instanceof Error ? cause.message : cause}`] } }
  if (typeof pkg.name !== 'string' || pkg.name === '') errors.push('package.json needs a "name"')
  const patch = pkg.dsh?.bundle?.patch
  if (typeof patch !== 'string' || patch === '') {
    errors.push('package.json needs "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }; without it the package is installed as a plain dependency but never added to the profile')
  } else {
    if (!fs.existsSync(join(dir, patch))) errors.push(`the bundle patch ${patch} does not exist`)
    if (Array.isArray(pkg.files) && !pkg.files.some(f => join(dir, f) === join(dir, patch) || patch.replace(/^\.\//u, '') === f.replace(/^\.\//u, ''))) errors.push(`the bundle patch ${patch} is not in "files"`)
  }
  const exp = pkg.exports
  if (exp !== undefined && (typeof exp !== 'object' || exp === null || !('./package.json' in exp))) {
    errors.push('"exports" must include "./package.json" (for example { ".": "./index.js", "./package.json": "./package.json" }); otherwise the package installs but live activation fails with ERR_PACKAGE_PATH_NOT_EXPORTED')
  }
  if (pkg.dsh?.client !== undefined) {
    const clientExport = exp && typeof exp === 'object' ? exp['./client'] : undefined
    if (typeof clientExport !== 'string') errors.push('a package with "dsh.client" must export its browser bundle as "./client" in "exports" (for example "./client": "./client.js")')
    else if (!fs.existsSync(join(dir, clientExport))) errors.push(`the client bundle ${clientExport} does not exist`)
  }
  return { name: pkg.name, hasClient: pkg.dsh?.client !== undefined, hotShim: usesHotShim(dir, pkg, fs), errors }
}

/** True when the plugin's host entry re-imports its implementation with a cache-busting query (the hot shim). */
function usesHotShim(dir, pkg, fs) {
  try {
    const entry = typeof pkg.main === 'string' ? pkg.main : typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : './index.js'
    const source = fs.readFileSync(join(dir, entry), 'utf8')
    return /import\([^;]*\?t=/u.test(source)
  } catch { return false }
}

async function drain(stream) {
  let text = ''
  if (stream) for await (const chunk of stream) text += chunk.toString()
  return text
}

async function runPlugin(pnpm, args, dir) {
  const handle = pnpm.runPlugin(args, dir)
  const [outcome, stdout, stderr] = await Promise.all([handle.done, drain(handle.stdout), drain(handle.stderr)])
  return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode, output: `${stdout}${stderr}`.trim().slice(-600) }
}

/** Local plugins of the active profile: dependencies installed from a `file:` path. */
export function listLocalPlugins(profileDir, fs = { existsSync, readFileSync }) {
  const manifest = join(profileDir, 'package.json')
  if (!fs.existsSync(manifest)) return []
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  return Object.entries(pkg.dependencies ?? {})
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
    .map(([name, spec]) => ({ name, installedFrom: spec.slice('file:'.length) }))
}

/**
 * Add `name` to `dsh.profile.bundles` in the profile's package.json when it is missing. This is what
 * `dsh plugin add` (CLI/Web) does after pnpm; Desktop's generic `run` does not, so we do it here.
 */
export function ensureProfileBundle(profileDir, name, fs = { existsSync, readFileSync, writeFileSync, renameSync }) {
  const path = join(profileDir, 'package.json')
  if (!fs.existsSync(path)) throw new Error(`the active profile has no package.json at ${path}`)
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'))
  const bundles = pkg.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) throw new Error('the active profile package.json has no dsh.profile.bundles list')
  if (bundles.includes(name)) return false
  pkg.dsh.profile.bundles = [...bundles, name]
  const tmp = `${path}.acryl-tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(pkg, null, 2)}\n`)
  fs.renameSync(tmp, path)
  return true
}

/**
 * Add a local package to the active profile. CLI and Web: `dsh plugin add file:<dir>` through runPlugin.
 * Desktop refuses `add` through runPlugin (it must use its recoverable registry-install boundary, which
 * cannot take a local path), so there we run pnpm directly with `run` and register the bundle ourselves.
 */
export async function addLocalPackage(services, dir, name, profileDir, fs) {
  try {
    return await runPlugin(services.pnpm, ['add', `file:${dir}`], dir)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (!/recoverable install boundary/u.test(message) || typeof services.pnpm.run !== 'function') throw cause
  }
  const handle = services.pnpm.run(['add', '-w', `file:${dir}`])
  const [outcome, stdout, stderr] = await Promise.all([handle.done, drain(handle.stdout), drain(handle.stderr)])
  const result = { ok: outcome.exitCode === 0, exitCode: outcome.exitCode, output: `${stdout}${stderr}`.trim().slice(-600) }
  if (!result.ok) return result
  if (!profileDir) return { ok: false, exitCode: null, output: 'the active profile directory is not available to register the bundle' }
  try { ensureProfileBundle(profileDir, name, fs) } catch (cause) { return { ok: false, exitCode: null, output: cause instanceof Error ? cause.message : String(cause) } }
  return result
}

/**
 * Local, in-place delivery (spec 037 FR-016): lint, `dsh plugin add file:<dir>`, an
 * EXPLICIT live activation, and a compensating `remove` on any failure, because CLI
 * and Web have no install recovery log (measured: a plugin whose apply() threw stayed
 * in the profile until removed). Services are read at call time, never captured.
 * @param {{ path: string, cwd?: string }} input
 * @param {{ pnpm: any, live: any, cwd?: string }} services
 */
export async function installLocalPlugin(input, services, fs) {
  if (typeof input.path !== 'string' || input.path === '') return { ok: false, stage: 'check', errors: ['path is required'] }
  // The runtime's working directory is not the user's workspace, so a relative path would silently point somewhere else.
  if (!isAbsolute(input.path) && services.cwd === undefined) {
    return { ok: false, stage: 'check', errors: [`path must be ABSOLUTE (got "${input.path}"); use the workspace directory you are working in`] }
  }
  const dir = isAbsolute(input.path) ? input.path : resolve(services.cwd, input.path)
  const lint = lintPackageDir(dir, fs)
  if (lint.errors.length > 0 || lint.name === undefined) {
    return { ok: false, stage: 'check', errors: lint.errors, next: 'Fix these in the package and call the tool again. See docs/start-here/this-runtime.md (package contract).' }
  }
  if (!services.pnpm) return { ok: false, stage: 'services', errors: ['the plugin install service (desktopPnpm) is not available in this runtime'] }
  if (!services.live) return { ok: false, stage: 'services', errors: ['live plugin activation (livePluginActivation) is not available in this runtime'] }

  // UPDATE: a plugin with this name is already mounted. Deactivate removes its row; the re-add
  // below copies the new files over the old ones and activate mounts a fresh entry. Changed HOST
  // code is only picked up if the plugin uses the hot shim (see docs/delivery/local-live.md): Node
  // caches module resolution, so a plain re-import returns the old module (measured).
  const updating = services.live.statusOf(lint.name) !== undefined
  if (updating) {
    try { await services.live.deactivate(lint.name) } catch (cause) {
      return { ok: false, stage: 'update', errors: [`could not deactivate the running version: ${cause instanceof Error ? cause.message : cause}`] }
    }
  }
  const added = await addLocalPackage(services, dir, lint.name, services.profileDir, fs)
  if (!added.ok) return { ok: false, stage: 'install', errors: [`dsh plugin add failed (exit ${added.exitCode})`], detail: added.output }

  try {
    await services.live.activate(lint.name)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const removed = await runPlugin(services.pnpm, ['remove', lint.name], dir)
    return { ok: false, stage: 'activate', errors: [message], rolledBack: removed.ok, next: 'The install was undone. Fix the error above, then call the tool again.' }
  }
  const result = { ok: true, package: lint.name, status: services.live.statusOf(lint.name) ?? 'unknown', action: updating ? 'updated' : 'installed' }
  if (updating && !lint.hotShim) result.warning = 'Updated, but Node caches the host module: changes to HOST code (index.js and what it imports) are NOT picked up until the app restarts, unless the plugin uses the hot shim (docs/delivery/local-live.md, example lifecycle-function.hot-shim). Browser (client.js) changes only need a page reload.'
  if (lint.hasClient) result.next = 'This package has a browser (client) part. Ask the user to reload the page (Web) or window (Desktop) to see the new UI; the host part is already live.'
  return result
}

/**
 * Remove a local plugin: deactivate it live, then `dsh plugin remove`. Removing something
 * that is not installed is reported, not thrown.
 */
export async function removeLocalPlugin(input, services) {
  const name = input.package
  if (!name) return { ok: false, errors: ['a package name is required'] }
  if (!services.pnpm || !services.live) return { ok: false, stage: 'services', errors: ['plugin services are not available in this runtime'] }
  try { await services.live.deactivate(name) } catch { /* not active: still remove it */ }
  const removed = await runPlugin(services.pnpm, ['remove', name], services.cwd ?? process.cwd())
  if (!removed.ok) return { ok: false, stage: 'remove', errors: [`dsh plugin remove failed (exit ${removed.exitCode})`], detail: removed.output }
  return { ok: true, package: name, removed: true, next: 'If the plugin had a browser (client) part, ask the user to reload the page or window.' }
}
