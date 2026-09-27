/**
 * Where a new app starts from (`acryl new --from`, spec 036 `persistence-and-registries.md`): an app or captured Blend folder, a git repository (public or
 * private, reached with the user's own git credentials), or a starter id in a registry (a git repository or folder with `index.json`). Everything is
 * resolved to a local folder that has `blend.yaml`, which `planNewApp` / `writeNewApp` take from there.
 *
 * Git is a port (`GitClone`): the rules here are pure; `gitClone` below is the adapter that shells out to the user's git, never prompting for credentials.
 *
 * @module acryl-harness-runtime/app/start-source
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseRegistryIndex } from '@acryl/blends-core'

/** The public registry: a folder of the acrylblends.github.io repository. `#<folder>` names the folder inside a repository. */
export const PUBLIC_REGISTRY = 'https://github.com/acrylblends/acrylblends.github.io.git#registry'

export type StartSource =
  | { readonly kind: 'folder', readonly path: string }
  | { readonly kind: 'git', readonly url: string, readonly subdir?: string }
  | { readonly kind: 'registry', readonly id: string }

export class StartSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StartSourceError'
  }
}

/** Clone `url` (shallow) into `into`. Throws with git's own message on failure. */
export type GitClone = (url: string, into: string) => void

const GIT_URL = /^(?:https?:\/\/|ssh:\/\/|git@|file:\/\/)|\.git(?:#.*)?$/u
const STARTER_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u

function splitSubdir(reference: string): { url: string, subdir?: string } {
  const hash = reference.lastIndexOf('#')
  if (hash <= 0) return { url: reference }
  const subdir = reference.slice(hash + 1)
  if (subdir === '' || subdir.split('/').some(part => part === '..' || part === '')) throw new StartSourceError(`"${subdir}" is not a folder inside the repository`)
  return { url: reference.slice(0, hash), subdir }
}

/** Pure: what `--from` names. A path that exists is a folder; a git URL is a repository; a dotted id is a registry starter. */
export function classifyStartSource(from: string, isDirectory: (path: string) => boolean): StartSource {
  if (isDirectory(from)) return { kind: 'folder', path: resolve(from) }
  if (GIT_URL.test(from)) return { kind: 'git', ...splitSubdir(from) }
  if (STARTER_ID.test(from)) return { kind: 'registry', id: from }
  throw new StartSourceError(`--from "${from}" is not a folder, a git URL or a starter id (such as acme.accounting)`)
}

/** The adapter: the user's git, shallow, and never waiting on a credentials prompt (a private repository needs the user's own git login). */
export const gitClone: GitClone = (url, into) => {
  const result = spawnSync('git', ['clone', '--depth', '1', '--quiet', url, into], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8' })
  if (result.error !== undefined) throw new StartSourceError(`git is not available: ${result.error.message}`)
  if (result.status !== 0) throw new StartSourceError(`git could not clone ${url}: ${(result.stderr || '').trim().split('\n').at(-1) ?? 'failed'}. A private repository needs your own git login (for GitHub: gh auth login).`)
}

const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory()

export interface ResolvedStartSource {
  /** A local folder with `blend.yaml`. */
  readonly folder: string
  /** Where it came from, for the new app's description and the user's report. */
  readonly origin: string
  /** Remove the temporary clone, if any. */
  dispose(): void
}

/**
 * Resolve `--from` to a local folder. `registry` is a folder or git URL (`#<folder>` allowed) holding `index.json`; the public registry by default.
 * The caller disposes the result when the new app is written.
 */
export function resolveStartSource(from: string, options: { readonly registry?: string, readonly clone?: GitClone } = {}): ResolvedStartSource {
  const clone = options.clone ?? gitClone
  const temporary: string[] = []
  const dispose = (): void => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) }
  const fetch = (reference: string): string => {
    const { url, subdir } = splitSubdir(reference)
    if (isDirectory(url)) return subdir === undefined ? resolve(url) : join(resolve(url), subdir)
    const into = mkdtempSync(join(tmpdir(), 'acryl-source-'))
    temporary.push(into)
    clone(url, join(into, 'repo'))
    return subdir === undefined ? join(into, 'repo') : join(into, 'repo', subdir)
  }
  try {
    const source = classifyStartSource(from, isDirectory)
    let folder: string
    let origin: string
    if (source.kind === 'folder') { folder = source.path; origin = source.path }
    else if (source.kind === 'git') { folder = fetch(source.subdir === undefined ? source.url : `${source.url}#${source.subdir}`); origin = source.url }
    else {
      const registry = options.registry ?? PUBLIC_REGISTRY
      const root = fetch(registry)
      const indexFile = join(root, 'index.json')
      if (!existsSync(indexFile)) throw new StartSourceError(`${registry} has no index.json; it is not a registry`)
      const entry = parseRegistryIndex(readFileSync(indexFile, 'utf8')).entries.find(candidate => candidate.id === source.id)
      if (entry === undefined) throw new StartSourceError(`${registry} has no starter "${source.id}"`)
      folder = join(root, entry.path)
      origin = `${source.id} (${registry})`
    }
    if (!existsSync(join(folder, 'blend.yaml'))) throw new StartSourceError(`${origin} has no blend.yaml; it is not an app or a starter`)
    return { folder, origin, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}
