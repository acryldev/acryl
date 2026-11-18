/**
 * The public plugin registry as the frame reads it. cordisplugins.github.io lists a plugin by its public GitHub repository: the repository has the topic
 * `cordis-plugin` and its latest release has one packed copy; the site's sync finds it within the hour and publishes `registry/index.json`
 * (formatVersion 1, one entry per plugin). This reads that file, on the Host: no token, no GitHub search, and a page of the app never fetches it.
 * When the file cannot be read the answer says so in plain words, and a copy read earlier is still shown.
 */

import type { RegistryEntryView, RegistryView } from './contract.ts'

export const REGISTRY_INDEX_URL = 'https://cordisplugins.github.io/registry/index.json'

type FetchLike = (input: string, init?: { readonly signal?: AbortSignal; readonly headers?: Record<string, string> }) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>

/** What the person is told when the registry cannot be read. */
const OFFLINE = 'The registry could not be reached. Check your internet connection and try again.'
const BUSY = 'The registry is busy right now. Try again in a few minutes.'
const CHANGED = 'The registry answered in a way this app does not understand. Try again later.'

const SOURCE = /\bgithub:([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)@([0-9][0-9A-Za-z.+-]*)/u

/** A plugin's folder name: the name without its scope, lower case (`@owner/notes` is `notes`). */
export const bareName = (name: string): string => (name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name).toLowerCase()

/** What the app already has and who the person is, so a row can say "Added" and "Yours". */
export interface RegistryMarks {
  /** The folder names of the app's plugins. */
  readonly names: ReadonlySet<string>
  /** `owner/repo` (lower case) of every plugin the app pulled. */
  readonly repos: ReadonlySet<string>
  /** GitHub accounts that are the person's own (signed in, or the share account), lower case. */
  readonly accounts: ReadonlySet<string>
}

/** `owner/repo` of a `github:` source, lower case; undefined for any other source. */
export function repoOfSource(source: string): string | undefined {
  const match = SOURCE.exec(source)
  return match === null ? undefined : `${match[1] ?? ''}/${match[2] ?? ''}`.toLowerCase()
}

/** The unpacked size of the native package an entry brings for this computer: its OS and CPU first, then its OS for any CPU (plugin-share/native.ts). */
export function downloadFor(native: unknown, platform: string = process.platform, arch: string = process.arch): number | undefined {
  if (!Array.isArray(native)) return undefined
  const sized = native.filter((item): item is { os: unknown; cpu?: unknown; size: number } => isRecord(item) && typeof item.size === 'number' && item.size > 0)
  return (sized.find(item => item.os === platform && item.cpu === arch) ?? sized.find(item => item.os === platform && item.cpu === undefined))?.size
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The entries a Blends app can pull: the ones the index gives a version and a pull line (a plugin whose code is only a folder of another
 * repository has none). @throws when the index is not formatVersion 1.
 */
export function registryEntries(index: unknown, marks: RegistryMarks): RegistryEntryView[] {
  if (!isRecord(index) || index.formatVersion !== 1 || !Array.isArray(index.entries)) throw new Error('registry: not a version 1 index')
  const entries: RegistryEntryView[] = []
  for (const entry of index.entries as unknown[]) {
    if (!isRecord(entry)) continue
    const { name, description, repo, version, published, compatibility, acrylPull, install, native } = entry
    // A plugin made in a Blends app has only `install` (`npm run acryl -- plugin pull github:...`); the others have `acrylPull`.
    const pull = typeof acrylPull === 'string' ? acrylPull : typeof install === 'string' ? install : undefined
    if (typeof name !== 'string' || typeof repo !== 'string' || typeof version !== 'string' || pull === undefined) continue
    const source = SOURCE.exec(pull)?.[0]
    const where = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/u.exec(repo)
    if (source === undefined || where === null) continue
    const owner = where[1] ?? ''
    const repository = repoOfSource(source)
    const download = downloadFor(native)
    entries.push({
      name,
      description: typeof description === 'string' ? description : '',
      owner,
      url: `https://github.com/${owner}/${where[2] ?? ''}`,
      version,
      ...(typeof published === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(published) ? { published } : {}),
      compatibility: typeof compatibility === 'string' ? compatibility : 'DSH stock',
      source,
      installed: marks.names.has(bareName(name)) || (repository !== undefined && marks.repos.has(repository)),
      mine: marks.accounts.has(owner.toLowerCase()),
      ...(download === undefined ? {} : { download }),
    })
  }
  // The person's own first, then the newest release, then by name.
  return entries.sort((a, b) => Number(b.mine) - Number(a.mine) || (b.published ?? '').localeCompare(a.published ?? '') || a.name.localeCompare(b.name))
}

/** The raw index, read once in a while: a fresh copy within `ttlMs`, else a new read, else the copy read before with the time it was read. */
export function createRegistryReader(fetcher: FetchLike, options: { readonly ttlMs?: number; readonly timeoutMs?: number; readonly now?: () => number } = {}): () => Promise<{ readonly index: unknown; readonly readAt: string } | { readonly message: string }> {
  const ttl = options.ttlMs ?? 300_000
  const timeout = options.timeoutMs ?? 10_000
  const now = options.now ?? Date.now
  let kept: { readonly index: unknown; readonly at: number } | undefined
  return async () => {
    if (kept !== undefined && now() - kept.at < ttl) return { index: kept.index, readAt: new Date(kept.at).toISOString() }
    const abort = new AbortController()
    const timer = setTimeout(() => { abort.abort() }, timeout)
    let failure = OFFLINE
    try {
      const response = await fetcher(REGISTRY_INDEX_URL, { signal: abort.signal, headers: { Accept: 'application/json' } })
      if (response.ok) {
        const index = await response.json()
        kept = { index, at: now() }
        return { index, readAt: new Date(kept.at).toISOString() }
      }
      failure = response.status === 403 || response.status === 429 ? BUSY : response.status >= 500 ? OFFLINE : CHANGED
    } catch (cause) {
      failure = cause instanceof SyntaxError ? CHANGED : OFFLINE
    } finally {
      clearTimeout(timer)
    }
    return kept === undefined ? { message: failure } : { index: kept.index, readAt: new Date(kept.at).toISOString() }
  }
}

/** The registry as the frame shows it, from one read of the index. */
export async function readRegistryView(read: ReturnType<typeof createRegistryReader>, marks: () => Promise<RegistryMarks>): Promise<RegistryView> {
  const got = await read()
  if ('message' in got) return { status: 'unavailable', message: got.message }
  try {
    return { status: 'ready', entries: registryEntries(got.index, await marks()), readAt: got.readAt }
  } catch {
    return { status: 'unavailable', message: CHANGED }
  }
}

/** What one pull answers, as the app's `pluginShare` gives it: the plugin now running, or why it was refused (`plugins/plugin-share/pull-check.ts`). */
export type PullAnswer =
  | { readonly ok: true; readonly name: string; readonly version: string; readonly action: 'installed' | 'updated' | 'unchanged'; readonly state: string }
  | { readonly ok: false; readonly refusal: string; readonly reason: string; readonly next: string }

/** The slice of the app's `pluginShare` service the registry uses. */
export interface PluginShareSlice {
  pull(source: string): Promise<PullAnswer>
  list(): readonly { readonly name: string; readonly pulledFrom?: string }[]
}

/** The running app's `pluginShare`, read at each call (the app's rows come and go with a reload); undefined when the app has none. */
export function pluginShareOf(service: () => unknown): PluginShareSlice | undefined {
  const share = service() as Partial<PluginShareSlice> | undefined
  return typeof share?.pull === 'function' && typeof share.list === 'function' ? (share as PluginShareSlice) : undefined
}
