// Pulling a plugin into the store (spec 044 lifecycle.md, "Pull: the sources"): resolve the source, fetch its tarball, check its sha512, read
// what it is, and keep it. Installing it into an app is the next layer's job (DSH's `pluginManager.installBundle` on the stored file), after
// the app checks the service contract; this module never runs a plugin's code and never runs a package manager.
import { readFileSync } from 'node:fs'
import { parsePluginName } from './name.js'
import { manifestOfTarball } from './pack.js'
import { formatPluginSource, type PluginSource } from './source.js'
import { PluginStore, type StoredVersion } from './store.js'
import { integrityOf, readTarball } from './tarball.js'
import { parseVersion } from './version.js'

/** A release as a git host reports it: its tag and its attached files. */
export interface ReleaseInfo {
  readonly tag: string
  readonly assets: readonly { readonly name: string; readonly url: string }[]
}

/** The git host a `github:` source reads releases from (an HTTP adapter for public repositories, the user's `gh` for private ones). */
export interface ReleasePort {
  /** The release with this tag, or the latest release when `tag` is undefined; undefined when there is none. */
  release(owner: string, repo: string, tag?: string): Promise<ReleaseInfo | undefined>
  /** A release asset's bytes. */
  download(url: string): Promise<Uint8Array>
}

/** The npm registry: a version's tarball address and the integrity the registry records for it. */
export interface RegistryPort {
  resolve(name: string, version?: string): Promise<{ readonly version: string; readonly tarball: string; readonly integrity?: string } | undefined>
  download(url: string): Promise<Uint8Array>
}

export interface PullPorts {
  readonly store: PluginStore
  readonly releases?: ReleasePort
  readonly registry?: RegistryPort
  /** Bytes at an https URL, for a `tarball-url` source. */
  readonly download?: (url: string) => Promise<Uint8Array>
}

export interface PullOptions {
  /** The sha512 a catalog lists for this tarball; a different one is refused. */
  readonly expectIntegrity?: string
}

export interface PulledPlugin {
  readonly stored: StoredVersion
  /** False when the store already held these exact bytes. */
  readonly added: boolean
  readonly manifest: Readonly<Record<string, unknown>>
  /** Where the bytes came from: the release asset or registry URL, or the file. */
  readonly fetchedFrom: string
}

export class PullError extends Error {
  constructor(readonly source: string, readonly reason: string) {
    super(`cannot pull ${source}: ${reason}`)
    this.name = 'PullError'
  }
}

interface Fetched {
  readonly bytes: Uint8Array
  readonly fetchedFrom: string
  /** An integrity the source itself vouches for (npm's `dist.integrity`). */
  readonly vouched?: string
  readonly expectName?: string
  readonly expectVersion?: string
}

function need<T>(port: T | undefined, what: string, source: string): T {
  if (port === undefined) throw new PullError(source, `this app has no ${what} connection`)
  return port
}

