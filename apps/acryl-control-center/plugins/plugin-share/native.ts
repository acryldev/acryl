/**
 * A plugin's native packages: large, per-OS npm packages a plugin needs and declares instead of depending on (a pull installs no dependencies). The
 * Office preview plugin is the first: DSH's LibreOffice engine, 150 to 190 MB per OS, which the frame does not install (frame/packages.json `omit`).
 *
 * A plugin's package.json names them, one entry per OS and CPU, each pinned by npm's sha512:
 *
 *   "@acryldev/blends": { "native": [
 *     { "package": "@deepseek-ai/libreoffice-kit-darwin-arm64", "version": "0.1.5", "os": "darwin", "cpu": "arm64",
 *       "integrity": "sha512-...", "size": 153171456 } ] }
 *
 * The pull reads the list (the policy below is pure), downloads only this computer's entry from the npm registry, checks its sha512, unpacks it into
 * the app's home (`<home>/native/<package>@<version>`, so an `npm install` cannot prune it) and links `node_modules/<package>` to it, where the package
 * that needs it resolves it. Only a missing package or the empty placeholder (`@acryldev/absent`) is replaced; a real copy npm installed stays.
 * Removing the plugin takes the link and the download away; an app's start links again what an `npm install` unlinked.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** Where a native package is downloaded from: the npm registry, and nothing else. */
export const NATIVE_REGISTRY = 'https://registry.npmjs.org'

/** The most a plugin's native packages may unpack to, all of its entries for one computer together. */
export const NATIVE_MAX_BYTES = 1_000_000_000

/** The empty package the frame installs in place of an omitted one (frame/packages.json `omit.placeholder`). */
export const PLACEHOLDER = '@acryldev/absent'

/** The file written last into an unpacked native package: without it the folder is an interrupted download. */
const COMPLETE = '.acrylblends-native-complete'

export type NativeOs = 'darwin' | 'linux' | 'win32'
export type NativeCpu = 'arm64' | 'x64'

export interface NativePackage {
  /** The npm package, as the package that needs it resolves it. */
  readonly package: string
  /** Its exact version. */
  readonly version: string
  readonly os: NativeOs
  /** Absent: any CPU of that OS (a WebAssembly build). */
  readonly cpu?: NativeCpu
  /** npm's `dist.integrity` of the tarball. */
  readonly integrity: string
  /** npm's `dist.unpackedSize`, in bytes: what a person is told before it is downloaded. */
  readonly size: number
}

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/u
const OSES: readonly string[] = ['darwin', 'linux', 'win32']
const CPUS: readonly string[] = ['arm64', 'x64']

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The native packages a plugin's package.json declares (none without the field), or why the declaration cannot be used. */
export function nativesOf(
  manifest: Readonly<Record<string, unknown>>,
): { readonly natives: readonly NativePackage[] } | { readonly error: string } {
  const section = manifest.acrylblends
  if (section === undefined || (isObject(section) && section.native === undefined))
    return { natives: [] }
  if (!isObject(section) || !Array.isArray(section.native))
    return { error: '"acrylblends.native" is not a list' }
  const natives: NativePackage[] = []
  for (const [index, entry] of section.native.entries()) {
    const at = `acrylblends.native[${index}]`
    if (!isObject(entry)) return { error: `${at} is not an object` }
    const { package: name, version, os, cpu, integrity, size } = entry
    if (typeof name !== 'string' || !NPM_NAME.test(name))
      return { error: `${at}.package is not an npm package name` }
    if (typeof version !== 'string' || !EXACT_VERSION.test(version))
      return { error: `${at}.version is not an exact version` }
    if (typeof os !== 'string' || !OSES.includes(os))
      return { error: `${at}.os is not one of ${OSES.join(', ')}` }
    if (cpu !== undefined && (typeof cpu !== 'string' || !CPUS.includes(cpu)))
      return { error: `${at}.cpu is not one of ${CPUS.join(', ')}` }
    if (typeof integrity !== 'string' || !SHA512.test(integrity))
      return { error: `${at}.integrity is not npm's sha512 of the tarball` }
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0)
      return { error: `${at}.size is not a number of bytes` }
    if (size > NATIVE_MAX_BYTES)
      return {
        error: `${at} unpacks to ${size} bytes, more than a plugin may bring (${NATIVE_MAX_BYTES})`,
      }
    natives.push({
      package: name,
      version,
      os: os as NativeOs,
      ...(cpu === undefined ? {} : { cpu: cpu as NativeCpu }),
      integrity,
      size,
    })
  }
  return { natives }
}

/** The entry for this computer: its OS, and its CPU or any. Undefined when the plugin brings nothing for it. */
export function nativeFor(
  natives: readonly NativePackage[],
  platform: string = process.platform,
  arch: string = process.arch,
): NativePackage | undefined {
  return (
    natives.find((entry) => entry.os === platform && entry.cpu === arch) ??
    natives.find((entry) => entry.os === platform && entry.cpu === undefined)
  )
}

/** The tarball's address in the npm registry, the way npm names it. */
export function tarballUrl(native: Pick<NativePackage, 'package' | 'version'>): string {
  const base = native.package.slice(native.package.lastIndexOf('/') + 1)
  return `${NATIVE_REGISTRY}/${native.package}/-/${base}-${native.version}.tgz`
}

/** What a download and an unpack are, so a test can hand in local ones. */
export interface NativePorts {
  /** Write the file at `url` to `file`. */
  readonly download: (url: string, file: string) => Promise<void>
  /** Unpack the `.tgz` at `file` into `dir`, without the archive's top folder (npm's `package/`) and with the files' modes. */
  readonly unpack: (file: string, dir: string) => Promise<void>
}

