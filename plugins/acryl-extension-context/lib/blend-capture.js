import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { manifestDigest } from '@acryl/blends-core'
import { isMap, isSeq, parse, parseDocument, stringify } from 'yaml'
import { canonical } from './reconcile.js'
import { hashPackage } from './stage.js'
import { listInstalledPlugins } from './provenance.js'

/**
 * Capture the current state of a profile as a BLEND instance: the plugins installed (marketplace) AND the extensions built here (local), so the
 * whole running composition can be persisted, versioned in git, and reproduced elsewhere.
 *
 * Output, written to `<outDir>` (default `<workspace>/.acryl/blend/`):
 *
 *   blend.yaml         the human-facing intent: a manifest (`Blend` with lineage, else `Blueprint`) that validates against blends-core's v1alpha1 schema (rows by id and package
 *                      name, overrides). Same vocabulary the Loader consumes; nothing invented.
 *   blend.lock.json    the machine state, `formatVersion: 2`: the v1 fields (generator, origin digest of blend.yaml, rows) plus `modules`, one entry per
 *                      installed package: registry -> version + integrity digest (reproduce from name and version); local -> version + sha256 of the
 *                      source tree + the vendored copy (reproduce from the copy, verify by digest). Deterministic: no timestamps, sorted keys.
 *   extensions/<name>/ the source of every local extension, copied so the Blend is self-contained (a global extension outside the project is
 *                      vendored here; the project's own `.acryl-extensions/` folders are copied verbatim).
 *
 * What is deliberately NOT captured: the ACRYL runtime's own plugins (pack, system prompt, brand, market: engine-owned, versioned with ACRYL), the
 * data plugins keep (see state-and-persistence.md), and secrets.
 */

const BASE_BUNDLES = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-sdk-minimal'])
// How a lock names its manifest is the format's rule (@acryl/blends-core), shared with every other reader and writer of a lock.
const sha256 = manifestDigest
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '') || 'blend'

/** The rows a package inserts (`- insert: [{ id, name, config? }]` in its bundle patch). */
export function readBundleRows(profileDir, packageName, fs = { existsSync, readFileSync }) {
  const pkgFile = join(profileDir, 'node_modules', packageName, 'package.json')
  if (!fs.existsSync(pkgFile)) return { rows: [], note: `${packageName}: not installed in node_modules, its rows could not be read` }
  let patchPath
  try { patchPath = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).dsh?.bundle?.patch } catch { return { rows: [], note: `${packageName}: package.json is unreadable` } }
  if (typeof patchPath !== 'string') return { rows: [], note: `${packageName}: declares no bundle patch` }
  const file = join(dirname(pkgFile), patchPath)
  if (!fs.existsSync(file)) return { rows: [], note: `${packageName}: bundle patch ${patchPath} is missing` }
  let patch
  try { patch = parse(fs.readFileSync(file, 'utf8')) } catch (cause) { return { rows: [], note: `${packageName}: bundle patch is not valid YAML (${String(cause?.message ?? cause).split('\n')[0]})` } }
  const rows = []
  for (const op of Array.isArray(patch) ? patch : []) {
    for (const row of Array.isArray(op?.insert) ? op.insert : []) {
      if (typeof row?.id === 'string' && typeof row?.name === 'string') {
        rows.push({ id: row.id, name: row.name, ...(row.config && typeof row.config === 'object' ? { config: row.config } : {}), ...(row.disabled === true ? { disabled: true } : {}) })
      }
    }
  }
  return { rows }
}

/** The profile's own patch layer as manifest overrides (id-targeted config and disabled). Anything richer (`!!js`) is reported, not captured. */
export function readProfileOverrides(profileDir, fs = { existsSync, readFileSync }) {
  const file = join(profileDir, 'cordis.patch.yml')
  if (!fs.existsSync(file)) return { overrides: [] }
  let patch
  try { patch = parse(fs.readFileSync(file, 'utf8')) } catch { return { overrides: [], note: 'the profile patch layer could not be parsed (an expression?): its overrides were not captured' } }
  const overrides = []
  for (const op of Array.isArray(patch) ? patch : []) {
    if (typeof op?.id === 'string' && (op.config !== undefined || op.disabled !== undefined) && !op.insert) {
      overrides.push({ id: op.id, ...(op.config && typeof op.config === 'object' ? { config: op.config } : {}), ...(typeof op.disabled === 'boolean' ? { disabled: op.disabled } : {}) })
    }
  }
  return { overrides }
}

/**
 * @param {{ profileDir: string, workspaceDir?: string, globalDir?: string, id?: string, name?: string, version?: string, description?: string, lineage?: { blueprint: string, blueprintVersion: string } }} options
 * @returns the manifest, its YAML text, the lock, its JSON text, the local extension sources to vendor, and notes about anything not captured
 */
