// The one argument every face takes to say where a plugin comes from (spec 044 lifecycle.md, "Pull: the sources"):
//
//   store:<name>[@<version>]            the local store on this machine
//   github:<owner>/<repo>[@<version>]   that repository's release tarball (latest release when no version)
//   https://github.com/<owner>/<repo>   the same, written as the repository's address
//   npm:<name>[@<version>]              the npm registry
//   /absolute/path/plugin-1.0.0.tgz     a tarball file
//   https://host/path/plugin-1.0.0.tgz  a tarball URL
//   /absolute/path/folder               a source folder (installed as a plugin you edit, not pulled)
//   <name>[@<version>]                  the store if it has the name, else npm
//
// A raw git address (`git+https://...`, `git@host:...`, `github:owner/repo#branch`) is refused: it installs whatever a branch holds at that
// moment, with no release and no checksum (spec 044 decision 3, D7).
import { isAbsolute } from 'node:path'
import { parsePluginName, type PluginName } from './name.js'
import { parseVersion } from './version.js'

export type PluginSource =
  | { readonly kind: 'store'; readonly name: PluginName; readonly version?: string }
  | { readonly kind: 'github'; readonly owner: string; readonly repo: string; readonly version?: string }
  | { readonly kind: 'npm'; readonly name: PluginName; readonly version?: string }
  | { readonly kind: 'name'; readonly name: PluginName; readonly version?: string }
  | { readonly kind: 'tarball-file'; readonly path: string }
  | { readonly kind: 'tarball-url'; readonly url: string }
  | { readonly kind: 'folder'; readonly path: string }

export class InvalidPluginSourceError extends Error {
  constructor(readonly input: string, readonly reason: string) {
    super(`${JSON.stringify(input)} cannot be pulled: ${reason}`)
    this.name = 'InvalidPluginSourceError'
  }
}

const TARBALL = /\.(?:tgz|tar\.gz)$/iu
const GITHUB_OWNER = /^[a-z0-9](?:[a-z0-9-]{0,38})$/iu
const GITHUB_REPO = /^[a-z0-9._-]{1,100}$/iu
const RAW_GIT = /^(?:git\+|git:|git@|ssh:\/\/|gitlab:|bitbucket:|gist:)/iu

/** `name@1.2.3` or `@scope/name@1.2.3` into its name and version; the `@` of a scope is not a version separator. */
function splitVersion(input: string, raw: string): { readonly base: string; readonly version?: string } {
  const at = input.lastIndexOf('@')
  if (at <= 0) return { base: input }
  const base = input.slice(0, at)
  const version = input.slice(at + 1).replace(/^v(?=\d)/u, '')
  if (parseVersion(version) === undefined) throw new InvalidPluginSourceError(raw, `${JSON.stringify(input.slice(at + 1))} is not an exact version such as 1.2.3`)
  return { base, version }
}

function named(kind: 'store' | 'npm' | 'name', rest: string, raw: string): PluginSource {
  const { base, version } = splitVersion(rest, raw)
  let name: PluginName
  try { name = parsePluginName(base) } catch (cause) {
    throw new InvalidPluginSourceError(raw, cause instanceof Error ? cause.message : String(cause))
  }
  return { kind, name, ...(version === undefined ? {} : { version }) }
}

function github(owner: string, repoWithVersion: string, raw: string): PluginSource {
  if (repoWithVersion.includes('#')) throw new InvalidPluginSourceError(raw, 'a branch or commit is not a release; name a released version (github:owner/repo@1.2.3) or leave it out for the latest release')
  const { base: repo, version } = splitVersion(repoWithVersion.replace(/\.git$/u, ''), raw)
  if (!GITHUB_OWNER.test(owner)) throw new InvalidPluginSourceError(raw, `${JSON.stringify(owner)} is not a GitHub user or organization`)
  if (!GITHUB_REPO.test(repo)) throw new InvalidPluginSourceError(raw, `${JSON.stringify(repo)} is not a GitHub repository name`)
  return { kind: 'github', owner, repo, ...(version === undefined ? {} : { version }) }
}

/** Read the source argument. A path must be absolute: a relative one means nothing to a browser page or a background engine. */
export function parsePluginSource(input: string): PluginSource {
  const raw = input.trim()
  if (raw === '') throw new InvalidPluginSourceError(input, 'it is empty')
  if (RAW_GIT.test(raw)) throw new InvalidPluginSourceError(raw, 'a git address installs whatever a branch holds, with no release and no checksum; pull a released version (github:owner/repo@1.2.3) or a folder')
  if (raw.startsWith('store:')) return named('store', raw.slice('store:'.length), raw)
  if (raw.startsWith('npm:')) return named('npm', raw.slice('npm:'.length), raw)
  if (raw.startsWith('github:')) {
    const [owner, repo, extra] = raw.slice('github:'.length).split('/')
    if (owner === undefined || repo === undefined || extra !== undefined) throw new InvalidPluginSourceError(raw, 'write github:<owner>/<repository>[@<version>]')
    return github(owner, repo, raw)
  }
  if (/^https?:\/\//iu.test(raw)) {
    let url: URL
    try { url = new URL(raw) } catch { throw new InvalidPluginSourceError(raw, 'it is not a valid URL') }
    if (url.protocol !== 'https:') throw new InvalidPluginSourceError(raw, 'only https is accepted, so nobody on the network can change what is installed')
    if (TARBALL.test(url.pathname)) return { kind: 'tarball-url', url: url.href }
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      const [owner, repo, section, sub, tag] = parts
      if (owner !== undefined && repo !== undefined && parts.length === 2 && url.hash === '') return github(owner, repo, raw)
      if (owner !== undefined && repo !== undefined && section === 'releases' && sub === 'tag' && tag !== undefined && parts.length === 5) return github(owner, `${repo}@${tag}`, raw)
      throw new InvalidPluginSourceError(raw, 'name the repository (https://github.com/owner/repo) or one of its releases (.../releases/tag/v1.2.3)')
    }
    throw new InvalidPluginSourceError(raw, 'a URL must point to a .tgz file or a GitHub repository')
  }
  if (isAbsolute(raw)) return TARBALL.test(raw) ? { kind: 'tarball-file', path: raw } : { kind: 'folder', path: raw }
  if (/^\.{1,2}(?:[\\/]|$)/u.test(raw) || raw.includes('\\')) throw new InvalidPluginSourceError(raw, 'a path must be absolute')
  return named('name', raw, raw)
}

/** The argument that names a source, so a result or a record can be read back by `parsePluginSource`. */
export function formatPluginSource(source: PluginSource): string {
  const at = (version: string | undefined): string => (version === undefined ? '' : `@${version}`)
  switch (source.kind) {
    case 'store': return `store:${source.name.full}${at(source.version)}`
    case 'npm': return `npm:${source.name.full}${at(source.version)}`
    case 'name': return `${source.name.full}${at(source.version)}`
    case 'github': return `github:${source.owner}/${source.repo}${at(source.version)}`
    case 'tarball-file': return source.path
    case 'tarball-url': return source.url
    case 'folder': return source.path
  }
}
