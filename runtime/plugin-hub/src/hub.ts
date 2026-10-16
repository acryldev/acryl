// The plugin hub: the one set of operations every face drives (a chat command, a CLI verb, an agent tool, the Plugins page), so a result is the
// same whichever face asked (spec 044 lifecycle.md, "One service, four faces"). Host-independent: the app supplies what it has through ports
// (which services it provides, its installer, its source folders), and an app without an installer still saves and pulls into the store.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pullPlugin, type RegistryPort, type ReleasePort } from './pull.js'
import { formatPluginSource, parsePluginSource, type PluginSource } from './source.js'
import { savePlugin } from './save.js'
import { sharePlugin, type PublishGitPort, type RepositoryHostPort, type ShareOptions, type ShareResult } from './share.js'
import type { PluginStore, StoredVersion } from './store.js'
import { bumpVersion, compareVersions, parseVersion, type VersionBump } from './version.js'

/** The outcome an installer reports, in the shape DSH's `pluginManager` returns (`ChangeResult`), reduced to what the hub reads. */
export interface InstallOutcome {
  readonly application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  readonly error?: { readonly code: string }
  readonly packageResult?: { readonly output: string }
}

/** What installs a stored tarball into the running app and lists what is installed: DSH's `pluginManager` in a DSH-based app. */
export interface InstallerPort {
  installBundle(tarballPath: string): Promise<InstallOutcome>
  listBundles(): Promise<readonly { readonly name: string; readonly version?: string; readonly enabled: boolean; readonly installed: boolean; readonly removable: boolean }[]>
}

export interface HubPorts {
  readonly store: PluginStore
  readonly releases?: ReleasePort
  readonly registry?: RegistryPort
  readonly download?: (url: string) => Promise<Uint8Array>
  /** Whether the app provides a service on the host side, for the service contract check. */
  readonly has: (service: string) => boolean
  /** The installer, read when needed (it may load after the hub); undefined when the app has none. */
  readonly installer: () => InstallerPort | undefined
  /** The git host and git for sharing (the user's own `gh` and `git`); without them sharing is unavailable and says so. */
  readonly share?: { readonly host: RepositoryHostPort; readonly git: PublishGitPort }
}

export type PullStatus = 'installed' | 'restart-required' | 'stored' | 'missing-services' | 'install-failed' | 'overridden' | 'cancelled'

export interface PullResult {
  readonly status: PullStatus
  readonly name: string
  readonly version: string
  readonly integrity: string
  readonly path: string
  /** False when the store already held these exact bytes. */
  readonly added: boolean
  readonly fetchedFrom: string
  /** Whether the plugin declares a host service contract the hub could check (a stock DSH plugin usually has none). */
  readonly contractChecked: boolean
  /** The required host services this app lacks; the plugin is kept but not installed. */
  readonly missing?: readonly string[]
  /** Why it is only stored, when it is. */
  readonly reason?: string
  readonly outcome?: InstallOutcome
}

export interface SaveResult {
  readonly name: string
  readonly version: string
  readonly integrity: string
  readonly path: string
  readonly files: readonly string[]
  readonly added: boolean
}

export type UpdateResult =
  | { readonly status: 'updated' | 'restart-required'; readonly name: string; readonly from?: string; readonly to: string; readonly source: string; readonly pull: PullResult }
  | { readonly status: 'up-to-date'; readonly name: string; readonly version: string; readonly source: string }
  | { readonly status: 'not-updatable'; readonly name: string; readonly reason: string }
  | { readonly status: 'failed'; readonly name: string; readonly source: string; readonly pull: PullResult }

/** The same source without a version, so it names the newest release; undefined for a file, URL or folder, which have no newer release. */
function followLatest(source: PluginSource): PluginSource | undefined {
  switch (source.kind) {
    case 'github': return { kind: 'github', owner: source.owner, repo: source.repo }
    case 'npm': return { kind: 'npm', name: source.name }
    case 'name': return { kind: 'name', name: source.name }
    case 'store': case 'tarball-file': case 'tarball-url': case 'folder': return undefined
  }
}

export interface InstalledPlugin {
  readonly name: string
  readonly version?: string
  readonly enabled: boolean
  readonly removable: boolean
}

/**
 * The host half of a plugin's service contract against an app: the services its `acryl.requires.host` names that the app does not provide.
 * A plugin without a contract is not refused; `checked` says so, and a missing service would then show as PENDING after install.
 */
export function missingHostServices(manifest: Readonly<Record<string, unknown>>, has: (service: string) => boolean): { readonly checked: boolean; readonly missing: readonly string[] } {
  const acryl = manifest['acryl'] as { requires?: { host?: unknown } } | undefined
  const required = acryl?.requires?.host
  if (!Array.isArray(required)) return { checked: false, missing: [] }
  return { checked: true, missing: required.filter((service): service is string => typeof service === 'string' && !has(service)) }
}

/** A source folder by absolute path, or by its package name or folder name under one of the app's source roots. */
export function findSourceFolder(nameOrFolder: string, sourceRoots: readonly (string | undefined)[]): string | undefined {
  if (isAbsolute(nameOrFolder)) return existsSync(join(nameOrFolder, 'package.json')) ? nameOrFolder : undefined
  for (const root of sourceRoots) {
    if (root === undefined || !existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(root, entry.name)
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown }
        if (pkg.name === nameOrFolder || entry.name === nameOrFolder) return dir
      } catch { /* not a plugin folder */ }
    }
  }
  return undefined
}