export function captureBlend(options, fs = { existsSync, readFileSync }) {
  const { profileDir, workspaceDir, globalDir } = options
  const profile = JSON.parse(fs.readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const bundles = (profile.dsh?.profile?.bundles ?? []).filter(name => !BASE_BUNDLES.has(name))
  const installed = new Map(listInstalledPlugins(profileDir, { globalDir }, fs).map(plugin => [plugin.name, plugin]))
  const notes = []
  const rows = []
  const modules = []
  const vendored = []
  const workspaceName = workspaceDir ? basename(workspaceDir) : 'blend'

  for (const name of bundles) {
    const plugin = installed.get(name)
    if (plugin === undefined) { notes.push(`${name}: listed as a bundle but not installed as a dependency, skipped`); continue }
    const { rows: pluginRows, note } = readBundleRows(profileDir, name, fs)
    if (note) notes.push(note)
    rows.push(...pluginRows)
    if (plugin.origin === 'registry') {
      modules.push({ name, origin: 'registry', version: plugin.version ?? plugin.spec, ...(plugin.integrity ? { digest: plugin.integrity } : {}) })
      if (!plugin.integrity) notes.push(`${name}: no integrity digest in the lockfile, reproducing it will not be verified`)
    } else if (plugin.origin === 'local') {
      let version = '0.0.0'
      try { version = JSON.parse(fs.readFileSync(join(plugin.source, 'package.json'), 'utf8')).version ?? version } catch { notes.push(`${name}: its source folder is gone (${plugin.source}), it cannot be vendored`); continue }
      const dir = `extensions/${name.replace(/^@/u, '').replace(/\//gu, '__')}`
      modules.push({ name, origin: 'local', version, digest: `sha256:${hashPackage(plugin.source, 64)}`, source: dir })
      vendored.push({ name, from: plugin.source, to: dir })
    } else {
      modules.push({ name, origin: plugin.origin, spec: plugin.spec })
      notes.push(`${name}: origin "${plugin.origin}" is recorded by spec only, reproducing it needs that spec to stay reachable`)
    }
  }
  const { overrides, note: overrideNote } = readProfileOverrides(profileDir, fs)
  if (overrideNote) notes.push(overrideNote)

  const manifest = {
    apiVersion: 'blends.acryl.dev/v1alpha1',
    // blends-core requires a Blend to name its origin. A capture that grew from nothing has none, and a definition without an origin is a Blueprint
    // (shareable as a starting point); pass `lineage` when the state grew from a known Blueprint and it is a Blend.
    kind: options.lineage ? 'Blend' : 'Blueprint',
    metadata: {
      id: options.id ?? `local.${slug(workspaceName)}`,
      name: options.name ?? workspaceName,
      version: options.version ?? '0.1.0',
      ...(options.description ? { description: options.description } : {}),
    },
    spec: { runtime: 'cordis', ...(options.lineage ? { lineage: options.lineage } : {}), ...(rows.length > 0 ? { rows } : {}), ...(overrides.length > 0 ? { overrides } : {}) },
  }
  const manifestText = `# ACRYL ${manifest.kind} captured from a live profile. Edit the intent here; blend.lock.json is machine-generated.\n${stringify(manifest)}`
  modules.sort((a, b) => (a.name < b.name ? -1 : 1))
  const lock = {
    formatVersion: 2,
    generator: { name: 'acryl-extension-context', version: '0.1.0' },
    origin: { id: manifest.metadata.id, kind: manifest.kind, version: manifest.metadata.version, digest: sha256(manifestText) },
    rows,
    modules,
  }
  return { manifest, manifestText, lock, lockText: `${JSON.stringify(lock, null, 2)}\n`, vendored, notes }
}

/** Write a capture to `outDir` (atomic per file); local sources are copied without node_modules or .git. Returns the files written. */
export function writeBlend(capture, outDir) {
  mkdirSync(outDir, { recursive: true })
  const write = (name, text) => { const temp = join(outDir, `${name}.tmp`); writeFileSync(temp, text); renameSync(temp, join(outDir, name)) }
  write('blend.yaml', capture.manifestText)
  write('blend.lock.json', capture.lockText)
  const files = ['blend.yaml', 'blend.lock.json']
  for (const { from, to } of capture.vendored) {
    const target = join(outDir, to)
    rmSync(target, { recursive: true, force: true })   // a re-capture replaces its own vendored copy, never anything else
    mkdirSync(dirname(target), { recursive: true })
    cpSync(from, target, { recursive: true, filter: source => !['node_modules', '.git'].includes(basename(source)) })
    files.push(`${to}/`)
  }
  return files
}

/**
 * Check a written Blend against its own lock, offline: the manifest still matches the digest the lock recorded, and every vendored local
 * extension still hashes to the digest recorded for it. Registry modules are verified when they are installed (their integrity is the lockfile's).
 * @returns {{ ok: boolean, problems: string[], checked: number }}
 */
export function verifyBlend(outDir, fs = { existsSync, readFileSync }) {
  const problems = []
  let checked = 0
  const manifestPath = join(outDir, 'blend.yaml')
  const lockPath = join(outDir, 'blend.lock.json')
  if (!fs.existsSync(manifestPath) || !fs.existsSync(lockPath)) return { ok: false, problems: [`no blend.yaml and blend.lock.json in ${outDir}`], checked }
  let lock
  try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) } catch { return { ok: false, problems: ['blend.lock.json is not valid JSON'], checked } }
  if (lock.formatVersion !== 2) problems.push(`blend.lock.json formatVersion ${lock.formatVersion} is not the one this build reads (2)`)
  checked += 1
  if (lock.origin?.digest !== sha256(fs.readFileSync(manifestPath, 'utf8'))) problems.push('blend.yaml changed since the lock was generated (its digest no longer matches): re-capture, or regenerate the lock')
  for (const module of Array.isArray(lock.modules) ? lock.modules : []) {
    if (module.origin !== 'local') continue
    checked += 1
    const dir = join(outDir, module.source ?? '')
    if (!module.source || !fs.existsSync(join(dir, 'package.json'))) { problems.push(`${module.name}: the vendored source ${module.source} is missing`); continue }
    if (`sha256:${hashPackage(dir, 64)}` !== module.digest) problems.push(`${module.name}: the vendored source differs from the locked digest (edited after capture)`)
  }
  return { ok: problems.length === 0, problems, checked }
}

