/**
 * Starters from a registry: `npm create acrylblends@latest my-app -- --from acryl.example`. A registry is a git repository (or a folder) with an `index.json` and one folder per
 * starter under `blends/<id>/`. Its CI says in the index which runtime an entry is for: only `runtime: acrylblends` entries are apps this package can make (the folder is the
 * app, with an `acryl.template.json`); the others are ACRYL app starters and are refused with one line. Nothing is run: the entry is downloaded, unpacked and copied.
 *
 * A registry grows with every entry and one starter is all that is wanted, so `openRegistry` reads as little as the registry allows. A folder is read in place. A static host
 * serves the index and one archive per entry (`archive`, `integrity`, written when the site deploys: workshop-registry/scripts/registry-archives.mjs). A repository holds no
 * archives, so it is downloaded whole. The public registry is a host with its repository behind it, for when the host cannot give the entry.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Fetchers,
  fetchRegistry,
  fetchTemplate,
  type RegistrySource,
  type Source,
  SourceError,
} from './source'

/** The public registry's repository (the same files the site lists). */
export const DEFAULT_REGISTRY = 'github:acrylblends/acrylblends.github.io'
const DEFAULT_REPOSITORY: Source = {
  kind: 'github',
  owner: 'acrylblends',
  repo: 'acrylblends.github.io',
  ref: undefined,
}

/** The public registry as its site serves it, with an archive per entry. */
const PUBLIC_REGISTRY = 'https://acrylblends.github.io/registry/'

/** Where ACRYL app starters are opened. */
export const ACRYL_APP = 'https://acryl.dev'

/** A registry id: dotted, lower case (`acryl.gtd`, `acrylblends.notes-desktop`, `login.thing`). */
export const REGISTRY_ID = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/

export interface RegistryEntry {
  readonly id: string
  readonly name: string
  readonly version: string
  /** The entry's folder inside the registry, `blends/<id>`. */
  readonly path: string
  /** `acrylblends` (an app this package makes) or `acryl` (an ACRYL app starter). An index written before the field existed has none: those entries are ACRYL's. */
  readonly runtime: 'acrylblends' | 'acryl'
  readonly description?: string
  /** Where a host publishes the entry on its own; a repository's index has none. */
  readonly archive?: EntryArchive
}

/** An entry published as one file: its path in the registry and the integrity of its bytes (`sha512-<base64>`). */
export interface EntryArchive {
  readonly path: string
  readonly integrity: string
}

/** A registry that can be read: what it offers, and one entry's files on request. */
export interface OpenRegistry {
  readonly entries: readonly RegistryEntry[]
  /** Put the entry's files into `dir` (which must not exist yet), held to a template's limits. Nothing of them is run. */
  takeEntry(entry: RegistryEntry, dir: string): Promise<void>
}

/** Where a registry's reading may keep what it downloads, and how it downloads. */
export interface RegistryReading {
  readonly scratch: string
  readonly fetchers: Fetchers
}

/** A host cannot give this entry, which is not a judgement on the entry: the public registry reads its repository instead. */
class EntryUnavailable extends SourceError {}

/** The folder of an unpacked registry that holds `index.json`: the root, or its `registry/` folder (the public registry lives in its site's repository). */
/** @param label - the registry as the person named it (a folder's path, `github:owner/repo`), for the one line when it has no index. */
export function registryRoot(unpacked: string, label = 'this registry'): string {
  for (const candidate of [unpacked, join(unpacked, 'registry')])
    if (existsSync(join(candidate, 'index.json'))) return candidate
  throw new SourceError(
    `${label} has no index.json (a registry is a folder with index.json and blends/<id>/, or index.json in its registry/ folder)`,
  )
}

/** An entry's archive as its index names it: both fields or neither, and a path that stays beside the entries. */
function parseArchive(item: Record<string, unknown>): EntryArchive | undefined {
  if (item.archive === undefined && item.integrity === undefined) return undefined
  const { archive, integrity } = item
  if (
    typeof archive !== 'string' ||
    !/^blends\/[^/\\]+\.tgz$/.test(archive) ||
    archive.includes('..') ||
    typeof integrity !== 'string' ||
    !/^sha512-[A-Za-z0-9+/]+=*$/.test(integrity)
  )
    throw new SourceError(`registry entry ${String(item.id)} has no valid archive`)
  return { path: archive, integrity }
}

