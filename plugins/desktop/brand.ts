/**
 * What a person sees of the running desktop app: its name and its icon. In development the window runs on the Electron that npm unpacked, so macOS labels the Dock
 * and Cmd+Tab "Electron" and draws the atom, however the window is titled. The label and the icon come from the .app bundle, so on macOS the launcher runs a copy of
 * that bundle under the app's own name with the app's icon: `<acryl root>/electron/<app id>.app`, made once (an APFS clone, so it costs no disk and no time),
 * and again when the name or the icon changes. Linux and Windows start the stock Electron as before.
 *
 * The icon is the app's own `assets/icon.png` when it has one, else the ACRYL Blends logo that ships beside this file.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** The logo an app without an icon of its own shows. */
export const DEFAULT_ICON = join(import.meta.dirname, 'assets', 'acrylblends-logo.png')

/** The app's name as a person knows it: the package's name (the frame's header says the same), else the folder's. */
export function appTitle(projectRoot: string): string {
  try {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
      name?: unknown
    }
    if (typeof manifest.name === 'string' && manifest.name.trim() !== '')
      return manifest.name.trim()
  } catch {
    // No manifest, or not JSON: the folder names the app.
  }
  return basename(resolve(projectRoot))
}

/** The icon file: the app's `assets/icon.png`, else the logo of ACRYL Blends. */
export function iconFile(
  projectRoot: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const own = join(projectRoot, 'assets', 'icon.png')
  return exists(own) ? own : DEFAULT_ICON
}

/** The Info.plist keys that name the bundle. The identifier is per app, so two apps never share a Dock slot or a window state. */
export function plistNames(name: string, id: string): Record<string, string> {
  return {
    CFBundleName: name,
    CFBundleDisplayName: name,
    CFBundleIdentifier: `com.acrylblends.app.${id}`,
  }
}

/** The .app bundle around Electron's executable (`.../Electron.app/Contents/MacOS/Electron`), or undefined for a path of another shape. */
export function bundleOf(binary: string): string | undefined {
  const bundle = dirname(dirname(dirname(binary)))
  return bundle.endsWith('.app') ? bundle : undefined
}

/** What the copy was made from: when this changes (a new name, a new icon, a new Electron), the copy is made again. */
export function stampOf(name: string, id: string, icon: Uint8Array, electron: string): string {
  return createHash('sha256')
    .update(JSON.stringify([name, id, electron]))
    .update(icon)
    .digest('hex')
}

/** The iconset sizes macOS reads, as [file, pixels]. */
const ICONSET: readonly (readonly [string, number])[] = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
]

export interface BrandedElectron {
  /** The executable to start: the branded copy's, or the stock one when a copy could not be made. */
  readonly binary: string
  /** Why the stock Electron runs, when it does on macOS. */
  readonly problem?: string
}

/**
 * The Electron executable to start. macOS: the branded copy of the bundle, made when missing or out of date. Anywhere else, or when the copy fails, the stock executable
 * (a failure is returned, never thrown: a window with the wrong Dock label beats no window). `folder` is `<acryl root>/electron`; nothing is written outside it.
 */
export function brandedElectron(options: {
  readonly binary: string
  readonly folder: string
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly platform?: NodeJS.Platform
}): BrandedElectron {
  const platform = options.platform ?? process.platform
  const stock = { binary: options.binary }
  if (platform !== 'darwin') return stock
  const source = bundleOf(options.binary)
  if (source === undefined) return stock
  const target = join(options.folder, `${options.id}.app`)
  const binary = join(target, 'Contents', 'MacOS', basename(options.binary))
  try {
    const version = execFileSync(
      'plutil',
      ['-extract', 'CFBundleVersion', 'raw', '-o', '-', join(source, 'Contents', 'Info.plist')],
      { encoding: 'utf8' },
    ).trim()
    const stamp = stampOf(options.name, options.id, readFileSync(options.icon), version)
    const stampFile = join(options.folder, `${options.id}.stamp`)
    if (existsSync(binary) && readStamp(stampFile) === stamp) return { binary }
    mkdirSync(options.folder, { recursive: true, mode: 0o700 })
    rmSync(target, { recursive: true, force: true })
    cloneBundle(source, target)
    const plist = join(target, 'Contents', 'Info.plist')
    for (const [key, value] of Object.entries(plistNames(options.name, options.id)))
      execFileSync('plutil', ['-replace', key, '-string', value, plist])
    const icns = join(target, 'Contents', 'Resources', 'electron.icns')
    makeIcns(options.icon, icns, join(options.folder, `${options.id}.iconset`))
    // The bundle's seal no longer matches its Info.plist and icon; a local ad-hoc signature makes it whole again so macOS has nothing to object to.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'ignore' })
    writeFileSync(stampFile, stamp)
    return { binary }
  } catch (cause) {
    return {
      binary: options.binary,
      problem: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

function readStamp(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/** A copy of a bundle: an APFS clone where the volume allows it (instant, no extra disk), else a plain copy that keeps the symbolic links the bundle needs. */
function cloneBundle(source: string, target: string): void {
  try {
    execFileSync('cp', ['-c', '-R', source, target])
  } catch {
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true, verbatimSymlinks: true })
  }
}

/** An .icns from one PNG: the iconset sizes by `sips`, then `iconutil`. The iconset folder is removed after. */
function makeIcns(png: string, icns: string, iconset: string): void {
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset, { recursive: true })
  try {
    for (const [file, pixels] of ICONSET)
      execFileSync(
        'sips',
        ['-z', String(pixels), String(pixels), png, '--out', join(iconset, file)],
        { stdio: 'ignore' },
      )
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns])
  } finally {
    rmSync(iconset, { recursive: true, force: true })
  }
}