/** The real ones: https from the npm registry, and the system's tar (macOS, Linux, and Windows 10 and later carry one), which keeps execute bits. */
export function nativePorts(): NativePorts {
  return {
    async download(url, file) {
      if (!url.startsWith(`${NATIVE_REGISTRY}/`))
        throw new Error(`${url} is not in the npm registry`)
      const response = await fetch(url)
      if (!response.ok || response.body === null)
        throw new Error(`the npm registry answered ${response.status} for ${url}`)
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(file))
    },
    unpack: (file, dir) =>
      new Promise((done, fail) => {
        const tar = spawn('tar', ['-xzf', file, '-C', dir, '--strip-components=1'], {
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        })
        let error = ''
        tar.stderr.on('data', (chunk: Buffer) => {
          error += chunk.toString()
        })
        tar.once('error', fail)
        tar.once('exit', (code) =>
          code === 0 ? done() : fail(new Error(`tar could not unpack ${file}: ${error.trim()}`)),
        )
      }),
  }
}

/** Where the app keeps what it downloaded, and where it links it. */
export interface NativePlaces {
  /** The app's folder, whose `node_modules` the link goes into. */
  readonly root: string
  /** The app's home, which keeps the downloads. */
  readonly home: string
}

/** The folder a native package is unpacked into. */
export function nativeStore(
  home: string,
  native: Pick<NativePackage, 'package' | 'version'>,
): string {
  return join(home, 'native', `${native.package.replace('/', '+')}@${native.version}`)
}

const linkOf = (root: string, native: Pick<NativePackage, 'package'>) =>
  join(root, 'node_modules', ...native.package.split('/'))

/** What is at the package's place in node_modules: our link, nothing, something we may replace, or a real package someone installed. */
function placeState(link: string, store: string): 'ours' | 'missing' | 'replaceable' | 'foreign' {
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(link)
  } catch {
    return 'missing'
  }
  if (stat.isSymbolicLink()) {
    let target: string
    try {
      target = realpathSync(link)
    } catch {
      return 'replaceable'
    }
    if (existsSync(store) && target === realpathSync(store)) return 'ours'
    // Another version this app downloaded (the plugin was updated): replaced, never mistaken for a copy npm installed.
    if (existsSync(dirname(store)) && dirname(target) === realpathSync(dirname(store)))
      return 'replaceable'
  }
  let name: unknown
  try {
    name = (JSON.parse(readFileSync(join(link, 'package.json'), 'utf8')) as { name?: unknown }).name
  } catch {
    return stat.isSymbolicLink() ? 'replaceable' : 'foreign'
  }
  return name === PLACEHOLDER ? 'replaceable' : 'foreign'
}

const sha512Of = async (file: string): Promise<string> => {
  const hash = createHash('sha512')
  await pipeline(createReadStream(file), hash)
  return `sha512-${hash.digest('base64')}`
}

/** Download, check and unpack into the store; the store appears whole or not at all. */
async function fetchInto(native: NativePackage, store: string, ports: NativePorts): Promise<void> {
  mkdirSync(dirname(store), { recursive: true })
  const incoming = mkdtempSync(join(dirname(store), '.incoming-'))
  try {
    const file = join(incoming, 'package.tgz')
    await ports.download(tarballUrl(native), file)
    const integrity = await sha512Of(file)
    if (integrity !== native.integrity)
      throw new Error(
        `${native.package}@${native.version} from npm is not the file the plugin names (its sha512 differs)`,
      )
    const unpacked = join(incoming, 'package')
    mkdirSync(unpacked)
    await ports.unpack(file, unpacked)
    const manifest = JSON.parse(readFileSync(join(unpacked, 'package.json'), 'utf8')) as {
      name?: unknown
      version?: unknown
    }
    if (manifest.name !== native.package || manifest.version !== native.version)
      throw new Error(
        `the tarball holds ${String(manifest.name)}@${String(manifest.version)}, not ${native.package}@${native.version}`,
      )
    writeFileSync(join(unpacked, COMPLETE), '')
    rmSync(store, { recursive: true, force: true })
    renameSync(unpacked, store)
  } finally {
    rmSync(incoming, { recursive: true, force: true })
  }
}

/** What `ensureNative` did: downloaded it, only linked a download it had, found it linked, or left a real copy npm installed. */
export type NativeAction = 'downloaded' | 'linked' | 'unchanged' | 'present'

/** Make the native package resolvable from the app: download it unless the store has it, and link it. @throws when the download fails or differs. */
export async function ensureNative(
  native: NativePackage,
  places: NativePlaces,
  ports: NativePorts = nativePorts(),
): Promise<NativeAction> {
  const store = nativeStore(places.home, native)
  const link = linkOf(places.root, native)
  const state = placeState(link, store)
  if (state === 'foreign') return 'present'
  const complete = existsSync(join(store, COMPLETE))
  if (state === 'ours' && complete) return 'unchanged'
  if (!complete) await fetchInto(native, store, ports)
  rmSync(link, { recursive: true, force: true })
  mkdirSync(dirname(link), { recursive: true })
  // A junction on Windows: a directory symlink there needs a privilege a person may not have.
  symlinkSync(store, link, process.platform === 'win32' ? 'junction' : 'dir')
  return complete ? 'linked' : 'downloaded'
}

/** Take the link away and, unless `keepDownload`, the download. A real copy npm installed is never touched. */
export function releaseNative(
  native: Pick<NativePackage, 'package' | 'version'>,
  places: NativePlaces,
  keepDownload = false,
): void {
  const store = nativeStore(places.home, native)
  const link = linkOf(places.root, native)
  if (placeState(link, store) === 'ours') unlinkSync(link)
  if (!keepDownload) rmSync(store, { recursive: true, force: true })
}
