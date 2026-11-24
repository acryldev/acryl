// Installing an app on this computer (spec 052 Step 1): every place that installs an app (`acryl --gui` and `acryl ade`, Control Center's new app and
// Start) runs this, never `npm install` itself. An app made on a Blends version this computer already has starts from that version's shared Program
// (spec 049: one framework install, read-only), so it adds only its own packages: measured 7-12 MB per extra app instead of 701-754 MB
// (specs/052-acryl-app-os/baseline.md). Everything this module knows is in that file's findings: npm rewrites its hidden lockfile in place, so each app
// gets its own copy; npm trusts that lockfile only when it is newer than every package folder, so the copy is stamped now; Electron unpacks its
// binary on first use and writes `path.txt` only when it downloads, so the Program is unpacked once and `path.txt` written when missing.
// Home is a parameter: where ACRYL's home is stays the caller's one decision (the AppInstance rule of this repo).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs'
import { basename, join, win32 } from 'node:path'

/** Where the Programs are kept in ACRYL's home: `<home>/program/blends-<version>/node_modules`, beside its `sha256.json`. */
export const PROGRAM_DIR = 'program'
const MANIFEST = 'sha256.json'
const LOCKFILE = '.package-lock.json'
const NPM_INSTALL = Object.freeze(['install', '--no-audit', '--no-fund'])

/** The binary's place inside Electron's `dist`, which Electron's own `index.js` reads from `path.txt` (its fallback is right on Linux only). */
const ELECTRON_BINARY = Object.freeze({ darwin: 'Electron.app/Contents/MacOS/Electron', win32: 'electron.exe' })

/**
 * Link `from` into `to`, folder by folder; `skip` gets each file's path under `from`, `/`-separated. Falls back to a copy where a link cannot be made.
 * (Also used by framework/scripts/lib/blend-app.mjs for an OS app's engine folder.)
 */
export function linkTree(from, to, skip = () => false, base = '') {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const path = base === '' ? entry.name : `${base}/${entry.name}`
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (skip(path)) continue
    if (entry.isDirectory()) linkTree(source, target, skip, path)
    else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(source), target)
    else {
      try {
        linkSync(source, target)
      } catch {
        copyFileSync(source, target)
      }
    }
  }
}

/**
 * npm with these arguments, without a shell wherever that is possible: the npm that started this process (npx sets npm_execpath), else on Windows the
 * npm CLI file that installs next to node.exe, run by node itself; only when neither exists `npm`, and `npm.cmd` through a shell on Windows.
 */
export function npmCommand({ env, platform, execPath, exists = existsSync }, args) {
  const cli = env.npm_execpath
  if (cli && /npm-cli\.c?js$/u.test(basename(cli))) return { command: execPath, args: [cli, ...args] }
  if (platform === 'win32') {
    const beside = win32.join(win32.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (exists(beside)) return { command: execPath, args: [beside, ...args] }
    return { command: 'npm.cmd', args, shell: true }
  }
  return { command: 'npm', args }
}

/** The Program an app's `package.json` asks for: `blends-<version>` from its `@acryldev/blends` range (`^1.7.33`, `~1.7.33`, `1.7.33`), else none. */
export function programOf(folder) {
  try {
    const range = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).dependencies?.['@acryldev/blends']
    const version = /^[\^~]?(\d+\.\d+\.\d+(?:-[\w.]+)?)$/u.exec(String(range ?? ''))?.[1]
    return version === undefined ? undefined : `blends-${version}`
  } catch { return undefined }
}

/** Every file under `root` by content, `/`-separated paths from `root`. */
function hashes(root, base = '', into = {}) {
  for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
    const path = base === '' ? entry.name : `${base}/${entry.name}`
    if (entry.isDirectory()) hashes(root, path, into)
    else if (entry.isFile()) into[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex')
  }
  return into
}

/**
 * Put `from`'s node_modules into `to` as one shared tree: an APFS clone on macOS (a write stays in the copy that made it), hard links elsewhere (one
 * file for all). The hidden lockfile is always the app's own copy, stamped now (findings 1 and 2).
 */
