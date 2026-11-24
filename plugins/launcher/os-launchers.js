// "Add to Applications" (spec 052 D4): one launcher per app where the OS looks for apps, made on request and removed exactly as written.
//   macOS    ~/Applications/<Name>.app            a small bundle (Info.plist, icon.icns, a script), ad-hoc signed; Spotlight and Launchpad index it
//   Windows  %APPDATA%\Microsoft\Windows\Start Menu\Programs\ACRYL\<Name>.lnk   (a .vbs that runs the app without a console window, an .ico)
//   Linux    ~/.local/share/applications/acryl-<id>.desktop, its icon in ~/.local/share/icons
// Every launcher runs `node <ACRYL home>/shortcuts/shortcut-open.mjs <app folder> [<name>]`: the key of the model is read there, never written into a launcher.
// What was written is recorded in `<ACRYL home>/launchers.json`, which is what removal reads. Per user, no admin rights, nothing in system folders.
// Isolation: nothing is written unless the home is a folder named `.acryl` (the real one of a person); a dev home, a worktree's or a test's never reaches the
// OS menus. The user's home is that folder's parent, never looked up here (AppInstance rule of this repo).
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { join, posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appIdOf, osAppIdOf } from '@acryldev/instance/home'
import { APP_MARKER, readApps } from './apps-registry.js'

export const LAUNCHERS_FILE = 'launchers.json'
/** The managed copies `acryl` keeps in its home: folder, and the name they show (not their folder's). */
const MANAGED = Object.freeze({
  'control-center': 'ACRYL Control Center',
  ade: 'ACRYL ADE',
})
const OPENER_FILES = Object.freeze(['shortcut-open.mjs', 'model-key.js'])

const pathsOf = platform => platform === 'win32' ? win32 : posix

/** Whether launchers may be written for this home: only the person's own `.acryl`. */
export function isLauncherHome(home, platform = process.platform) {
  return pathsOf(platform).basename(home) === '.acryl'
}

/** A name safe as a file or folder name on every OS. */
export const fileName = name => name.replace(/[\u0000-\u001f\\/:*?"<>|]+/gu, '-').replace(/^[\s.]+|[\s.]+$/gu, '').slice(0, 80)

const slug = id => id.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'app'

/** `metadata.name` of an app's blend.yaml (what the app is called), or '' when it names none. */
export function blendNameOf(folder) {
  try {
    const text = readFileSync(join(folder, APP_MARKER), 'utf8')
    return /^metadata:[^\S\n]*\n(?:[ \t]+\S.*\n|[ \t]*\n)*?[ \t]+name:\s*["']?([^\n"'#]+?)["']?\s*(?:#.*)?$/mu.exec(text)?.[1] ?? ''
  } catch { return '' }
}

/** Shell single quotes, for the macOS launch script. */
const shQuote = text => `'${text.replaceAll("'", "'\\''")}'`
/** XML text, for Info.plist. */
const xml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
/** A VBScript string literal. */
const vbs = text => `"${text.replaceAll('"', '""')}"`

/**
 * One argument of a freedesktop `Exec=` line: always in double quotes, with `"`, a backtick, `$` and `\` escaped by a backslash and `%` written `%%`; then the
 * string escape the file format applies first, which doubles every backslash again (a literal backslash is four in the file).
 */
export function desktopExecArg(arg) {
  const quoted = `"${arg.replace(/(["`$\\])/gu, '\\$1').replaceAll('%', '%%')}"`
  return quoted.replaceAll('\\', '\\\\')
}

/**
 * What to write for one app, as data (T010): the files with their contents, the icon to convert or copy, the shortcut to make, what to sign, and every
 * path to record so that removal deletes exactly these. No disk is touched here.
 * `app.osId` is the id the OS knows the running app by (osAppIdOf, T056): the Start shortcut's AppUserModelID and the .desktop's StartupWMClass.
 * @param {{ platform: string, home: string, node: string, app: { id: string, name: string, folder: string, forwardName?: boolean, osId?: string }, icon?: string }} input
 */