async function fetchSource(source: PluginSource, ports: PullPorts, label: string): Promise<Fetched | StoredVersion> {
  switch (source.kind) {
    case 'folder':
      throw new PullError(label, 'a folder is a plugin you edit, not a release; install it as a source plugin (acryl plugin add <folder>)')
    case 'store': {
      const stored = ports.store.get(source.name.full, source.version)
      if (stored === undefined) throw new PullError(label, `the store has no ${source.name.full}${source.version === undefined ? '' : `@${source.version}`}`)
      return stored
    }
    case 'name': {
      const stored = ports.store.get(source.name.full, source.version)
      if (stored !== undefined) return stored
      return fetchSource({ kind: 'npm', name: source.name, ...(source.version === undefined ? {} : { version: source.version }) }, ports, label)
    }
    case 'npm': {
      const registry = need(ports.registry, 'npm registry', label)
      const resolved = await registry.resolve(source.name.full, source.version)
      if (resolved === undefined) throw new PullError(label, `npm has no ${source.name.full}${source.version === undefined ? '' : `@${source.version}`}`)
      return { bytes: await registry.download(resolved.tarball), fetchedFrom: resolved.tarball, ...(resolved.integrity === undefined ? {} : { vouched: resolved.integrity }), expectName: source.name.full, expectVersion: resolved.version }
    }
    case 'github': {
      const releases = need(ports.releases, 'GitHub', label)
      const release = await releases.release(source.owner, source.repo, source.version === undefined ? undefined : `v${source.version}`)
      if (release === undefined) {
        throw new PullError(label, source.version === undefined
          ? `${source.owner}/${source.repo} has no release that this app can see; ask its author to publish one (if it is private, sign in with gh as someone who can read it), or pull a folder`
          : `${source.owner}/${source.repo} has no release v${source.version}`)
      }
      const tarballs = release.assets.filter(asset => /\.tgz$/u.test(asset.name))
      if (tarballs.length !== 1) throw new PullError(label, `release ${release.tag} of ${source.owner}/${source.repo} has ${tarballs.length} .tgz files; a plugin release attaches exactly one`)
      const asset = tarballs[0]!
      const version = release.tag.replace(/^v/u, '')
      return { bytes: await releases.download(asset.url), fetchedFrom: asset.url, ...(parseVersion(version) === undefined ? {} : { expectVersion: version }) }
    }
    case 'tarball-file':
      try { return { bytes: readFileSync(source.path), fetchedFrom: source.path } } catch (cause) {
        throw new PullError(label, `the file cannot be read (${cause instanceof Error ? cause.message : String(cause)})`)
      }
    case 'tarball-url':
      return { bytes: await need(ports.download, 'download', label)(source.url), fetchedFrom: source.url }
  }
}

/** Pull a plugin into the store. Every check runs before anything is stored; a failed pull leaves the store as it was. */
export async function pullPlugin(source: PluginSource, ports: PullPorts, options: PullOptions = {}): Promise<PulledPlugin> {
  const label = formatPluginSource(source)
  const fetched = await fetchSource(source, ports, label)
  if ('storedAt' in fetched) {
    if (options.expectIntegrity !== undefined && options.expectIntegrity !== fetched.integrity) throw new PullError(label, `the stored ${fetched.name}@${fetched.version} has checksum ${fetched.integrity}, not the expected ${options.expectIntegrity}`)
    const manifest = manifestOfTarball(readTarball(readFileSync(fetched.path)))
    return { stored: fetched, added: false, manifest, fetchedFrom: fetched.path }
  }
  const integrity = integrityOf(fetched.bytes)
  for (const expected of [fetched.vouched, options.expectIntegrity]) {
    if (expected !== undefined && expected !== integrity) throw new PullError(label, `the downloaded file's checksum ${integrity} is not the expected ${expected}; nothing was installed`)
  }
  let manifest: Record<string, unknown>
  try { manifest = manifestOfTarball(readTarball(fetched.bytes)) } catch (cause) {
    throw new PullError(label, `it is not a plugin tarball (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  const name = typeof manifest['name'] === 'string' ? manifest['name'] : ''
  const version = typeof manifest['version'] === 'string' ? manifest['version'] : ''
  try { parsePluginName(name) } catch (cause) { throw new PullError(label, cause instanceof Error ? cause.message : String(cause)) }
  if (parseVersion(version) === undefined) throw new PullError(label, `its package.json has no semantic version (${JSON.stringify(version)})`)
  if (fetched.expectName !== undefined && fetched.expectName !== name) throw new PullError(label, `the tarball is ${name}, not ${fetched.expectName}`)
  if (fetched.expectVersion !== undefined && fetched.expectVersion !== version) throw new PullError(label, `the release is v${fetched.expectVersion} but the tarball inside is ${version}`)
  const acryl = typeof manifest['acryl'] === 'object' && manifest['acryl'] !== null ? manifest['acryl'] as Record<string, unknown> : {}
  const record = {
    from: label,
    ...(typeof acryl['requires'] === 'object' && acryl['requires'] !== null ? { requires: acryl['requires'] as Record<string, string[]> } : {}),
    ...(typeof acryl['provides'] === 'object' && acryl['provides'] !== null ? { provides: acryl['provides'] as Record<string, string[]> } : {}),
    ...(typeof manifest['description'] === 'string' ? { description: manifest['description'] } : {}),
  }
  const { added, stored } = ports.store.put(name, version, fetched.bytes, record)
  return { stored, added, manifest, fetchedFrom: fetched.fetchedFrom }
}