export interface PluginHub {
  readonly store: PluginStore
  saved(): StoredVersion[]
  save(folder: string): SaveResult
  bump(folder: string, bump: VersionBump): { readonly name: string; readonly from: string; readonly to: string }
  pull(source: string, options?: { readonly install?: boolean; readonly expectIntegrity?: string }): Promise<PullResult>
  installed(): Promise<InstalledPlugin[] | undefined>
  share(folder: string, options?: ShareOptions): Promise<ShareResult>
  /** Pull and install the newest release of an installed plugin from where it was pulled before (the store records that). */
  update(name: string): Promise<UpdateResult>
}

export function createPluginHub(ports: HubPorts): PluginHub {
  const { store } = ports
  const hub: PluginHub = {
    store,
    saved: () => store.list(),

    save(folder) {
      const { packed, stored, added } = savePlugin(folder, store)
      return { name: stored.name, version: stored.version, integrity: stored.integrity, path: stored.path, files: packed.files, added }
    },

    bump(folder, bump) {
      const file = join(folder, 'package.json')
      const text = readFileSync(file, 'utf8')
      const pkg = JSON.parse(text) as Record<string, unknown>
      if (typeof pkg['version'] !== 'string') throw new Error(`${file} has no "version"`)
      const next = bumpVersion(pkg['version'], bump)
      const indent = /^(\s+)"/mu.exec(text)?.[1] ?? '  '
      writeFileSync(file, `${JSON.stringify({ ...pkg, version: next }, null, indent)}\n`)
      return { name: String(pkg['name']), from: pkg['version'], to: next }
    },

    async pull(argument, options = {}) {
      const pulled = await pullPlugin(parsePluginSource(argument), {
        store,
        ...(ports.releases === undefined ? {} : { releases: ports.releases }),
        ...(ports.registry === undefined ? {} : { registry: ports.registry }),
        ...(ports.download === undefined ? {} : { download: ports.download }),
      }, options.expectIntegrity === undefined ? {} : { expectIntegrity: options.expectIntegrity })
      const base = { name: pulled.stored.name, version: pulled.stored.version, integrity: pulled.stored.integrity, path: pulled.stored.path, added: pulled.added, fetchedFrom: pulled.fetchedFrom }
      const contract = missingHostServices(pulled.manifest, ports.has)
      if (contract.missing.length > 0) return { ...base, status: 'missing-services', contractChecked: true, missing: contract.missing }
      if (options.install === false) return { ...base, status: 'stored', contractChecked: contract.checked }
      const installer = ports.installer()
      if (installer === undefined) return { ...base, status: 'stored', contractChecked: contract.checked, reason: 'this app has no plugin installer (DSH\'s plugin manager is not loaded)' }
      const outcome = await installer.installBundle(pulled.stored.path)
      const status: PullStatus = outcome.error !== undefined || outcome.application === 'failed' ? 'install-failed' : outcome.application === 'applied' ? 'installed' : outcome.application
      return { ...base, status, contractChecked: contract.checked, outcome }
    },

    async share(folder, options = {}) {
      if (ports.share === undefined) return { status: 'refused', reason: 'sharing is not available in this app (no git host connection)' }
      return sharePlugin(folder, options, { host: ports.share.host, git: ports.share.git, store })
    },

    async update(name) {
      const installedVersion = (await hub.installed())?.find(plugin => plugin.name === name)?.version
      const records = store.list().filter(entry => entry.name === name)
      const record = records.find(entry => entry.version === installedVersion) ?? records[0]
      if (record === undefined) return { status: 'not-updatable', name, reason: `${name} was not pulled through the plugin hub, so where its newer versions are is not known; pull it once from its source (github:, npm:)` }
      let latest: PluginSource | undefined
      try { latest = followLatest(parsePluginSource(record.from)) } catch { latest = undefined }
      if (latest === undefined) return { status: 'not-updatable', name, reason: `${name} came from ${record.from}, which has no newer releases; pull a newer file or release explicitly` }
      const source = formatPluginSource(latest)
      const current = parseVersion(installedVersion ?? record.version)
      const fetched = await hub.pull(source, { install: false })
      const newest = parseVersion(fetched.version)
      if (current !== undefined && newest !== undefined && compareVersions(newest, current) <= 0) return { status: 'up-to-date', name, version: current.text, source }
      if (fetched.status === 'missing-services') return { status: 'failed', name, source, pull: fetched }
      const pulled = await hub.pull(`store:${name}@${fetched.version}`)
      const from = installedVersion ?? record.version
      if (pulled.status === 'installed') return { status: 'updated', name, from, to: pulled.version, source, pull: pulled }
      if (pulled.status === 'restart-required') return { status: 'restart-required', name, from, to: pulled.version, source, pull: pulled }
      return { status: 'failed', name, source, pull: pulled }
    },

    async installed() {
      const installer = ports.installer()
      if (installer === undefined) return undefined
      return (await installer.listBundles()).filter(bundle => bundle.installed).map(bundle => ({
        name: bundle.name, ...(bundle.version === undefined ? {} : { version: bundle.version }), enabled: bundle.enabled, removable: bundle.removable,
      }))
    },
  }
  return hub
}
