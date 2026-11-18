/**
 * The app's plugins for Settings → Plugins, read and switched in the app's own files: `blend.yaml` (a row is off with `disabled: true`; a plugin
 * from `plugins/` is off when the `extensions` row's `off` list names it) and the `plugins/` folder (what was written after the app was made, as the
 * `extensions` row finds it). `blend.yaml` is edited by lines, so its comments and layout stay as the person wrote them. The running app takes a
 * switch when its Loader row (`app-plugins`) loads again, which the client asks for.
 */

import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { dirname } from 'node:path'
import { bumpVersion, gitCli, githubCli, parseVersion, PluginStore, savePlugin, sharePlugin, StoreConflictError, storeRootOf, type PublishGitPort, type RepositoryHostPort } from '@webboxes/plugin-hub'
import { samePlan, type AppPluginView, type FramePluginState, type FramePluginView, type SavedPluginResult, type SavedPluginView, type ShareVisibility, type SharedPluginView, type SharePlan } from './contract.ts'

/** One row of `blend.yaml`'s `spec.rows`: where its block starts and ends (line indexes, end exclusive). */
export interface BlendRow {
  readonly id: string
  readonly name: string
  readonly disabled: boolean
  /** The comment lines right above the row, joined: what the row is for. */
  readonly comment: string
  readonly start: number
  readonly end: number
}

