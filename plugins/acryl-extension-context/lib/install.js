import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { hashPackage, pruneOldStages, pruneOldVersions, stagePackage, stagedSource } from './stage.js'
import { canonical, discoverExtensions, installState } from './reconcile.js'
import { checkManifest, readManifest } from './manifest.js'
import { listInstalledPlugins } from './provenance.js'

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
  const requiresAcrylPackages = pkg.dsh?.requiresAcrylPackages
  if (requiresAcrylPackages !== undefined && (!Array.isArray(requiresAcrylPackages) || !requiresAcrylPackages.every(name => typeof name === 'string'))) {
    errors.push('"dsh.requiresAcrylPackages" must be a list of package name strings')
  }
  errors.push(...hostOwnedDependencyErrors(pkg))
  errors.push(...checkManifest(pkg))
  const { apiVersion, permissions } = readManifest(pkg)
  return { name: pkg.name, hasClient: pkg.dsh?.client !== undefined, hotShim: usesHotShim(dir, pkg, fs), apiVersion, permissions, requiresAcrylPackages: Array.isArray(requiresAcrylPackages) ? requiresAcrylPackages : [], errors }
}

/** Packages the app itself provides to every plugin: the framework and the terminal toolkit. */
const HOST_OWNED_PACKAGES = /^@(deepseek-ai|earendil-works)\//u

/**
 * A plugin must not install the app's own packages. Listed under `dependencies`, the install puts a second physical copy of the framework into the
 * profile, and from the next restart the plugin's imports resolve to that copy while the app runs on its own: unique symbols and classes no longer match
 * (measured: `Cannot read properties of undefined (reading 'prepare')` on every tool call after a restart). `peerDependencies` state the same range
 * and install nothing.
 * @returns {string[]}
 */
function hostOwnedDependencyErrors(pkg) {
  const errors = []
  for (const field of ['dependencies', 'optionalDependencies']) {
    const owned = Object.keys(pkg[field] ?? {}).filter(name => HOST_OWNED_PACKAGES.test(name))
    if (owned.length > 0) {
      errors.push(`"${field}" lists ${owned.map(name => `"${name}"`).join(', ')}, which the app itself provides: declare ${owned.length === 1 ? 'it' : 'them'} under "peerDependencies" instead, with the same version range. Installed as a dependency, the package brings a second copy of the framework into the profile and the app's tools stop working after the next restart.`)
    }
  }
  return errors
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
    .map(([name, spec]) => {
      const installed = spec.slice('file:'.length)
      // A staged install (automatic host hot reload) points at the staging copy; report and re-install from the author's source folder.
      return { name, installedDir: installed, installedFrom: stagedSource(installed, fs) ?? installed }
    })
}

/**
 * Write the profile's recorded `publicHoistPattern` into its `pnpm-workspace.yaml`, so a newer pnpm accepts the existing
 * modules directory instead of demanding a full reinstall. Returns true when the file changed.
 */
