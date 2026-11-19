// Packing a plugin's source folder into its tarball. Which files go in follows npm's rules closely enough that a plugin packs the same way
// here as with `npm pack`: the package.json `files` list when there is one, otherwise everything not ignored; package.json, README and
// LICENSE always; never node_modules, .git or the other files npm never packs. The file list is returned too: it is exactly what a share
// checks for secrets and sends, so nothing leaves the machine that was not checked.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parsePluginName, type PluginName } from './name.js'
import { integrityOf, writeTarball, type TarballFile } from './tarball.js'
import { parseVersion } from './version.js'

export interface PackedPlugin {
  readonly name: PluginName
  readonly version: string
  /** The package.json as packed. */
  readonly manifest: Readonly<Record<string, unknown>>
  /** Paths inside the package, sorted. */
  readonly files: readonly string[]
  readonly tarball: Buffer
  readonly integrity: string
  /** `<local name with dots and @ removed>-<version>.tgz`, as `npm pack` names it (`@a/b.c` 1.0.0 is `a-b.c-1.0.0.tgz`). */
  readonly fileName: string
}

/** Never packed, wherever they are (npm's own list plus ACRYL's staging folder). */
const NEVER = new Set(['node_modules', '.git', '.svn', '.hg', 'CVS', '.DS_Store', '.npmrc', 'npm-debug.log', '.lock-wscript', '.wafpickle-N', 'config.gypi', 'package-lock.json', '.acryl-staged', '.acryl-plugin-hub'])
const NEVER_PATTERN = [/^\._/u, /\.swp$/u, /\.orig$/u, /^\.#/u, /\.tgz$/u]
/** Always packed from the folder's top level, case-insensitively, as npm does. */
const ALWAYS = [/^package\.json$/iu, /^readme(?:\..*)?$/iu, /^licen[cs]e(?:\..*)?$/iu, /^changelog(?:\..*)?$/iu]

function never(name: string): boolean {
  return NEVER.has(name) || NEVER_PATTERN.some(pattern => pattern.test(name))
}

/** A gitignore-style pattern as a test on a `/`-separated path: `*` within a level, `**` across levels, a trailing `/` for folders. */
function patternTest(pattern: string): (path: string, isDirectory: boolean) => boolean {
  const directoryOnly = pattern.endsWith('/')
  const body = pattern.replace(/^\//u, '').replace(/\/$/u, '')
  const anchored = pattern.startsWith('/') || body.includes('/')
  const source = body.split('**').map(part => part.split('*').map(text => text.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')).join('[^/]*')).join('.*')
  const regex = new RegExp(anchored ? `^${source}(?:/.*)?$` : `(?:^|/)${source}(?:/.*)?$`, 'u')
  return (path, isDirectory) => (!directoryOnly || isDirectory || path.includes('/')) && regex.test(path)
}

function ignoreRules(dir: string): ((path: string, isDirectory: boolean) => boolean)[] {
  const file = existsSync(join(dir, '.npmignore')) ? '.npmignore' : existsSync(join(dir, '.gitignore')) ? '.gitignore' : undefined
  if (file === undefined) return []
  return readFileSync(join(dir, file), 'utf8').split(/\r?\n/u).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('#') && !line.startsWith('!')).map(patternTest)
}

function walk(root: string, current: string, out: string[], skip: (path: string, isDirectory: boolean) => boolean): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (never(entry.name) || entry.isSymbolicLink()) continue
    const full = join(current, entry.name)
    const path = relative(root, full).split(sep).join('/')
    if (skip(path, entry.isDirectory())) continue
    if (entry.isDirectory()) walk(root, full, out, skip)
    else if (entry.isFile()) out.push(path)
  }
}

/** The files `npm pack` would put in the package, as `/`-separated paths. */
export function packageFiles(dir: string, manifest: Readonly<Record<string, unknown>>): string[] {
  const all: string[] = []
  const declared = manifest['files']
  if (Array.isArray(declared)) {
    walk(dir, dir, all, () => false)
    const tests = declared.filter((entry): entry is string => typeof entry === 'string').map(entry => patternTest(`/${entry.replace(/^\.\//u, '')}`))
    const main = typeof manifest['main'] === 'string' ? manifest['main'].replace(/^\.\//u, '') : undefined
    return all.filter(path => tests.some(test => test(path, false)) || path === main || (!path.includes('/') && ALWAYS.some(pattern => pattern.test(path)))).sort()
  }
  const rules = ignoreRules(dir)
  walk(dir, dir, all, (path, isDirectory) => rules.some(rule => rule(path, isDirectory)))
  return all.filter(path => path !== '.npmignore' && path !== '.gitignore').sort()
}

/** The files package.json's `bin` names, as package paths. */
function binTargets(manifest: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const bin = manifest['bin']
  const targets = typeof bin === 'string' ? [bin] : typeof bin === 'object' && bin !== null ? Object.values(bin as Record<string, unknown>) : []
  return new Set(targets.filter((target): target is string => typeof target === 'string').map(target => target.replace(/^\.\//u, '')))
}

/**
 * Whether a file starts with `#!`. Executable files are decided from the content and `bin`, never from the file mode: Windows has no
 * executable bit, so the mode would make the same files pack to different bytes on different systems.
 */
function startsWithShebang(content: Uint8Array): boolean {
  return content[0] === 0x23 && content[1] === 0x21
}

export class PackError extends Error {
  constructor(readonly dir: string, readonly reason: string) {
    super(`cannot pack ${dir}: ${reason}`)
    this.name = 'PackError'
  }
}

/** Pack a source folder. Refuses a folder without a valid name and version, which no target could hold. */
export function packFolder(dir: string): PackedPlugin {
  let manifest: Record<string, unknown>
  try { manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown> } catch {
    throw new PackError(dir, 'package.json is missing or not valid JSON')
  }
  if (typeof manifest['name'] !== 'string') throw new PackError(dir, 'package.json has no "name"')
  const name = parsePluginName(manifest['name'])
  const version = manifest['version']
  if (typeof version !== 'string' || parseVersion(version) === undefined) throw new PackError(dir, 'package.json has no semantic "version" such as 0.1.0')
  const files = packageFiles(dir, manifest)
  const bins = binTargets(manifest)
  const entries: TarballFile[] = files.map(path => {
    const content = readFileSync(join(dir, ...path.split('/')))
    return { path, content, executable: bins.has(path) || startsWithShebang(content) }
  })
  const tarball = writeTarball(entries)
  const fileName = `${name.full.replace(/^@/u, '').replace('/', '-')}-${version}.tgz`
  return { name, version, manifest, files, tarball, integrity: integrityOf(tarball), fileName }
}

/**
 * Why DeepSeek Harness's installer would refuse this package as "not a bundle", or undefined when it would not: package.json names its
 * Loader patch in `dsh.bundle.patch`, and that file is among the packed ones. Checked before anything is sent, so no target ever holds a
 * plugin that no app can install.
 */
export function bundleProblem(packed: Pick<PackedPlugin, 'manifest' | 'files'>): string | undefined {
  const dsh = packed.manifest['dsh'] as { bundle?: { patch?: unknown } } | undefined
  const patch = dsh?.bundle?.patch
  const example = '"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }'
  if (typeof patch !== 'string') return `package.json does not name its Loader patch, so no app can install it; add ${example} and a cordis.patch.yml that inserts its row`
  const path = patch.replace(/^\.\//u, '')
  if (!packed.files.includes(path)) return `its Loader patch ${path} is not among the files that would be sent; create it, or add it to package.json "files"`
  return undefined
}

/** The package.json inside a tarball, which every pull reads to know what it got before installing it. */
export function manifestOfTarball(files: readonly TarballFile[]): Record<string, unknown> {
  const file = files.find(entry => entry.path === 'package.json')
  if (file === undefined) throw new Error('the tarball has no package.json')
  try { return JSON.parse(Buffer.from(file.content).toString('utf8')) as Record<string, unknown> } catch {
    throw new Error('the tarball\'s package.json is not valid JSON')
  }
}
