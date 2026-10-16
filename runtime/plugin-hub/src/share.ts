// Sharing a plugin to its own git repository with a release (spec 044, decisions 1-4, lifecycle.md "Publish: the methods"): the same steps the
// first push of acryl-quick-notes was done with by hand, as one operation whose guards nobody has to remember.
//
//   1. the target: <owner>/<repo> from the options, else package.json `repository`, else the user's own login and the plugin's name
//   2. package.json brought in line: the generated service contract and slots, the three labels, `repository`
//   3. pack, then the secret check over exactly the packed files; any finding refuses
//   4. the guards: a version is released once; a private plugin never goes to a public repository; a public one needs a license
//   5. the repository (created private unless asked public), a commit of exactly the packed files, tag v<version>, push
//   6. the release v<version> with the tarball attached, the labels as topics
//   7. the same tarball kept in the local store
//
// Credentials are the user's own (`git`, `gh`); nothing here reads, stores or asks for a token.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { findSecrets, type SecretFinding } from '@webboxes/app-persistence'
import { syncServiceContract } from './contract.js'
import { parsePluginName } from './name.js'
import { bundleProblem, packFolder, type PackedPlugin } from './pack.js'
import type { PluginStore } from './store.js'
import { readTarball } from './tarball.js'

/** The labels catalogs list a plugin by (decision 1): npm keywords and GitHub topics alike. */
export const PLUGIN_LABELS = ['acryl-package', 'cordis-plugin', 'dsh-plugin'] as const

export type Visibility = 'private' | 'public'

/** The git host, through the user's own login. */
export interface RepositoryHostPort {
  /** The signed-in user, the default owner. */
  login(): string
  repository(owner: string, repo: string): { readonly visibility: Visibility; readonly url: string } | undefined
  createRepository(owner: string, repo: string, visibility: Visibility, description: string): void
  setVisibility(owner: string, repo: string, visibility: Visibility): void
  addTopics(owner: string, repo: string, topics: readonly string[]): void
  releaseExists(owner: string, repo: string, tag: string): boolean
  createRelease(owner: string, repo: string, tag: string, title: string, notes: string, assetPath: string): string
  /** A URL `git` can clone and push with the user's credential helper. */
  cloneUrl(owner: string, repo: string): string
}

/** The user's own git, in a temporary working copy. */
export interface PublishGitPort {
  clone(url: string, dir: string): void
  /** Stage everything, commit; false when there was nothing to commit. */
  commitAll(dir: string, message: string): boolean
  tag(dir: string, tag: string, message: string): void
  /** Push the current branch (named `fallbackBranch` when the repository was empty) and the tag. */
  push(dir: string, tag: string, fallbackBranch: string): void
}

export interface ShareOptions {
  readonly owner?: string
  readonly repo?: string
  /** `public` lists it (the labels make catalogs find it); default: the plugin's `acryl.visibility`, else private. */
  readonly visibility?: Visibility
  readonly notes?: string
}

export type ShareResult =
  | {
    readonly status: 'shared'
    readonly owner: string
    readonly repo: string
    readonly url: string
    readonly visibility: Visibility
    readonly created: boolean
    readonly tag: string
    readonly releaseUrl: string
    readonly name: string
    readonly version: string
    readonly integrity: string
    readonly files: readonly string[]
    /** What was written into the plugin's package.json on the way (contract, labels, repository). */
    readonly updatedManifest: readonly string[]
  }
  | { readonly status: 'refused'; readonly reason: string; readonly secrets?: readonly SecretFinding[] }

const GITHUB_REPOSITORY = /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:#.*)?$/u

function repositoryOf(manifest: Readonly<Record<string, unknown>>): { readonly owner: string; readonly repo: string } | undefined {
  const field = manifest['repository']
  const url = typeof field === 'string' ? field : typeof field === 'object' && field !== null ? (field as { url?: unknown }).url : undefined
  if (typeof url !== 'string') return undefined
  const match = GITHUB_REPOSITORY.exec(url)
  return match?.[1] === undefined || match[2] === undefined ? undefined : { owner: match[1], repo: match[2] }
}