/**
 * Capture inside an app (`acryl new`): the app folder is the Blend, so nothing is written elsewhere and nothing the user wrote is regenerated.
 *
 *   blend.yaml       the user's own definition is kept, comments and all; a row is appended only for an installed plugin it does not name yet
 *   blend.lock.json  regenerated from that definition: digest, rows, and every module; an extension already in the app's `extensions/` is recorded in
 *                    place (source `extensions/<folder>`), one installed from anywhere else is vendored into `extensions/`
 *
 * @param {{ profileDir: string, appHome: string, globalDir?: string }} options
 */
export function captureApp(options, fs = { existsSync, readFileSync }) {
  const base = captureBlend({ profileDir: options.profileDir, globalDir: options.globalDir }, fs)
  const appReal = canonical(options.appHome)
  const inApp = path => { const real = canonical(path); return real === appReal || real.startsWith(`${appReal}${sep}`) }
  const vendored = []
  const modules = base.lock.modules.map(module => {
    if (module.origin !== 'local') return module
    const copy = base.vendored.find(entry => entry.name === module.name)
    if (copy !== undefined && inApp(copy.from)) return { ...module, source: relative(appReal, canonical(copy.from)).split(sep).join('/') }
    if (copy !== undefined) vendored.push(copy)
    return module
  })
  const manifestPath = join(options.appHome, 'blend.yaml')
  const original = fs.readFileSync(manifestPath, 'utf8')
  const document = parseDocument(original)
  const notes = [...base.notes]
  if (!isMap(document.get('spec'))) throw new Error(`${manifestPath} has no spec map; it is not an app definition`)
  if (!isSeq(document.getIn(['spec', 'rows']))) document.setIn(['spec', 'rows'], document.createNode([]))
  const named = new Set((document.toJS().spec.rows ?? []).map(row => row.id))
  const added = []
  for (const row of base.lock.rows) {
    if (named.has(row.id)) continue
    document.addIn(['spec', 'rows'], document.createNode(row))
    named.add(row.id)
    added.push(row.id)
  }
  const manifestText = added.length === 0 ? original : String(document)
  const manifest = document.toJS()
  const lock = {
    ...base.lock,
    origin: { id: manifest.metadata?.id, kind: manifest.kind, version: manifest.metadata?.version, digest: sha256(manifestText) },
    rows: manifest.spec.rows ?? [],
    modules,
  }
  return { manifest, manifestText, manifestChanged: added.length > 0, addedRows: added, lock, lockText: `${JSON.stringify(lock, null, 2)}\n`, vendored, notes }
}

/** Write an app capture into the app folder (atomic per file). Vendoring never replaces a folder that is already the app's own extension. */
export function writeAppBlend(capture, appHome) {
  const write = (name, text) => { const temp = join(appHome, `${name}.tmp`); writeFileSync(temp, text); renameSync(temp, join(appHome, name)) }
  const files = []
  if (capture.manifestChanged) { write('blend.yaml', capture.manifestText); files.push('blend.yaml') }
  write('blend.lock.json', capture.lockText)
  files.push('blend.lock.json')
  for (const { from, to } of capture.vendored) {
    const target = join(appHome, to)
    if (existsSync(join(target, 'package.json')) && canonical(target) !== canonical(from)) { capture.notes.push(`${to} already exists in the app; ${from} was not vendored over it`); continue }
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    cpSync(from, target, { recursive: true, filter: source => !['node_modules', '.git'].includes(basename(source)) })
    files.push(`${to}/`)
  }
  return files
}
