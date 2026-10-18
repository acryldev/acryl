import { existsSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { canonical, stagedInfo } from './reconcile.js'
import { isProjectPluginPath } from './scopes.js'

/**
 * Where an installed plugin came from. Derived from what the profile already records (its package.json dependency spec, the staged install's
 * `acryl-source.json`, the pnpm lockfile); nothing new is written, so it cannot drift from the truth.
 *
 *   local     built here from a source folder (`file:` install). Editable: has a `source`, a `scope` (project / global / external) and, when staged,
 *             the `contentHash` it was installed from. Reproducing it elsewhere needs its source folder.
 *   registry  installed from npm through the market (a version or range spec). Managed: do not edit; has the resolved `version` and the lockfile
 *             `integrity` digest. Reproducing it elsewhere needs only name and version.
 *   pulled    pulled through the plugin hub (`/plugin pull github:...`, `npm:...`) and installed from the plugin store's tarball (a `file:` spec to
 *             `<store>/<name>/<version>.tgz`). Managed like registry: has the `version`, the `from` source it was pulled from and the tarball's sha512
 *             `integrity`, read from the store's index. Reproducing it elsewhere is pulling `from` again and checking `integrity`.
 *   git       installed from a git URL.
 *   linked    a workspace or link dependency (development checkout).
 *   unknown   anything else; reported, never guessed at.
 */
export const ORIGINS = Object.freeze(['local', 'pulled', 'registry', 'git', 'linked', 'unknown'])

/** The pnpm (lockfile v9) view of the root importer's dependencies and package integrity digests. */
export function readLockfile(profileDir, fs = { existsSync, readFileSync }) {
  const resolved = new Map()
  const integrity = new Map()
  try {
    const file = join(profileDir, 'pnpm-lock.yaml')
    if (!fs.existsSync(file)) return { resolved, integrity }
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    let section = ''
    let current = ''
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (/^[a-z]/u.test(line)) { section = line.replace(/:.*$/u, ''); current = ''; continue }
      if (section === 'importers') {
        const dep = /^ {6}(\S+):$/u.exec(line)
        if (dep) { current = dep[1].replace(/^'|'$/gu, ''); continue }
        const version = /^ {8}version: (.+)$/u.exec(line)
        if (version && current) resolved.set(current, version[1].trim().replace(/^'|'$/gu, ''))
      } else if (section === 'packages') {
        const pkg = /^ {2}'?([^'\s][^']*?)'?:$/u.exec(line)
        if (pkg) { current = pkg[1]; continue }
        const digest = /^ {4}resolution: \{integrity: (\S+?)[,}]/u.exec(line)
        if (digest && current) integrity.set(current, digest[1])
      }
    }
  } catch { /* an unreadable lockfile only means no digests */ }
  return { resolved, integrity }
}

/**
 * The plugin store's record for a `file:` install of one of its tarballs (`<store>/<name>/<version>.tgz`, the layout of plugin-hub's store), or
 * undefined when the path is not a stored tarball of that plugin.
 */
export function storeRecordOf(name, installedPath, fs = { existsSync, readFileSync }) {
  const normalized = installedPath.split(sep).join('/')
  const match = new RegExp(`^(.*)/${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/([^/]+)\\.tgz$`, 'u').exec(normalized)
  if (match === null) return undefined
  const [, root, version] = match
  try {
    const record = JSON.parse(fs.readFileSync(join(root, 'index.json'), 'utf8'))?.plugins?.[name]?.[version]
    return typeof record?.from === 'string' && typeof record?.integrity === 'string' ? { version, from: record.from, integrity: record.integrity } : undefined
  } catch {
    return undefined
  }
}

/** Origin of one dependency spec. */
export function originOf(spec) {
  if (typeof spec !== 'string') return 'unknown'
  if (spec.startsWith('file:')) return 'local'
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|https?:.*\.git|[\w.-]+\/[\w.-]+$)/u.test(spec)) return 'git'
  if (spec.startsWith('workspace:') || spec.startsWith('link:')) return 'linked'
  if (/^(npm:|[\^~<>=*]|\d|latest$|next$|[a-z][\w.-]*$)/u.test(spec)) return 'registry'
  return 'unknown'
}

/**
 * Every user-installed plugin of a profile with its provenance.
 * @param {string} profileDir
 * @param {{ globalDir?: string }} [options] the global extensions directory, to tell the global scope from the project scope
 * @returns {Array<{ name: string, origin: string, spec: string, version?: string, integrity?: string, source?: string, installedDir?: string, scope?: string, contentHash?: string }>}
 */
export function listInstalledPlugins(profileDir, options = {}, fs = { existsSync, readFileSync }) {
  const manifest = join(profileDir, 'package.json')
  if (!fs.existsSync(manifest)) return []
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const lock = readLockfile(profileDir, fs)
  const globalRoot = options.globalDir ? canonical(options.globalDir) : undefined
  return Object.entries(pkg.dependencies ?? {}).map(([name, spec]) => {
    const origin = originOf(spec)
    if (origin === 'local') {
      const installedDir = spec.slice('file:'.length)
      const stored = storeRecordOf(name, installedDir, fs)
      if (stored !== undefined) return { name, origin: 'pulled', spec, version: stored.version, from: stored.from, integrity: stored.integrity }
      const staged = stagedInfo(installedDir, fs)
      const source = staged?.source ?? installedDir
      const real = canonical(source)
      const scope = globalRoot !== undefined && real.replaceAll('\\', '/').startsWith(`${globalRoot.replaceAll('\\', '/')}/`) ? 'global' : isProjectPluginPath(real) ? 'project' : 'external'
      return { name, origin, spec, source, installedDir, scope, ...(staged?.version ? { contentHash: staged.version } : {}) }
    }
    if (origin === 'registry') {
      const version = lock.resolved.get(name)
      const digest = version === undefined ? undefined : lock.integrity.get(`${name}@${version}`)
      return { name, origin, spec, ...(version ? { version } : {}), ...(digest ? { integrity: digest } : {}) }
    }
    return { name, origin, spec }
  })
}