/** The entries of an `index.json`, from its text. */
function parseIndex(text: string): RegistryEntry[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new SourceError('the registry index.json is not valid JSON')
  }
  const list = (data as { entries?: unknown }).entries
  if (!Array.isArray(list)) throw new SourceError('the registry index.json has no entries')
  const entries: RegistryEntry[] = []
  for (const item of list as Record<string, unknown>[]) {
    if (typeof item.id !== 'string' || typeof item.path !== 'string') continue
    if (!/^blends\/[^/\\]+$/.test(item.path))
      throw new SourceError(`registry entry ${item.id} has no valid path`)
    const archive = parseArchive(item)
    entries.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : item.id,
      version: typeof item.version === 'string' ? item.version : '0.0.0',
      path: item.path,
      runtime: item.runtime === 'acrylblends' ? 'acrylblends' : 'acryl',
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
      ...(archive ? { archive } : {}),
    })
  }
  return entries
}

/** A registry in a folder, read in place: only the entry that is taken is copied. */
function openFolder(unpacked: string, label: string, reading: RegistryReading): OpenRegistry {
  const root = registryRoot(unpacked, label)
  return {
    entries: parseIndex(readFileSync(join(root, 'index.json'), 'utf8')),
    takeEntry: (entry, dir) =>
      fetchTemplate(
        { kind: 'folder', path: join(root, entry.path) },
        dir,
        join(reading.scratch, 'download'),
        reading.fetchers,
      ),
  }
}

/** A registry that holds no archives, downloaded whole and then read as a folder. */
async function openUnpacked(
  source: Source,
  label: string,
  reading: RegistryReading,
): Promise<OpenRegistry> {
  const unpacked = join(reading.scratch, 'registry')
  await fetchRegistry(source, unpacked, join(reading.scratch, 'download'), reading.fetchers)
  return openFolder(unpacked, label, reading)
}

/** A registry on a static host: its index, then only the archive of the entry that is taken. */
async function openHosted(base: string, reading: RegistryReading): Promise<OpenRegistry> {
  const index = await reading.fetchers.download(`${base}index.json`)
  return {
    entries: parseIndex(Buffer.from(index).toString('utf8')),
    async takeEntry(entry, dir) {
      if (entry.archive === undefined)
        throw new EntryUnavailable(`${base} publishes no archive for ${entry.id}`)
      const bytes = await downloadArchive(`${base}${entry.archive.path}`, entry.id, reading)
      const digest = createHash('sha512').update(bytes).digest('base64')
      if (`sha512-${digest}` !== entry.archive.integrity)
        throw new SourceError(`the archive of ${entry.id} does not match its integrity`)
      const download = join(reading.scratch, 'download')
      mkdirSync(download, { recursive: true })
      const path = join(download, 'entry.tgz')
      writeFileSync(path, bytes)
      await fetchTemplate({ kind: 'tarball', path }, dir, download, reading.fetchers)
    },
  }
}