export function launcherPlan({ platform, home, node, app, icon }) {
  const P = pathsOf(platform)
  const userHome = P.dirname(home)
  const id = slug(app.id)
  const opener = P.join(home, 'shortcuts', 'shortcut-open.mjs')
  const words = [node, opener, app.folder, ...(app.forwardName === true ? [app.name] : [])]
  const name = fileName(app.name) || id
  const plan = { files: [], record: [], icon: undefined, lnk: undefined, sign: undefined }
  if (platform === 'darwin') {
    const bundle = P.join(userHome, 'Applications', `${name}.app`)
    const identifier = `io.github.acrylblends.${id}`
    plan.files.push(
      {
        path: P.join(bundle, 'Contents', 'Info.plist'),
        content: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n`
          + `  <key>CFBundleName</key><string>${xml(app.name)}</string>\n  <key>CFBundleDisplayName</key><string>${xml(app.name)}</string>\n`
          + `  <key>CFBundleIdentifier</key><string>${xml(identifier)}</string>\n  <key>CFBundleExecutable</key><string>launch</string>\n`
          + `  <key>CFBundlePackageType</key><string>APPL</string>\n  <key>CFBundleVersion</key><string>1</string>\n  <key>CFBundleShortVersionString</key><string>1.0</string>\n`
          + `${icon === undefined ? '' : '  <key>CFBundleIconFile</key><string>icon</string>\n'}  <key>LSUIElement</key><true/>\n</dict>\n</plist>\n`,
      },
      { path: P.join(bundle, 'Contents', 'MacOS', 'launch'), mode: 0o755, content: `#!/bin/sh\nexec ${words.map(shQuote).join(' ')}\n` },
    )
    if (icon !== undefined) plan.icon = { kind: 'icns', from: icon, to: P.join(bundle, 'Contents', 'Resources', 'icon.icns') }
    plan.sign = bundle
    plan.record.push(bundle)
  } else if (platform === 'win32') {
    const own = P.join(home, 'launchers', id)
    const script = P.join(own, `${id}.vbs`)
    const folder = P.join(userHome, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ACRYL')
    const link = P.join(folder, `${name}.lnk`)
    // Window style 0 hides the console; `False` does not wait, so the shortcut ends when the app is started.
    plan.files.push({ path: script, content: `CreateObject("WScript.Shell").Run ${vbs(words.map(word => `"${word}"`).join(' '))}, 0, False\r\n` })
    if (icon !== undefined) plan.icon = { kind: 'ico', from: icon, to: P.join(own, `${id}.ico`) }
    plan.lnk = { path: link, target: 'wscript.exe', args: `"${script}"`, icon: plan.icon?.to, workingDir: own, ...(app.osId === undefined ? {} : { appUserModelId: app.osId }) }
    plan.record.push(link, own)
  } else {
    const desktop = P.join(userHome, '.local', 'share', 'applications', `acryl-${id}.desktop`)
    const png = P.join(userHome, '.local', 'share', 'icons', `acryl-${id}.png`)
    const line = value => value.replace(/[\r\n]+/gu, ' ')
    plan.files.push({
      path: desktop,
      content: `[Desktop Entry]\nType=Application\nName=${line(app.name)}\nExec=${words.map(desktopExecArg).join(' ')}\n${icon === undefined ? '' : `Icon=${png}\n`}`
        + `Terminal=false\nCategories=Utility;\n${app.osId === undefined ? '' : `StartupWMClass=${line(app.osId)}\n`}X-ACRYL-App=${id}\n`,
    })
    if (icon !== undefined) plan.icon = { kind: 'png', from: icon, to: png }
    plan.record.push(desktop, ...(icon === undefined ? [] : [png]))
  }
  plan.record.push(P.join(home, 'shortcuts'))
  return plan
}

// ---- the record -----------------------------------------------------------------------------------------------------------------------------------

/** `{ offered?: 'yes' | 'no', apps: { [id]: { name, folder, files } } }`; empty when the file is missing or broken. */
export function readLaunchers(home, platform = process.platform) {
  try {
    const value = JSON.parse(readFileSync(pathsOf(platform).join(home, LAUNCHERS_FILE), 'utf8'))
    return { ...(value.offered === 'yes' || value.offered === 'no' ? { offered: value.offered } : {}), apps: value.apps !== null && typeof value.apps === 'object' ? value.apps : {} }
  } catch { return { apps: {} } }
}

function writeLaunchers(home, record, platform) {
  const file = pathsOf(platform).join(home, LAUNCHERS_FILE)
  if (record.offered === undefined && Object.keys(record.apps).length === 0) { rmSync(file, { force: true }); return }
  mkdirSync(home, { recursive: true })
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`)
  renameSync(temporary, file)
}

/** What the person answered when the Control Center offered its own launcher: 'yes', 'no', or undefined (not asked yet). */
export const offeredLauncher = (home, platform) => readLaunchers(home, platform).offered

/** Remember the answer, so the offer is made once. */
export function recordOffer(home, answer, platform = process.platform) {
  writeLaunchers(home, { ...readLaunchers(home, platform), offered: answer }, platform)
}

// ---- the apps -------------------------------------------------------------------------------------------------------------------------------------

/**
 * The app `id` names: a listed app (its `blend.yaml` name), or one of the copies `acryl` keeps (ACRYL Control Center, ACRYL ADE, which show their product's name).
 * @returns {{ id: string, name: string, folder: string, forwardName: boolean } | undefined}
 */
export function launcherApp(home, id, platform = process.platform) {
  const P = pathsOf(platform)
  const listed = readApps(home).find(entry => entry.id === id)
  const managedFolder = Object.keys(MANAGED).find(folder => folder === id || (listed !== undefined && listed.path === P.join(home, folder)))
  if (managedFolder !== undefined) {
    const folder = P.join(home, managedFolder)
    return existsSync(P.join(folder, APP_MARKER)) ? { id: managedFolder, name: MANAGED[managedFolder], folder, forwardName: true } : undefined
  }
  return listed === undefined || !existsSync(P.join(listed.path, APP_MARKER)) ? undefined : { id: listed.id, name: blendNameOf(listed.path) || listed.id, folder: listed.path, forwardName: false }
}

// ---- writing and removing ---------------------------------------------------------------------------------------------------------------------------

const same = (file, content) => { try { return readFileSync(file, 'utf8') === content } catch { return false } }

function writeIfChanged(file, content, mode, P) {
  if (same(file, content)) return false
  mkdirSync(P.dirname(file), { recursive: true })
  writeFileSync(file, content)
  if (mode !== undefined) chmodSync(file, mode)
  return true
}

const newer = (from, to) => { try { return statSync(from).mtimeMs > statSync(to).mtimeMs } catch { return !existsSync(to) } }

const defaultExec = (command, args, env) => spawnSync(command, args, { env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true })

/** PowerShell: an .ico of 256 px (PNG inside) from the app's png, and the .lnk. Values come in environment variables, never in the script text. */
export const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if ($env:ACRYL_ICON_FROM) {
  $src = [System.Drawing.Image]::FromFile($env:ACRYL_ICON_FROM)
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, 256, 256)
  $g.Dispose(); $src.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $png = $ms.ToArray()
  $out = New-Object System.IO.MemoryStream
  $w = New-Object System.IO.BinaryWriter $out
  $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)
  $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$png.Length); $w.Write([UInt32]22)
  $w.Write($png); $w.Flush()
  [System.IO.File]::WriteAllBytes($env:ACRYL_ICON_TO, $out.ToArray())
}
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($env:ACRYL_LNK)
$target = $env:ACRYL_TARGET
if (-not [System.IO.Path]::IsPathRooted($target)) { $target = Join-Path (Join-Path $env:SystemRoot 'System32') $target }
$link.TargetPath = $target
$link.Arguments = $env:ACRYL_ARGS
$link.WorkingDirectory = $env:ACRYL_WORKDIR
if ($env:ACRYL_ICON_TO) { $link.IconLocation = $env:ACRYL_ICON_TO }
$link.Save()
# The AppUserModelID (T057): the taskbar groups and pins the running window under this shortcut when both carry the same id. WScript.Shell cannot set it,
# so the shortcut's property store is written through shell32 (PKEY_AppUserModel_ID, a string).
if ($env:ACRYL_AUMID) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, Pack = 4)] public struct AcrylPropertyKey { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit, Size = 16)] public struct AcrylPropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAcrylPropertyStore {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index, out AcrylPropertyKey key);
  [PreserveSig] int GetValue(ref AcrylPropertyKey key, out AcrylPropVariant value);
  [PreserveSig] int SetValue(ref AcrylPropertyKey key, ref AcrylPropVariant value);
  [PreserveSig] int Commit();
}
public static class AcrylAppUserModelId {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName(string path, IntPtr bindContext, int flags, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IAcrylPropertyStore store);
  static AcrylPropertyKey Key() { var key = new AcrylPropertyKey(); key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); key.pid = 5; return key; }
  public static void Set(string lnk, string id) {
    Guid iid = typeof(IAcrylPropertyStore).GUID;
    IAcrylPropertyStore store;
    SHGetPropertyStoreFromParsingName(lnk, IntPtr.Zero, 2, ref iid, out store);
    var key = Key();
    var value = new AcrylPropVariant(); value.vt = 31; value.p = Marshal.StringToCoTaskMemUni(id);
    try { Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref value)); Marshal.ThrowExceptionForHR(store.Commit()); }
    finally { Marshal.FreeCoTaskMem(value.p); Marshal.ReleaseComObject(store); }
  }
}
'@
  [AcrylAppUserModelId]::Set($env:ACRYL_LNK, $env:ACRYL_AUMID)
}
`

/** Copy the opener and what it imports into `<home>/shortcuts`; `from` is where they are (beside this file unless a bundle says otherwise). */
function writeOpener(home, from, P) {
  for (const file of OPENER_FILES) writeIfChanged(P.join(home, 'shortcuts', file), readFileSync(P.join(from, file), 'utf8'), undefined, P)
  // model-key.js is an ES module; without this the folder is typeless and Node reads it as CommonJS (older Node) or warns (newer).
  writeIfChanged(P.join(home, 'shortcuts', 'package.json'), '{ "type": "module" }\n', undefined, P)
}

function removeRecorded(paths, userHome, home, P) {
  for (const path of paths) {
    // Only what is under the person's home is ever deleted, whatever the record says.
    if (path === userHome || !path.startsWith(`${userHome}${P.sep}`)) continue
    rmSync(path, { recursive: true, force: true })
    const parent = P.dirname(path)
    if (['ACRYL', 'launchers'].includes(P.basename(parent)) && parent !== home) { try { rmdirSync(parent) } catch { /* not empty: not ours to clear */ } }
  }
}

/**
 * The app with the id the OS knows it by (T056): its own id (its .acryl/app.json, written on first look as the running app does), so the entry and the
 * window are one app. A folder that is not there gets none, and nothing is made for it.
 */
function withOsId(app) {
  if (app.osId !== undefined || !existsSync(app.folder)) return app
  return { ...app, osId: osAppIdOf(appIdOf(app.folder)) }
}

/**
 * Write the launcher of one app and record it (T011-T013). Idempotent: unchanged files are not rewritten, and the files an earlier add wrote that this one does not
 * (the app was renamed) are removed.
 * @returns {{ written: readonly string[], problems: readonly string[] }}
 */
export function addToApplications({ platform = process.platform, home, node, app, sourceDir = fileURLToPath(new URL('.', import.meta.url)), exec = defaultExec }) {
  if (!isLauncherHome(home, platform)) throw new Error(`launchers are made only for the .acryl folder of a person's home, not ${home}`)
  const P = pathsOf(platform)
  const userHome = P.dirname(home)
  const listed = typeof app === 'string' ? launcherApp(home, app, platform) : app
  if (listed === undefined) throw new Error(`no app "${String(app)}" in the list (see: acryl apps)`)
  const found = withOsId(listed)
  const png = found.icon ?? P.join(found.folder, 'assets', 'icon.png')
  const icon = existsSync(png) ? png : undefined
  const plan = launcherPlan({ platform, home, node, app: found, icon })
  const problems = []
  writeOpener(home, sourceDir, P)
  let changed = false
  for (const file of plan.files) changed = writeIfChanged(file.path, file.content, file.mode, P) || changed
  if (plan.icon !== undefined && newer(plan.icon.from, plan.icon.to)) {
    mkdirSync(P.dirname(plan.icon.to), { recursive: true })
    changed = true
    if (plan.icon.kind === 'png') copyFileSync(plan.icon.from, plan.icon.to)
    else if (plan.icon.kind === 'icns') {
      // sips cannot write an .icns from a 1024 px picture (error 13), so the picture is brought to 512 px first.
      const small = `${plan.icon.to}.png`
      const resized = exec('sips', ['-z', '512', '512', '-s', 'format', 'png', plan.icon.from, '--out', small], {})
      const done = resized.status === 0 ? exec('sips', ['-s', 'format', 'icns', small, '--out', plan.icon.to], {}) : resized
      rmSync(small, { force: true })
      if (done.status !== 0) problems.push('the icon could not be converted (sips)')
    }
  }
  if (plan.lnk !== undefined && (changed || !existsSync(plan.lnk.path))) {
    mkdirSync(P.dirname(plan.lnk.path), { recursive: true })
    const done = exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_SCRIPT], {
      ACRYL_ICON_FROM: plan.icon?.from ?? '', ACRYL_ICON_TO: plan.icon?.to ?? '', ACRYL_LNK: plan.lnk.path, ACRYL_TARGET: plan.lnk.target, ACRYL_ARGS: plan.lnk.args, ACRYL_WORKDIR: plan.lnk.workingDir, ACRYL_AUMID: plan.lnk.appUserModelId ?? '',
    })
    if (done.status !== 0) throw new Error(`the Start menu shortcut could not be made: ${String(done.stderr ?? '').trim()}`)
  }
  if (plan.sign !== undefined && changed) {
    const done = exec('codesign', ['--force', '--sign', '-', plan.sign], {})
    if (done.status !== 0) problems.push('the launcher could not be signed ad hoc (codesign); macOS may ask before opening it')
  }
  const record = readLaunchers(home, platform)
  const before = record.apps[found.id]?.files ?? []
  removeRecorded(before.filter(path => !plan.record.includes(path)), userHome, home, P)
  writeLaunchers(home, { ...record, apps: { ...record.apps, [found.id]: { name: found.name, folder: found.folder, files: plan.record } } }, platform)
  return { written: plan.record, problems }
}

/** Delete exactly what was recorded for the app (`app.id`, or `id`) and forget it; the opener goes with the last launcher. Returns whether there was one. */
export function removeFromApplications({ platform = process.platform, home, id, app }) {
  id = app?.id ?? id
  if (!isLauncherHome(home, platform)) throw new Error(`launchers are made only for the .acryl folder of a person's home, not ${home}`)
  const P = pathsOf(platform)
  const record = readLaunchers(home, platform)
  const entry = record.apps[id]
  if (entry === undefined) return false
  const { [id]: _removed, ...rest } = record.apps
  const last = Object.keys(rest).length === 0
  // The opener folder is shared: it is deleted only when this was the last launcher.
  removeRecorded(entry.files.filter(path => last || path !== P.join(home, 'shortcuts')), P.dirname(home), home, P)
  rmSync(P.join(home, 'logs', 'shortcuts', `${P.basename(entry.folder)}.log`), { force: true })   // what the opener wrote for this app
  writeLaunchers(home, { ...record, apps: rest }, platform)
  return true
}

/**
 * Bring every recorded launcher up to date: a moved Node.js or a moved app folder is rewritten (nothing else is touched). A launcher whose app is gone is left,
 * and says so when opened. Never throws: a launcher problem must not stop what called it.
 * @returns {readonly string[]} the ids rewritten.
 */
export function refreshLaunchers({ platform = process.platform, home, node, sourceDir, exec }) {
  if (!isLauncherHome(home, platform)) return []
  const rewritten = []
  for (const id of Object.keys(readLaunchers(home, platform).apps)) {
    try {
      const listed = launcherApp(home, id, platform)
      if (listed === undefined) continue
      const app = withOsId(listed)
      const plan = launcherPlan({ platform, home, node, app })
      const current = plan.files.every(file => same(file.path, file.content))
      if (current && existsSync(plan.record[0])) continue
      addToApplications({ platform, home, node, app, ...(sourceDir === undefined ? {} : { sourceDir }), ...(exec === undefined ? {} : { exec }) })
      rewritten.push(id)
    } catch { /* one launcher failing must not stop the others */ }
  }
  return rewritten
}