function place(from, to, platform) {
  if (platform === 'darwin') execFileSync('cp', ['-cRp', from, to])
  else {
    linkTree(from, to, path => path === LOCKFILE)
    if (existsSync(join(from, LOCKFILE))) copyFileSync(join(from, LOCKFILE), join(to, LOCKFILE))
  }
  const now = new Date()
  if (existsSync(join(to, LOCKFILE))) utimesSync(join(to, LOCKFILE), now, now)
}

/** Electron's binary unpacked (its first use does it) and `path.txt` naming it; nothing when the app has no Electron or the unpack fails (offline). */
function prepareElectron(folder, node, platform) {
  const electron = join(folder, 'node_modules', 'electron')
  if (!existsSync(join(electron, 'package.json'))) return
  if (!existsSync(join(electron, 'dist'))) {
    try { execFileSync(node, ['-e', "require('electron')"], { cwd: folder, stdio: 'ignore' }) } catch {}
  }
  if (existsSync(join(electron, 'dist')) && !existsSync(join(electron, 'path.txt'))) writeFileSync(join(electron, 'path.txt'), ELECTRON_BINARY[platform] ?? 'electron')
}

/**
 * Install the app in `folder`. `npm(args, cwd)` runs npm and resolves to its exit code (the caller's process, so its output reaches the person as
 * today). Returns npm's code and what happened to the Program: `used` (the app started from it), `made` (this install became it), `retired` (the
 * install changed a Program file, so it is no longer shared) or `none` (installed as today: an app that has its packages already, one that is not on
 * a Blends version, one on another disk than the home).
 */
export async function installApp({
  folder, home, npm, npmArgs = NPM_INSTALL, say = () => {}, platform = process.platform, node = process.execPath, device = path => statSync(path).dev,
}) {
  const key = existsSync(join(folder, 'node_modules')) ? undefined : programOf(folder)
  const program = key === undefined ? undefined : join(home, PROGRAM_DIR, key)
  let shared = program !== undefined
  if (shared) {
    mkdirSync(join(home, PROGRAM_DIR), { recursive: true })
    if (device(folder) !== device(join(home, PROGRAM_DIR))) {
      say(`This app's folder is on another disk than ${home}, so it gets its own copy of the framework (about 700 MB) instead of sharing one.`)
      shared = false
    }
  }
  const existing = shared && existsSync(join(program, MANIFEST))
  if (existing) {
    say(`Starting from the shared ${key} already on this computer; only this app's own packages are added.`)
    place(join(program, 'node_modules'), join(folder, 'node_modules'), platform)
  }
  const code = await npm([...npmArgs], folder)
  if (code !== 0 || !shared) return { code, program: 'none' }

  if (existing) {
    // Hard links make one file for all apps: anything that wrote into one in place changed it for every app, so the Program stops being shared.
    const before = JSON.parse(readFileSync(join(program, MANIFEST), 'utf8'))
    const now = hashes(join(program, 'node_modules'))
    const changed = Object.keys(before).filter(path => now[path] !== before[path]).map(path => `node_modules/${path}`)
    if (changed.length === 0) return { code, program: 'used' }
    say(`This install changed ${changed.length} file${changed.length === 1 ? '' : 's'} of the shared Program (${changed.slice(0, 3).join(', ')}); it is no longer shared, the next app makes a new one.`)
    rmSync(program, { recursive: true, force: true })
    return { code, program: 'retired' }
  }

  prepareElectron(folder, node, platform)
  // Made beside its final place and renamed in, so a second install at the same time never sees half a Program.
  const making = `${program}.making-${process.pid}`
  rmSync(making, { recursive: true, force: true })
  mkdirSync(making, { recursive: true })
  place(join(folder, 'node_modules'), join(making, 'node_modules'), platform)
  writeFileSync(join(making, MANIFEST), JSON.stringify(hashes(join(making, 'node_modules'))))
  try {
    renameSync(making, program)
  } catch {
    rmSync(making, { recursive: true, force: true })
    return { code, program: 'none' }
  }
  say(`Kept this app's framework as the shared ${key}: the next app on it adds only its own packages.`)
  return { code, program: 'made' }
}