async function downloadArchive(
  url: string,
  id: string,
  reading: RegistryReading,
): Promise<Uint8Array> {
  try {
    return await reading.fetchers.download(url)
  } catch (cause) {
    throw new EntryUnavailable(
      `could not download the archive of ${id}: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/** Open a registry the person named, reading as little of it as it allows. */
export async function openRegistry(
  source: RegistrySource,
  label: string,
  reading: RegistryReading,
): Promise<OpenRegistry> {
  if (source.kind === 'folder') return openFolder(source.path, source.path, reading)
  if (source.kind === 'hosted') return openHosted(source.base, reading)
  return openUnpacked(source, label, reading)
}

/**
 * Open the public registry: its site, or its repository when the site cannot answer. An entry the site cannot give is taken from the repository too. An archive that
 * came and does not match, or that breaks a template's limits, is refused: only a missing archive is a reason to look elsewhere.
 */
export async function openPublicRegistry(reading: RegistryReading): Promise<OpenRegistry> {
  let site: OpenRegistry
  try {
    site = await openHosted(PUBLIC_REGISTRY, reading)
  } catch {
    return openUnpacked(DEFAULT_REPOSITORY, DEFAULT_REGISTRY, reading)
  }
  return {
    entries: site.entries,
    async takeEntry(entry, dir) {
      try {
        await site.takeEntry(entry, dir)
      } catch (cause) {
        if (!(cause instanceof EntryUnavailable)) throw cause
        const repository = await openUnpacked(DEFAULT_REPOSITORY, DEFAULT_REGISTRY, reading)
        await repository.takeEntry(entry, dir)
      }
    },
  }
}

/** The entry for an id. An ACRYL app starter is refused in one line; an unknown id lists the starters this package can make. */
export function pickEntry(entries: readonly RegistryEntry[], id: string): RegistryEntry {
  const entry = entries.find((candidate) => candidate.id === id)
  if (!entry) {
    const mine = entries
      .filter((candidate) => candidate.runtime === 'acrylblends')
      .map((candidate) => candidate.id)
    throw new SourceError(
      `no starter "${id}" in this registry${mine.length > 0 ? `; starters for create-acrylblends: ${mine.join(', ')}` : ''}`,
    )
  }
  if (entry.runtime !== 'acrylblends')
    throw new SourceError(
      `${entry.id} is an ACRYL app starter: open it in the ACRYL app (${ACRYL_APP}). create-acrylblends makes acrylblends apps.`,
    )
  return entry
}

/**
 * Give a pulled starter to its new owner: the manifest names the app (`acrylblends.<name>`, private), because the registry's id and its public visibility belong to the starter,
 * not to the app made from it. Changes the `metadata` lines of `blend.yaml` (the id, the name, the visibility; the licence is dropped) and nothing else; a manifest it cannot read that way is left as it is.
 */
export function ownManifest(text: string, name: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^metadata:\s*$/.test(line))
  if (start < 0) return text
  let end = start + 1
  while (end < lines.length && /^\s+\S|^\s*$/.test(lines[end] ?? '')) end += 1
  const set = (key: string, value: string) => {
    for (let at = start + 1; at < end; at += 1) {
      const match = new RegExp(`^(\\s+)${key}:.*$`).exec(lines[at] ?? '')
      if (match) {
        lines[at] = `${match[1]}${key}: ${value}`
        return
      }
    }
  }
  set('id', `acrylblends.${name}`)
  set('name', name)
  set('visibility', 'private')
  // The starter's licence is the starter's: the new app names none until its owner chooses one.
  for (let at = end - 1; at > start; at -= 1)
    if (/^\s+license:/.test(lines[at] ?? '')) lines.splice(at, 1)
  return lines.join('\n')
}

/**
 * Keep a pulled starter's `blend.lock.json` true to the app made from it: the lock's origin names the manifest it was written from (its id and the digest of its text,
 * as blends-core's `manifestDigest`), and {@link ownManifest} has just changed both. The plugin folders are copied unchanged, so their digests stand. A lock it cannot
 * read is left as it is (`npm run snapshot capture` writes it again).
 */
export function ownLock(text: string, manifestText: string, name: string): string {
  let lock: unknown
  try {
    lock = JSON.parse(text)
  } catch {
    return text
  }
  const origin = (lock as { origin?: unknown } | null)?.origin
  if (origin === null || typeof origin !== 'object') return text
  const owned = {
    ...(lock as object),
    origin: {
      ...origin,
      id: `acrylblends.${name}`,
      digest: createHash('sha256').update(manifestText).digest('hex'),
    },
  }
  return `${JSON.stringify(owned, null, 2)}\n`
}

/** A DSH profile name for an app, as the framework's scaffold writes it into `scripts/ide-host.mjs` (`acrylblends-<app>`). */
export function profileNameFor(appName: string): string {
  const slug = appName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
  return `acrylblends-${slug === '' ? 'app' : slug}`
}

/**
 * The name the scaffold wrote into a starter where an app names itself: its manifest's one-word `metadata.name`, or else its `package.json` name, which
 * `init` set to the same name. A curated starter's manifest carries a display name ("Productivity Hub"), which the scaffold never wrote.
 */
export function starterName(
  manifestText: string,
  packageText: string | undefined,
): string | undefined {
  const fromManifest = manifestName(manifestText)
  if (fromManifest !== undefined || packageText === undefined) return fromManifest
  let name: unknown
  try {
    name = (JSON.parse(packageText) as { name?: unknown }).name
  } catch {
    return undefined
  }
  return typeof name === 'string' && name !== '' ? name : undefined
}

/** The app's name as a starter's `blend.yaml` gives it (`metadata.name`), or undefined. */
export function manifestName(text: string): string | undefined {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^metadata:\s*$/.test(line))
  if (start < 0) return undefined
  for (let at = start + 1; at < lines.length && /^\s+\S|^\s*$/.test(lines[at] ?? ''); at += 1) {
    const match = /^\s+name:\s*["']?([^"'#\s]+)["']?\s*(?:#.*)?$/.exec(lines[at] ?? '')
    if (match) return match[1]
  }
  return undefined
}

/**
 * Where the scaffold wrote an app's name (its `__APP_NAME__`): the headings and the `description:` line of the agents' instructions and skills,
 * the README's title, and the page's `APP_NAME` constant. A starter made from an app still says that app's name there; the app made from it says its own.
 */
const PROSE_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md']
/** The lines of those files the scaffold put the name on. */
const NAMED_LINE = /^(?:#{1,6} |description: )/
const SKILL_SCOPES = ['.claude/skills', '.agents/skills']
const CODE_FILES = ['src/routes.ts', 'src/app.ts']

/**
 * Give a starter's scaffold files the new app's name: `from` (the starter's `metadata.name`) becomes `to` where it stands as a whole name on a
 * heading or `description:` line of the agents' instructions, skills and README, and in the `APP_NAME` constant; the host script's DSH profile
 * follows. Nothing else is read for the name, so one that is also a common word (`notes`) never rewrites a route, a string or a sentence. Plugins and the lock stay as the starter
 * recorded them.
 * @returns the files it changed, relative to `dir`.
 */
export function renameApp(dir: string, from: string, to: string): string[] {
  if (from === to || !/^[A-Za-z0-9][\w.-]*$/.test(from)) return []
  const escaped = from.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const whole = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g')
  const prose = [...PROSE_FILES]
  for (const scope of SKILL_SCOPES) {
    const root = join(dir, scope)
    if (!existsSync(root)) continue
    for (const skill of readdirSync(root, { withFileTypes: true }))
      if (skill.isDirectory()) prose.push(`${scope}/${skill.name}/SKILL.md`)
  }
  const changed: string[] = []
  const rewrite = (file: string, edit: (text: string) => string) => {
    const path = join(dir, file)
    if (!existsSync(path)) return
    const text = readFileSync(path, 'utf8')
    const next = edit(text)
    if (next === text) return
    writeFileSync(path, next)
    changed.push(file)
  }
  for (const file of prose)
    rewrite(file, (text) =>
      text
        .split('\n')
        .map((line) => (NAMED_LINE.test(line) ? line.replace(whole, to) : line))
        .join('\n'),
    )
  const constant = new RegExp(`(\\bAPP_NAME = )(['"])${escaped}\\2`, 'g')
  for (const file of CODE_FILES) rewrite(file, (text) => text.replace(constant, `$1$2${to}$2`))
  // npm's lock names the root package twice (top level and `packages[""]`); a lock it cannot read is left as it is.
  rewrite('package-lock.json', (text) => {
    try {
      const lock = JSON.parse(text) as {
        name?: unknown
        packages?: Record<string, { name?: unknown }>
      }
      const root = lock.packages?.['']
      if (lock.name !== from && root?.name !== from) return text
      if (lock.name === from) lock.name = to
      if (root !== undefined && root.name === from) root.name = to
      return `${JSON.stringify(lock, null, 2)}\n`
    } catch {
      return text
    }
  })
  const profile = profileNameFor(from)
  rewrite('scripts/ide-host.mjs', (text) =>
    text.replaceAll(`'${profile}'`, `'${profileNameFor(to)}'`),
  )
  return changed
}