const ROW_START = /^(\s*)- id:\s*["']?([\w.@/-]+)["']?\s*$/

export function parseBlendRows(text: string): BlendRow[] {
  const lines = text.split('\n')
  const rows: BlendRow[] = []
  const rowsAt = lines.findIndex(line => /^\s*rows:\s*$/.test(line))
  if (rowsAt < 0) return rows
  for (let index = rowsAt + 1; index < lines.length; index += 1) {
    const match = ROW_START.exec(lines[index] as string)
    if (match === null) continue
    const indent = (match[1] as string).length
    let end = index + 1
    while (end < lines.length) {
      const line = lines[end] as string
      if (line.trim() !== '' && !line.trim().startsWith('#') && line.search(/\S/) <= indent) break
      end += 1
    }
    // A comment line right before the next row belongs to that row: end the block before it.
    while (end > index + 1 && (lines[end - 1] as string).trim().startsWith('#')) end -= 1
    const block = lines.slice(index + 1, end)
    const name = block.map(line => /^\s*name:\s*["']?([^"'#\s]+)/.exec(line)?.[1]).find(found => found !== undefined) ?? match[2] as string
    const comment: string[] = []
    for (let above = index - 1; above > rowsAt && (lines[above] as string).trim().startsWith('#'); above -= 1)
      comment.unshift((lines[above] as string).trim().replace(/^#\s?/, ''))
    rows.push({
      id: match[2] as string,
      name,
      disabled: block.some(line => /^\s*disabled:\s*true\s*(#.*)?$/.test(line)),
      comment: comment.join(' '),
      start: index,
      end,
    })
  }
  return rows
}

/** `blend.yaml` with one row switched: `disabled: true` added under its id, or removed. */
export function setRowOn(text: string, id: string, on: boolean): string {
  const row = parseBlendRows(text).find(entry => entry.id === id)
  if (row === undefined) throw new Error(`blend.yaml has no row "${id}"`)
  const lines = text.split('\n')
  if (on) {
    const kept = lines.filter((line, index) => !(index > row.start && index < row.end && /^\s*disabled:\s*true\s*(#.*)?$/.test(line)))
    return kept.join('\n')
  }
  if (row.disabled) return text
  const indent = ' '.repeat((lines[row.start] as string).search(/-/) + 2)
  lines.splice(row.start + 1, 0, `${indent}disabled: true`)
  return lines.join('\n')
}

/** The plugins from `plugins/` the `extensions` row's `off` list names. */
export function extensionsOff(text: string): string[] {
  const row = parseBlendRows(text).find(entry => entry.name === 'extensions')
  if (row === undefined) return []
  const line = text.split('\n').slice(row.start, row.end).find(entry => /^\s*off:\s*\[/.test(entry))
  const list = line === undefined ? undefined : /\[(.*)\]/.exec(line)?.[1]
  return list === undefined ? [] : list.split(',').map(name => name.trim().replace(/^["']|["']$/g, '')).filter(name => name !== '')
}

/** `blend.yaml` with a plugin from `plugins/` switched: its name taken out of, or put in, the `extensions` row's `off` list. */
export function setMadeOn(text: string, name: string, on: boolean): string {
  const row = parseBlendRows(text).find(entry => entry.name === 'extensions')
  if (row === undefined) throw new Error('blend.yaml has no extensions row, which starts the plugins in plugins/')
  const current = extensionsOff(text)
  const next = on ? current.filter(entry => entry !== name) : current.includes(name) ? current : [...current, name]
  const lines = text.split('\n')
  const block = lines.slice(row.start, row.end)
  const offAt = block.findIndex(entry => /^\s*off:\s*\[/.test(entry))
  const configAt = block.findIndex(entry => /^\s*config:\s*$/.test(entry))
  const fieldIndent = ' '.repeat((lines[row.start] as string).search(/-/) + 2)
  if (offAt >= 0) {
    const at = row.start + offAt
    const indent = (lines[at] as string).slice(0, (lines[at] as string).search(/\S/))
    if (next.length === 0) lines.splice(at, 1)
    else lines[at] = `${indent}off: [${next.join(', ')}]`
  } else if (next.length > 0) {
    if (configAt >= 0) lines.splice(row.start + configAt + 1, 0, `${fieldIndent}  off: [${next.join(', ')}]`)
    else lines.splice(row.end, 0, `${fieldIndent}config:`, `${fieldIndent}  off: [${next.join(', ')}]`)
  }
  return lines.join('\n')
}

const ENTRIES = ['index.ts', 'index.js', 'index.mjs']
const NAME = /^[a-z0-9][a-z0-9-]*$/

/** The folders in `plugins/` the `extensions` row starts: not a library copy (`library.json`), and with an entry file. */
export async function madePlugins(root: string): Promise<string[]> {
  const dir = join(root, 'plugins')
  if (!existsSync(dir)) return []
  let library = new Set<string>()
  try {
    const listed = (JSON.parse(await readFile(join(dir, 'library.json'), 'utf8')) as { plugins?: unknown }).plugins
    if (Array.isArray(listed)) library = new Set(listed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    // No library list: every folder is the app's own.
  }
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && NAME.test(entry.name) && !library.has(entry.name) && ENTRIES.some(file => existsSync(join(dir, entry.name, file))))
    .map(entry => entry.name)
    .sort()
}

/** The first sentence of a file's leading doc comment, without its code marks. */
export function docSummary(source: string): string {
  const comment = /^\s*\/\*\*([\s\S]*?)\*\//.exec(source)?.[1]
  if (comment === undefined) return ''
  const paragraph = comment.split('\n').map(line => line.replace(/^\s*\*\s?/, '').trim())
  const end = paragraph.indexOf('', paragraph.findIndex(line => line !== ''))
  return firstSentence(paragraph.slice(0, end < 0 ? undefined : end).join(' '))
}

/** The first sentence of a text, without code marks, cut to a line's length. */
export function firstSentence(text: string): string {
  const plain = text.replace(/`/g, '').trim()
  const sentence = /^.+?[.!?](\s|$)/.exec(plain)?.[0].trim() ?? plain
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}...` : sentence
}

async function packageDescription(dir: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { description?: unknown }
    if (typeof parsed.description === 'string') return parsed.description
  } catch {
    // No package.json: try the entry's doc comment, then the README.
  }
  for (const entry of [...ENTRIES, ...ENTRIES.map(file => join('src', file))]) {
    try {
      const summary = docSummary(await readFile(join(dir, entry), 'utf8'))
      if (summary !== '') return summary
    } catch {
      // Not this entry file.
    }
  }
  try {
    const readme = await readFile(join(dir, 'README.md'), 'utf8')
    return readme.split('\n').map(line => line.trim()).find(line => line !== '' && !line.startsWith('#')) ?? ''
  } catch {
    return ''
  }
}

/** Who a commit says made it: an agent named in a `Co-Authored-By` trailer, else the commit's author. */
export function commitMaker(author: string, body: string): string {
  const trailer = /^co-authored-by:\s*([^<\n]+?)\s*(<|$)/im.exec(body)?.[1]
  return trailer ?? author
}

export interface GitPort {
  run(args: readonly string[], cwd: string): Promise<{ readonly stdout: string }>
}

async function firstCommit(git: GitPort, root: string, path: string): Promise<{ by: string; at: string } | undefined> {
  try {
    const { stdout } = await git.run(['log', '--diff-filter=A', '--format=%an%x00%aI%x00%B%x1e', '--', path], root)
    const records = stdout.split('\x1e').map(record => record.trim()).filter(record => record !== '')
    const oldest = records.at(-1)
    if (oldest === undefined) return undefined
    const [author = '', at = '', body = ''] = oldest.split('\0')
    return { by: commitMaker(author, body), at }
  } catch {
    return undefined
  }
}

/** The library release each library copy in `plugins/` came from (`library.lock.json`). */
async function libraryVersions(root: string): Promise<Map<string, string>> {
  const versions = new Map<string, string>()
  try {
    const plugins = (JSON.parse(await readFile(join(root, 'plugins', 'library.lock.json'), 'utf8')) as { plugins?: unknown }).plugins
    if (plugins !== null && typeof plugins === 'object') {
      for (const [name, entry] of Object.entries(plugins)) {
        const from = entry !== null && typeof entry === 'object' ? (entry as { from?: unknown }).from : undefined
        if (typeof from === 'string') versions.set(name, from)
      }
    }
  } catch {
    // No lock: no versions to show.
  }
  return versions
}

/**
 * Every plugin of the app: first the app's own plugins (the folders of `plugins/` that are not library copies), each mounted by its `blend.yaml` row
 * or, without one, started by the `extensions` row; then the library rows of `blend.yaml` in their order.
 */
/**
 * Whether a shared plugin's repository is still there: false when GitHub answers that it does not exist (deleted or renamed), undefined when it could
 * not be asked (offline, gh signed out), so a row is marked gone only on GitHub's own word.
 */
export type RepositoryCheck = (url: string) => Promise<boolean | undefined>

const execFileAsync = promisify(execFile)

/** The check through the user's own `gh`, without blocking the Host. */
export const ghRepositoryCheck: RepositoryCheck = async (url) => {
  const where = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/u.exec(url)
  if (where === null) return undefined
  try {
    await execFileAsync('gh', ['repo', 'view', `${where[1] ?? ''}/${where[2] ?? ''}`, '--json', 'url'], { timeout: 15_000 })
    return true
  } catch (cause) {
    const stderr = String((cause as { stderr?: unknown }).stderr ?? '')
    return /could not resolve to a repository|not found/iu.test(stderr) ? false : undefined
  }
}

/** The share records, each checked once: a repository GitHub says is gone is marked so, and the row offers a new share. */
export async function checkedShares(records: Readonly<Record<string, SharedPluginView>>, check: RepositoryCheck): Promise<Record<string, SharedPluginView>> {
  const entries = await Promise.all(Object.entries(records).map(async ([name, shared]): Promise<[string, SharedPluginView]> =>
    [name, (await check(shared.url)) === false ? { url: shared.url, version: shared.version, gone: true, ...(shared.registry === true ? { registry: true } : {}) } : shared]))
  return Object.fromEntries(entries)
}

/** Where a plugin's code is: its folder (absolute) and its main file relative to the app's folder (absent when the file is outside the app). */
export interface PluginLocation {
  readonly folder: string
  readonly main?: string
}

/** A path inside `root` as a relative path with forward slashes, or undefined when it is outside. */
export function insideApp(root: string, file: string): string | undefined {
  const rel = relative(root, file)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined
  return rel.split('\\').join('/')
}

/** The files a plugin's code starts in, first match wins: the entry beside its package.json, then `src/`, then what package.json names, then the README. */
function mainFileOf(folder: string): string | undefined {
  const entries = [...ENTRIES, ...ENTRIES.map(file => join('src', file))]
  const named: string[] = []
  try {
    const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { main?: unknown; exports?: unknown }
    if (typeof manifest.main === 'string') named.push(manifest.main)
    const dot = typeof manifest.exports === 'object' && manifest.exports !== null ? (manifest.exports as Record<string, unknown>)['.'] : manifest.exports
    if (typeof dot === 'string') named.push(dot)
  } catch {
    // No package.json, or not JSON: the entry names above decide.
  }
  return [...entries, ...named, 'README.md'].find(file => existsSync(join(folder, file)))
}

/** The plugin's own folder in `plugins/` with the file its code starts in, else undefined. */
function ownLocation(root: string, name: string): PluginLocation | undefined {
  const folder = join(root, 'plugins', name)
  if (!existsSync(folder)) return undefined
  const entry = mainFileOf(folder)
  return { folder, ...(entry === undefined ? {} : { main: `plugins/${name}/${entry.replace(/^\.\//u, '').split('\\').join('/')}` }) }
}

/** Where a plugin of `blend.yaml` or the frame has its code: a folder of the app's `plugins/`, else the package the app installed (read-only). */
export async function pluginLocation(root: string, name: string): Promise<PluginLocation | undefined> {
  const own = ownLocation(root, name)
  if (own !== undefined) return own
  const found = await modulePackage(root, name)
  if (found?.dir === undefined) return undefined
  const main = found.main === undefined ? undefined : insideApp(root, found.main)
  return { folder: found.dir, ...(main === undefined ? {} : { main }) }
}

/** The newest packed copy of each plugin kept in the app's plugin store, by name. An unreadable store lists nothing. */
export function savedCopies(storeRoot: string | undefined): ReadonlyMap<string, SavedPluginView> {
  const copies = new Map<string, SavedPluginView>()
  if (storeRoot === undefined) return copies
  try {
    for (const stored of new PluginStore(storeRoot).list()) if (!copies.has(stored.name)) copies.set(stored.name, { version: stored.version, path: stored.path })
  } catch {
    // No store, or one that cannot be read: nothing is shown as saved.
  }
  return copies
}

export async function readAppPlugins(root: string, git: GitPort, sharedFile?: string, check?: RepositoryCheck, storeRoot?: string): Promise<AppPluginView[]> {
  const text = await readFile(join(root, 'blend.yaml'), 'utf8')
  const off = new Set(extensionsOff(text))
  const versions = await libraryVersions(root)
  const recorded = await readSharedRecords(sharedFile)
  const shareRecords = check === undefined ? recorded : await checkedShares(recorded, check)
  const blendRows = parseBlendRows(text)
  const own = await madePlugins(root)
  const copies = savedCopies(storeRoot)
  const made = await Promise.all(own.map(async (name): Promise<AppPluginView> => {
    const [description, first] = await Promise.all([packageDescription(join(root, 'plugins', name)), firstCommit(git, root, `plugins/${name}`)])
    const shared = shareRecords[name]
    const saved = copies.get(name)
    const where = ownLocation(root, name)
    const row = blendRows.find(entry => entry.name === name)
    return {
      name,
      kind: 'made',
      ...(first === undefined ? { unsaved: true } : { by: first.by, at: first.at }),
      ...(shared === undefined ? {} : { shared }),
      ...(saved === undefined ? {} : { saved }),
      ...(where === undefined ? {} : { folder: where.folder, ...(where.main === undefined ? {} : { main: where.main }) }),
      description,
      on: row === undefined ? !off.has(name) : !row.disabled,
    }
  }))
  const rows = await Promise.all(blendRows.filter(row => !own.includes(row.name)).map(async (row): Promise<AppPluginView> => {
    const description = row.comment !== '' ? firstSentence(row.comment) : await packageDescription(join(root, 'plugins', row.name))
    const version = versions.get(row.name)
    const where = await pluginLocation(root, row.name)
    return {
      name: row.name,
      kind: 'row',
      ...(version === undefined ? {} : { version }),
      ...(where === undefined ? {} : { folder: where.folder, ...(where.main === undefined ? {} : { main: where.main }) }),
      description,
      on: !row.disabled,
    }
  }))
  return [...made, ...rows]
}

/**
 * Switch one plugin in `blend.yaml`: a row (a library row, or one of the app's own plugins that has a row) gets or loses `disabled: true`; an own
 * plugin without a row is put in or taken out of the `extensions` row's `off` list. @throws when there is no such plugin.
 */
export async function switchAppPlugin(root: string, kind: 'row' | 'made', name: string, on: boolean): Promise<void> {
  const file = join(root, 'blend.yaml')
  const text = await readFile(file, 'utf8')
  const row = parseBlendRows(text).find(entry => entry.name === name)
  let next: string
  if (kind === 'made' && row === undefined) {
    if (!(await madePlugins(root)).includes(name)) throw new Error(`plugins/ has no plugin "${name}"`)
    next = setMadeOn(text, name, on)
  } else {
    if (row === undefined) throw new Error(`blend.yaml has no row "${name}"`)
    next = setRowOn(text, row.id, on)
  }
  if (next !== text) await writeFile(file, next)
}

/** The frame's own Loader rows the list shows: ACRYL's plugins around the app, not DSH's engine rows nor the rows that run the app. */
export function isFramePlugin(moduleName: string, entryId: string): boolean {
  if (entryId.startsWith('app-') || entryId === 'acryl-door') return false
  return moduleName.startsWith('acryl-') || moduleName.startsWith('dsh-client-ui-brand-acryl')
}

/** A Loader row as the frame reads it: its id, module, whether it is switched off, and its fiber's state (Cordis `FiberState`). */
export interface FrameRow {
  readonly id: string
  readonly name: string
  readonly disabled: boolean
  readonly fiberState: number | undefined
}

/** Cordis `FiberState`: PENDING 0, LOADING 1, ACTIVE 2, FAILED 3. */
export function frameRowState(row: FrameRow): FramePluginState {
  if (row.disabled) return 'off'
  if (row.fiberState === 3) return 'failed'
  if (row.fiberState === 2) return 'active'
  return 'waiting'
}

/** A module's package.json, found from the app folder. */
async function modulePackage(root: string, name: string): Promise<{ version?: string; description?: string; dir?: string; main?: string } | undefined> {
  let file: string
  try {
    file = createRequire(join(root, 'package.json')).resolve(name)
  } catch {
    return undefined
  }
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown; description?: unknown }
      if (parsed.name !== name) continue
      return {
        dir,
        main: file,
        ...(typeof parsed.version === 'string' ? { version: parsed.version } : {}),
        ...(typeof parsed.description === 'string' ? { description: parsed.description } : {}),
      }
    } catch {
      // No package.json here: one folder up.
    }
  }
  return undefined
}

/** The frame's own plugins, in Loader order, each with its release and what it does. */
export async function readFramePlugins(root: string, rows: readonly FrameRow[]): Promise<FramePluginView[]> {
  return Promise.all(rows.filter(row => isFramePlugin(row.name, row.id)).map(async (row): Promise<FramePluginView> => {
    const manifest = await modulePackage(root, row.name)
    const main = manifest?.main === undefined ? undefined : insideApp(root, manifest.main)
    return {
      id: row.id,
      name: row.name,
      ...(manifest?.version === undefined ? {} : { version: manifest.version }),
      description: manifest?.description ?? '',
      state: frameRowState(row),
      ...(manifest?.dir === undefined ? {} : { folder: manifest.dir }),
      ...(main === undefined ? {} : { main }),
    }
  }))
}

/** The package.json a local plugin is shared with: the fields the builder's package_plugin writes (plugins/builder/index.ts), plus the Loader
 * patch the plugin-hub's share requires so the package can also be installed as a row. */
export function pluginPackageManifest(name: string, description: string, version = '0.1.0', license?: string): Record<string, unknown> {
  return {
    name,
    version,
    description,
    ...(license === undefined ? {} : { license }),
    type: 'module',
    exports: { '.': './index.ts', './package.json': './package.json' },
    files: ['*.ts', '**/*.ts', 'README.md', 'cordis.patch.yml'],
    // A host package under dependencies brings a second copy of the framework and its services stop matching after a restart (ACRYL measured it);
    // a peer names the version and installs nothing.
    peerDependencies: { '@deepseek-ai/cordis': '4.0.4' },
    keywords: ['cordis', 'cordis-plugin', 'acrylblends'],
    // The plugin-hub refuses a package it cannot install; this names the row that mounts the plugin in a Loader app.
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }
}

/**
 * The shares this app completed, from its own home (`shared-plugins.json`). The record is written only after the hub's whole share succeeded: a
 * package.json can name a repository before the release exists, because the hub prepares it before its guards, and a refused share must not look
 * shared.
 */
export async function readSharedRecords(file: string | undefined): Promise<Readonly<Record<string, SharedPluginView>>> {
  if (file === undefined) return {}
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const records: Record<string, SharedPluginView> = {}
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue
      const { url, version, registry } = value as { url?: unknown; version?: unknown; registry?: unknown }
      if (typeof url === 'string' && typeof version === 'string') records[name] = { url, version, ...(registry === true ? { registry: true } : {}) }
    }
    return records
  } catch {
    return {}
  }
}

/** Remember one completed share in the app's own record. */
export async function recordShare(file: string, name: string, shared: SharedPluginView): Promise<void> {
  const records = { ...(await readSharedRecords(file)), [name]: shared }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(records, null, 2)}\n`)
}

/** Where the frame packages the plugins it shares: under the app's home, never in the app's folder, so a share leaves no file to save. */
export const pluginPackagesOf = (home: string): string => join(home, 'plugin-packages')

/** Copy one local plugin into its package folder under `packages`, the way the builder's package_plugin does; answers the folder. */
export async function packageAppPlugin(root: string, name: string, packages: string, license?: string): Promise<string> {
  if (!(await madePlugins(root)).includes(name)) throw new Error(`plugins/ has no local plugin "${name}"`)
  const source = join(root, 'plugins', name)
  const target = join(packages, name)
  let version = '0.1.0'
  try {
    const previous = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as { version?: unknown }
    // A version already released stays: the plugin-hub refuses a release twice, and a person bumps it deliberately.
    if (typeof previous.version === 'string') version = previous.version
  } catch {
    // No earlier package: the first version.
  }
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !/(^|[\\/])(node_modules|\.git)([\\/]|$)/u.test(path.slice(source.length)),
  })
  const description = await packageDescription(source)
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(pluginPackageManifest(name, description, version, license), null, 2)}\n`)
  // The row a Loader install mounts (the plugin-hub reads this patch); a Blends app adds the folder through its extensions row instead.
  writeFileSync(join(target, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ./index.ts\n`)
  if (!existsSync(join(target, 'README.md'))) {
    writeFileSync(join(target, 'README.md'), `# ${name}\n\n${description}\n\nA Cordis plugin. In an ACRYLBLENDS app: \`acrylblends add <this folder>\`.\n`)
  }
  return target
}

/** Bump one package folder's patch version (what the hub asks for after a release), and answer the new version. */
export async function bumpPackageVersion(dir: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  const current = typeof manifest['version'] === 'string' ? manifest['version'] : undefined
  if (current === undefined || parseVersion(current) === undefined) throw new Error('the package has no semantic version to bump')
  const next = bumpVersion(current, 'patch')
  manifest['version'] = next
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return next
}

/**
 * Keep a packed copy of one local plugin on this machine: the plugin is packaged under the app's home as a share does, then put in the app's plugin
 * store with its checksum. A version is stored once: when this version is already saved with other content, the version is raised (patch) and saved
 * again, so a changed plugin never overwrites an earlier copy. Nothing leaves the machine.
 */
export async function saveAppPlugin(root: string, home: string, name: string): Promise<SavedPluginResult> {
  const dir = await packageAppPlugin(root, name, pluginPackagesOf(home))
  const store = new PluginStore(storeRootOf(home))
  try {
    const { stored, added } = savePlugin(dir, store)
    return { version: stored.version, path: stored.path, added, bumped: false }
  } catch (cause) {
    if (!(cause instanceof StoreConflictError)) throw cause
  }
  await bumpPackageVersion(dir)
  const { stored, added } = savePlugin(dir, store)
  return { version: stored.version, path: stored.path, added, bumped: true }
}

/** Where a share goes through: the user's own `gh` (the repository host) and `git`; a test passes stand-ins, so no test publishes. */
export interface SharePorts {
  readonly host: RepositoryHostPort
  readonly git: PublishGitPort
}

export const githubSharePorts = (): SharePorts => ({ host: githubCli(), git: gitCli() })

/**
 * The hub labels every release with the topics catalogs find a plugin by, and `cordis-plugin` is the one the registry's sync lists a public repository
 * by. A share that was not asked to go to the registry must not put the repository there, so its host takes no topics; a registry share passes them on.
 */
export function listedOnlyWhenAsked(host: RepositoryHostPort, listed: boolean): RepositoryHostPort {
  return { ...host, addTopics: (owner, repo, topics) => { if (listed) host.addTopics(owner, repo, topics) } }
}

/** A completed share: where it went. */
export type ShareAppPluginResult = SharedPluginView & { readonly owner: string; readonly repo: string; readonly tag: string }

/**
 * What sharing one local plugin would do, read without sending anything: it packages the plugin under the app's home and asks the host who is
 * signed in, whether the repository exists and whether this version is released there (then the plan releases the next patch).
 * @param options - the repository owner (the signed-in account when absent), the visibility the person asked for (private when absent: a share is
 *   public only when the person chose it, because anyone can then read and pull it), the license of a public share (MIT when absent; the plan names it)
 *   and whether the public registry lists it (`registry`: the share sets the `cordis-plugin` topic, which the registry's hourly sync finds).
 */
export async function planAppPluginShare(root: string, home: string, name: string, options: { readonly owner?: string; readonly visibility?: ShareVisibility; readonly license?: string; readonly registry?: boolean }, ports: SharePorts): Promise<SharePlan> {
  // The registry lists public repositories only, so a registry share is a public one.
  const registry = options.registry === true
  const visibility: ShareVisibility = registry ? 'public' : options.visibility ?? 'private'
  const license = visibility === 'public' ? (options.license ?? 'MIT') : undefined
  const dir = await packageAppPlugin(root, name, pluginPackagesOf(home), license)
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { version?: unknown }
  const current = typeof manifest.version === 'string' && parseVersion(manifest.version) !== undefined ? manifest.version : undefined
  if (current === undefined) throw new Error(`${name}: its package has no semantic version`)
  const owner = options.owner ?? ports.host.login()
  const repo = name
  const existing = ports.host.repository(owner, repo)
  const released = existing !== undefined && ports.host.releaseExists(owner, repo, `v${current}`)
  return {
    owner,
    repo,
    version: released ? bumpVersion(current, 'patch') : current,
    visibility,
    createsRepository: existing === undefined,
    ...(released ? { released: current } : {}),
    ...(license === undefined ? {} : { license }),
    ...(registry ? { registry } : {}),
  }
}

/**
 * Share one local plugin through the plugin-hub path, exactly as the person confirmed it: the plan is read again, and when it no longer matches
 * (another account signed in, the repository made meanwhile, a version released) nothing is sent and the error says to look again. The hub then
 * publishes to that repository, version and visibility with the user's own `gh` and `git` (it reads no token), and the local store keeps the
 * tarball as it does for every share.
 * @param confirmed - the plan the person said yes to.
 * @param options - the repository owner the frame is configured with (the signed-in account when absent).
 */
export async function shareAppPlugin(
  root: string,
  home: string,
  name: string,
  confirmed: SharePlan,
  options: { readonly owner?: string },
  ports: SharePorts,
): Promise<ShareAppPluginResult> {
  // The visibility is the one the person confirmed: the plan is made again with it, and a change since then still refuses below.
  const plan = await planAppPluginShare(root, home, name, { ...options, visibility: confirmed.visibility, ...(confirmed.license === undefined ? {} : { license: confirmed.license }), ...(confirmed.registry === true ? { registry: true } : {}) }, ports)
  if (!samePlan(plan, confirmed)) throw new Error(`The share changed since you confirmed it (${plan.owner}/${plan.repo} v${plan.version}); nothing was sent. Look at it again.`)
  const dir = join(pluginPackagesOf(home), name)
  // A version is released once: the confirmed plan names the next patch, written now.
  if (plan.released !== undefined && (await bumpPackageVersion(dir)) !== plan.version) throw new Error(`${name}: the next version is not v${plan.version}; nothing was sent`)
  const result = await sharePlugin(dir, { owner: plan.owner, repo: plan.repo, visibility: plan.visibility }, { ...ports, host: listedOnlyWhenAsked(ports.host, plan.registry === true), store: new PluginStore(storeRootOf(home)) })
  if (result.status === 'refused') throw new Error(result.reason)
  // Only a completed share is remembered: the hub prepares the package.json repository before its guards, so that field alone does not prove a release.
  await recordShare(join(home, 'shared-plugins.json'), name, { url: result.url, version: result.version, ...(plan.registry === true ? { registry: true } : {}) })
  return { url: result.url, version: result.version, owner: result.owner, repo: result.repo, tag: result.tag, ...(plan.registry === true ? { registry: true } : {}) }
}