function writeManifest(folder: string, manifest: Record<string, unknown>): void {
  writeFileSync(join(folder, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

/** The plugin's own package.json, with the labels and its repository; returns what it changed. */
function prepareManifest(folder: string, owner: string, repo: string, visibility: Visibility): string[] {
  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>
  const changed: string[] = []
  const keywords = Array.isArray(manifest['keywords']) ? manifest['keywords'].filter((word): word is string => typeof word === 'string') : []
  const missing = PLUGIN_LABELS.filter(label => !keywords.includes(label))
  if (missing.length > 0) { manifest['keywords'] = [...keywords, ...missing]; changed.push(`keywords +${missing.join(', +')}`) }
  if (repositoryOf(manifest) === undefined) {
    manifest['repository'] = { type: 'git', url: `git+https://github.com/${owner}/${repo}.git` }
    changed.push('repository')
  }
  const acryl = typeof manifest['acryl'] === 'object' && manifest['acryl'] !== null ? manifest['acryl'] as Record<string, unknown> : undefined
  if (acryl !== undefined && acryl['visibility'] !== visibility && visibility === 'public') {
    manifest['acryl'] = { ...acryl, visibility }
    changed.push('acryl.visibility public')
  }
  if (changed.length > 0) writeManifest(folder, manifest)
  return changed
}

export function secretsIn(packed: PackedPlugin): SecretFinding[] {
  return findSecrets(readTarball(packed.tarball).map(file => ({ path: file.path, text: Buffer.from(file.content).toString('utf8') })))
}

/** Replace a working copy's files (all but `.git`) with exactly the packed ones. */
function replaceWorkingCopy(dir: string, packed: PackedPlugin): void {
  for (const entry of readdirSync(dir)) if (entry !== '.git') rmSync(join(dir, entry), { recursive: true, force: true })
  for (const file of readTarball(packed.tarball)) {
    const path = join(dir, ...file.path.split('/'))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.content, { mode: file.executable === true ? 0o755 : 0o644 })
  }
}

export async function sharePlugin(folder: string, options: ShareOptions, ports: { readonly host: RepositoryHostPort; readonly git: PublishGitPort; readonly store: PluginStore }): Promise<ShareResult> {
  const refuse = (reason: string, secrets?: readonly SecretFinding[]): ShareResult => ({ status: 'refused', reason, ...(secrets === undefined ? {} : { secrets }) })
  if (!existsSync(join(folder, 'package.json'))) return refuse(`${folder} has no package.json`)
  const before = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>
  const name = parsePluginName(String(before['name']))
  const declared = repositoryOf(before)
  const owner = options.owner ?? declared?.owner ?? name.owner ?? ports.host.login()
  const repo = options.repo ?? declared?.repo ?? name.local
  const acryl = before['acryl'] as { visibility?: unknown } | undefined
  const visibility: Visibility = options.visibility ?? (acryl?.visibility === 'public' ? 'public' : 'private')
  if (visibility === 'public' && typeof before['license'] !== 'string') return refuse('a public plugin needs a "license" in its package.json (for example "MIT")')

  const contract = await syncServiceContract(folder)
  if (!contract.ok) return refuse(`its service contract cannot be read: ${contract.errors.join('; ')}`)
  const updatedManifest = [...(contract.written ? ['service contract and slots'] : []), ...prepareManifest(folder, owner, repo, visibility)]

  const packed = packFolder(folder)
  const notBundle = bundleProblem(packed)
  if (notBundle !== undefined) return refuse(notBundle)
  const secrets = secretsIn(packed)
  if (secrets.length > 0) return refuse(`the secret check found ${String(secrets.length)} possible secret(s) in the files that would be shared; nothing was sent`, secrets)

  const tag = `v${packed.version}`
  const existing = ports.host.repository(owner, repo)
  if (existing !== undefined && existing.visibility === 'public' && visibility === 'private') return refuse(`${owner}/${repo} is public and this plugin is private; a private plugin is never sent to a public repository`)
  if (existing !== undefined && ports.host.releaseExists(owner, repo, tag)) return refuse(`${owner}/${repo} already has release ${tag}; a version is released once, so give this change a new version (acryl plugin version patch)`)

  const kept = ports.store.list().find(entry => entry.name === packed.name.full && entry.version === packed.version)
  if (kept !== undefined && kept.integrity !== packed.integrity) return refuse(`${packed.name.full} ${packed.version} was already saved here with different files; give this change a new version (acryl plugin version patch)`)

  const created = existing === undefined
  if (created) ports.host.createRepository(owner, repo, visibility, typeof before['description'] === 'string' ? before['description'] : packed.name.full)

  const work = mkdtempSync(join(tmpdir(), 'plugin-hub-share-'))
  try {
    const dir = join(work, 'repo')
    ports.git.clone(ports.host.cloneUrl(owner, repo), dir)
    replaceWorkingCopy(dir, packed)
    ports.git.commitAll(dir, `${packed.name.full} ${packed.version}`)
    ports.git.tag(dir, tag, `${packed.name.full} ${packed.version}`)
    ports.git.push(dir, tag, 'main')
    const asset = join(work, packed.fileName)
    writeFileSync(asset, packed.tarball)
    const notes = options.notes ?? `${packed.name.full} ${packed.version}\n\nTarball: ${packed.fileName}\nIntegrity: ${packed.integrity}\nFiles: ${String(packed.files.length)}`
    const releaseUrl = ports.host.createRelease(owner, repo, tag, `${packed.name.full} ${packed.version}`, notes, asset)
    if (existing !== undefined && existing.visibility === 'private' && visibility === 'public') ports.host.setVisibility(owner, repo, 'public')
    ports.host.addTopics(owner, repo, PLUGIN_LABELS)
    ports.store.put(packed.name.full, packed.version, packed.tarball, { from: folder })
    return {
      status: 'shared', owner, repo, url: `https://github.com/${owner}/${repo}`, visibility, created, tag, releaseUrl,
      name: packed.name.full, version: packed.version, integrity: packed.integrity, files: packed.files, updatedManifest,
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