export function pinPublicHoistPattern(profileDir, fs = { existsSync, readFileSync, writeFileSync }) {
  const modulesFile = join(profileDir, 'node_modules', '.modules.yaml')
  const workspaceFile = join(profileDir, 'pnpm-workspace.yaml')
  if (!fs.existsSync(modulesFile) || !fs.existsSync(workspaceFile)) return false
  const workspace = fs.readFileSync(workspaceFile, 'utf8')
  if (/^publicHoistPattern:/mu.test(workspace)) return false
  const recorded = /^publicHoistPattern:\n((?:[ \t]+- .*\n?)+)/mu.exec(fs.readFileSync(modulesFile, 'utf8'))
  const items = recorded ? recorded[1].split('\n').map(line => line.trim()).filter(line => line.startsWith('- ')) : []
  const block = items.length > 0 ? `publicHoistPattern:\n${items.map(item => `  ${item}`).join('\n')}\n` : 'publicHoistPattern: []\n'
  fs.writeFileSync(workspaceFile, `${workspace.replace(/\n*$/u, '\n')}# Pinned by ACRYL: this node_modules was created by an older pnpm whose default public hoist pattern differs from the pnpm on PATH.\n${block}`)
  return true
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
 * Make the ACRYL-owned workspace packages a local extension named in `dsh.requiresAcrylPackages` resolvable
 * and live, in the same profile its own install lands in: symlink each in (`acrylFrameworkPackages`, not
 * published so `pnpm add` cannot fetch it), register it in `dsh.profile.bundles` (the same thing `dsh plugin
 * add` does for an ordinary local install - `livePluginActivation.activate()` refuses any package name absent
 * from that list, "cannot be activated by this host", even when it is already present in `node_modules`), and
 * activate it as a Loader entry (the existing `livePluginActivation` service, the same one that activates the
 * extension itself - already-active packages are left alone).
 * @param {{ acrylFrameworkPackages?: { materialize(profileDir: string, name: string): void }, live: any, profileDir?: string }} services
 * @param {readonly string[]} names
 * @param {object} [fs]
 */
export async function materializeRequiredAcrylPackages(services, names, fs) {
  const errors = []
  if (!services.acrylFrameworkPackages) {
    return { errors: [`this runtime cannot resolve ACRYL framework packages (needed: ${names.join(', ')})`] }
  }
  if (!services.profileDir) return { errors: ['the active profile directory is not available to resolve ACRYL framework packages'] }
  for (const name of names) {
    try {
      services.acrylFrameworkPackages.materialize(services.profileDir, name)
      ensureProfileBundle(services.profileDir, name, fs)
      if (services.live.statusOf(name) === undefined) await services.live.activate(name)
    } catch (cause) {
      errors.push(`could not make "${name}" live: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
  return { errors }
}

/**
 * Add a local package to the active profile. CLI and Web: `dsh plugin add file:<dir>` through runPlugin.
 * Desktop refuses `add` through runPlugin (it must use its recoverable registry-install boundary, which
 * cannot take a local path), so there we run pnpm directly with `run` and register the bundle ourselves.
 */
export async function addLocalPackage(services, dir, name, profileDir, fs) {
  try {
    let first = await runPlugin(services.pnpm, ['add', `file:${dir}`], dir)
    // Measured on a real profile: node_modules created by an older pnpm records a public-hoist-pattern that the pnpm on PATH
    // (a newer major) computes differently and refuses (ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF). Pin the recorded value once and retry.
    if (!first.ok && profileDir && /public[-_ ]?hoist[-_ ]?pattern/iu.test(first.output) && pinPublicHoistPattern(profileDir, fs)) {
      first = await runPlugin(services.pnpm, ['add', `file:${dir}`], dir)
    }
    return first
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
 * The staged copy that is installed now (the profile's `dependencies` entry for `name` is `file:<stage dir>`), when it is one of ours: only a copy
 * under `stageRoot` is ever reinstalled, never an arbitrary path. `undefined` when the running version was not staged by us (a plugin with its own
 * hot shim installs from its own folder, which is exactly what an update has just changed).
 */
export function previousStagedDir(profileDir, name, stageRoot, fs = { existsSync, readFileSync }) {
  if (!profileDir) return undefined
  try {
    const spec = JSON.parse(fs.readFileSync(join(profileDir, 'package.json'), 'utf8')).dependencies?.[name]
    if (typeof spec !== 'string' || !spec.startsWith('file:')) return undefined
    // pnpm records the path with forward slashes on Windows (`file:C:/Users/.../.acryl-staged/x`), so compare resolved paths, not the spelling: a plain
    // `startsWith(stageRoot + sep)` never matched there, the running version was not found, and a failed update could not bring it back.
    const dir = resolve(spec.slice('file:'.length))
    const inside = relative(resolve(stageRoot), dir)
    return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside) && fs.existsSync(join(dir, 'package.json')) ? dir : undefined
  } catch { return undefined }
}

/**
 * Bring the version that was running before a failed update back: reinstall its staged copy and activate it. Best effort and honest: the answer
 * says whether it worked, and a failure here never hides the error that caused the update to fail.
 */
async function restorePrevious(services, previousDir, name, fs) {
  if (previousDir === undefined) return false
  try {
    const added = await addLocalPackage(services, previousDir, name, services.profileDir, fs)
    if (!added.ok) return false
    await services.live.activate(name)
    return true
  } catch { return false }
}

/** The staged copy of a failed attempt is of no use to anyone (best effort). */
function discardStage(staging) {
  if (staging.ok) { try { rmSync(staging.dir, { recursive: true, force: true }) } catch { /* nothing depends on it */ } }
}

const RESTORED = 'The version that was running is running again. Fix the error above, then call the tool again.'
const NOT_RESTORED = 'The install was undone. Fix the error above, then call the tool again.'

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
  const stageRoot = join(services.profileDir ?? tmpdir(), '.acryl-staged')
  // Remembered before anything is taken down: a failed update must leave the version that was working still working.
  const previousDir = updating ? previousStagedDir(services.profileDir, lint.name, stageRoot) : undefined
  if (updating) {
    try { await services.live.deactivate(lint.name) } catch (cause) {
      return { ok: false, stage: 'update', errors: [`could not deactivate the running version: ${cause instanceof Error ? cause.message : cause}`] }
    }
  }
  // Automatic host hot reload: install a staged copy whose entry re-imports the newest versioned code on every activation (lib/stage.js).
  // A plugin that already carries its own hot shim, or whose entry cannot be wrapped, installs as written (and is warned about below).
  let installDir = dir
  let staging = { ok: false, reason: 'the plugin uses its own hot shim' }
  if (!lint.hotShim) {
    staging = stagePackage(dir, stageRoot)
    if (staging.ok) installDir = staging.dir
  }
  const added = await addLocalPackage(services, installDir, lint.name, services.profileDir, fs)
  if (!added.ok) {
    const restored = await restorePrevious(services, previousDir, lint.name, fs)
    discardStage(staging)
    return { ok: false, stage: 'install', errors: [`dsh plugin add failed (exit ${added.exitCode})`], detail: added.output, ...(updating ? { restoredPrevious: restored } : {}) }
  }

  try {
    await services.live.activate(lint.name)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const removed = await runPlugin(services.pnpm, ['remove', lint.name], installDir)
    const restored = await restorePrevious(services, previousDir, lint.name, fs)
    discardStage(staging)
    return { ok: false, stage: 'activate', errors: [message], rolledBack: removed.ok, ...(updating ? { restoredPrevious: restored } : {}), next: restored ? RESTORED : NOT_RESTORED }
  }

  // The required packages activate AFTER the plugin itself, not before: `livePluginActivation`'s dynamic
  // activation locates its target Loader group by searching the live tree for an already-settled "include:"
  // entry (`PluginLifecycleController`'s `bundleGroup()`), and that search is unreliable on the very first
  // dynamic activation of a fresh profile - measured live, activating a framework package before anything else
  // had ever been dynamically activated matched the wrong group ("dsh-client-ui-layout") and failed with
  // "invalid plugin, expect function or object with an apply method, received object". Activating the plugin
  // itself first settles the tree into the shape every later dynamic activation (including this one) expects.
  if (lint.requiresAcrylPackages.length > 0) {
    const required = await materializeRequiredAcrylPackages(services, lint.requiresAcrylPackages, fs)
    if (required.errors.length > 0) {
      await services.live.deactivate(lint.name).catch(() => {})
      const removed = await runPlugin(services.pnpm, ['remove', lint.name], installDir)
      const restored = await restorePrevious(services, previousDir, lint.name, fs)
      discardStage(staging)
      return { ok: false, stage: 'requires', errors: required.errors, rolledBack: removed.ok, ...(updating ? { restoredPrevious: restored } : {}), next: restored ? RESTORED : NOT_RESTORED }
    }
  }

  const result = { ok: true, package: lint.name, status: services.live.statusOf(lint.name) ?? 'unknown', action: updating ? 'updated' : 'installed' }
  if (staging.ok) {
    result.hostReload = 'automatic'
    if (services.profileDir) pruneOldVersions(join(services.profileDir, 'node_modules', lint.name), staging.versionDir)
    pruneOldStages(stageRoot, lint.name, staging.dir)
  }
  else if (updating && !lint.hotShim) result.warning = `Updated, but Node caches the host module and this plugin could not be staged for automatic reload (${staging.reason}): changes to HOST code are NOT picked up until the app restarts, unless the plugin uses the hot shim (docs/delivery/local-live.md). Browser (client.js) changes only need a page reload.`
  if (lint.permissions !== undefined) result.permissions = lint.permissions
  // Evolution Ledger (blend-ledger.js): when the workspace tracks a Blend, this install or update becomes one line of history.
  services.record?.({ kind: result.action ?? 'installed', module: lint.name, origin: 'local', version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, digest: `sha256:${hashPackage(dir, 64)}` })
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
  services.record?.({ kind: 'removed', module: name })
  return { ok: true, package: name, removed: true, next: 'If the plugin had a browser (client) part, ask the user to reload the page or window.' }
}

/**
 * `/reload`: bring the installs in line with their source folders (source is authoritative): update the ones whose source changed, skip the ones
 * that did not, report the ones whose source is gone, and install any NEW extension folder found under `<workspace>/.acryl-extensions/` or the global
 * extensions directory, so edits and drops made by hand (or by another tool) go live without asking the agent
 * (pi.dev: write the file, then `/reload`). Each plugin goes through the same checked install path, so a broken edit is reported
 * and rolled back, never half-applied.
 * @param {object} services `{ pnpm, live, profileDir }`
 * @param {object} [fs]
 * @param {{ workspaceDir?: string, globalDir?: string, installDiscovered?: boolean, removeStale?: boolean }} [options] `globalDir`: the global extensions directory (see reconcile.js); `installDiscovered`: install new folders instead of only listing them; `removeStale`: remove installs whose source folder no longer exists (otherwise they are only reported)
 */
export async function reloadLocalPlugins(services, fs, options = {}) {
  const plugins = listLocalPlugins(services.profileDir, fs)
  const discovered = discoverExtensions({ workspaceDir: options.workspaceDir, globalDir: options.globalDir })
  const scopeOf = new Map(discovered.map(found => [found.dir, found.scope]))
  const results = []
  const done = new Set()
  for (const plugin of plugins) {
    const dir = plugin.installedFrom
    if (!dir || !isAbsolute(dir)) { results.push({ name: plugin.name, ok: false, errors: [`source directory "${dir}" is not absolute, skipped`] }); continue }
    done.add(canonical(dir))
    const scope = scopeOf.get(canonical(dir))
    const state = installState(plugin, hashPackage, fs)
    // The source folder was moved or deleted: the install still runs, but it can never be updated. Report it as stale (not a failure);
    // it is removed only when the human asked for that explicitly (`/reload remove-stale`), never automatically.
    if (state === 'stale') {
      if (!options.removeStale) { results.push({ name: plugin.name, stale: true, ok: true, dir }); continue }
      const removed = await removeLocalPlugin({ package: plugin.name }, services)
      results.push({ name: plugin.name, stale: true, dir, ...removed })
      continue
    }
    // Unchanged source: nothing to do (no package-manager run, no restart of a working plugin).
    if (state === 'in-sync') { results.push({ name: plugin.name, ok: true, action: 'unchanged', scope }); continue }
    const result = await installLocalPlugin({ path: dir }, services, fs)
    results.push({ name: plugin.name, scope, ...result })
  }
  for (const found of discovered) {
    if (done.has(found.dir)) continue
    if (found.shadowed) { results.push({ name: found.name, discovered: true, shadowed: true, ok: true, dir: found.dir, scope: found.scope }); continue }
    // Extensions run with the user's permissions, and a folder in a cloned repository is a prompt-injection surface (pi.dev has project
    // trust for the same reason): a new folder is only LISTED unless the human explicitly asked to install new ones.
    if (!options.installDiscovered) { results.push({ name: found.name, discovered: true, pending: true, ok: true, dir: found.dir, scope: found.scope, permissions: found.permissions }); continue }
    const result = await installLocalPlugin({ path: found.dir }, services, fs)
    results.push({ name: result.package ?? found.name, discovered: true, scope: found.scope, ...result })
  }
  return results
}

/**
 * The startup pass: bring already-installed extensions up to date with their source, without asking, ONLY where that cannot run code the user
 * did not put there. pi.dev auto-loads what it finds, guarded by project trust; ACRYL's equivalent guard is:
 *
 *  - GLOBAL scope (`<ACRYL home>/extensions/`): a directory only the user (or their agent) writes to, never arrives through `git clone` or `git pull`.
 *    A changed source there is re-installed at startup.
 *  - PROJECT scope and anything else: a `git pull` can change code that then runs with the user's permissions at the next start. A changed source
 *    is only REPORTED (`/reload` applies it). New folders are never installed here in either scope: that is `/reload new`.
 *  - A missing source is only reported; nothing is removed.
 *
 * Never throws: a failure in one extension is recorded and the others still run.
 * @param {object} services `{ pnpm, live, profileDir }`
 * @param {{ globalDir?: string }} [options]
 * @returns {Promise<{ updated: string[], changed: string[], stale: string[], pending: string[], failed: Array<{ name: string, error: string }> }>}
 */
export async function syncOnStartup(services, options = {}, fs) {
  const summary = { updated: [], installed: [], changed: [], stale: [], pending: [], failed: [] }
  const plugins = listLocalPlugins(services.profileDir, fs)
  const globalRoot = options.globalDir ? canonical(options.globalDir) : undefined
  const inGlobal = dir => globalRoot !== undefined && canonical(dir).startsWith(`${globalRoot}${sep}`)
  const installed = new Set()
  for (const plugin of plugins) {
    if (!plugin.installedFrom || !isAbsolute(plugin.installedFrom)) continue
    installed.add(canonical(plugin.installedFrom))
    let state
    try { state = installState(plugin, hashPackage, fs) } catch (cause) { summary.failed.push({ name: plugin.name, error: String(cause?.message ?? cause) }); continue }
    if (state === 'stale') { summary.stale.push(plugin.name); continue }
    if (state === 'in-sync') continue
    if (!inGlobal(plugin.installedFrom)) { summary.changed.push(plugin.name); continue }
    try {
      const result = await installLocalPlugin({ path: plugin.installedFrom }, services, fs)
      if (result.ok) summary.updated.push(plugin.name)
      else summary.failed.push({ name: plugin.name, error: (result.errors ?? []).join('; ') || 'install failed' })
    } catch (cause) { summary.failed.push({ name: plugin.name, error: String(cause?.message ?? cause) }) }
  }
  for (const found of discoverExtensions({ globalDir: options.globalDir })) {
    if (installed.has(found.dir) || found.shadowed) continue
    // An app's own extensions (its committed `extensions/`, e.g. in a fresh clone) are the app's code: they install at start. Elsewhere a new
    // global folder is only reported, because installing runs code the user has not asked for yet.
    if (options.installPending !== true) { summary.pending.push(found.name); continue }
    try {
      const result = await installLocalPlugin({ path: found.dir }, services, fs)
      if (result.ok) summary.installed.push(found.name)
      else summary.failed.push({ name: found.name, error: (result.errors ?? []).join('; ') || 'install failed' })
    } catch (cause) { summary.failed.push({ name: found.name, error: String(cause?.message ?? cause) }) }
  }
  return summary
}

/**
 * The live view of local extensions for the agent: what is installed, where its source is and whether it is mounted. Evaluated
 * at every prompt assembly, so it reflects the state after an install, update or remove without the agent calling the list tool
 * (pi.dev rebuilds its prompt and tool registry after a reload).
 */
export function describeInstalledExtensions(profileDir, live, fs) {
  if (!profileDir) return ''
  const plugins = listLocalPlugins(profileDir, fs)
  // Marketplace/registry installs are managed by the market: named so the agent does not go looking for a source folder to edit.
  const managed = listInstalledPlugins(profileDir, {}, fs).filter(plugin => plugin.origin === 'registry')
  if (plugins.length === 0) return ''
  // A source folder that is gone is the one thing worth flagging in every prompt (existence is a cheap check; a content hash is not): the agent can
  // then offer `/reload remove-stale` instead of failing on the next update.
  const check = fs?.existsSync ?? existsSync
  const lines = plugins.map(plugin => `- ${plugin.name} (${live?.statusOf?.(plugin.name) ?? 'not mounted'}) source: ${plugin.installedFrom}${check(join(plugin.installedFrom, 'package.json')) ? '' : ' [SOURCE MISSING: /reload remove-stale removes it]'}`)
  const registry = managed.length > 0 ? `\nMarketplace plugins (managed, not editable here): ${managed.map(plugin => `${plugin.name}@${plugin.version ?? plugin.spec}`).join(', ')}` : ''
  return `Installed local ACRYL extensions (edit the source, then call acryl_install_plugin to update; /reload re-installs all):\n${lines.join('\n')}${registry}`
}
