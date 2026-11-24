// The space the apps on this computer take (spec 052 T008), beside the one install (app-install.js):
//   reinstallApp  an app's packages again through the one install, so an app installed in full moves onto the shared Program;
//   planClean     the Programs no app on this computer uses, and leftovers of an install that stopped, with what removing each frees;
//   removePrograms exactly those, and never anything outside <home>/program.
// Neither touches an app's own files or data: reinstall replaces only node_modules, clean only Programs. Home is a parameter (the AppInstance rule).
import { existsSync, lstatSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { installApp, PROGRAM_DIR, programOf } from './app-install.js'
import { readApps } from './apps-registry.js'

/**
 * Install the app in `folder` again through installApp, from the shared Program when one fits. Its packages are moved aside first and removed only
 * when the new install succeeded; otherwise they are put back, so a failed reinstall leaves the app as it was. Takes installApp's options.
 */
export async function reinstallApp(options) {
  const modules = join(options.folder, 'node_modules')
  const aside = `${modules}.before-reinstall-${process.pid}`
  // A running app's files are in use: on Windows the rename fails, and the caller says to stop the app first.
  if (existsSync(modules)) renameSync(modules, aside)
  let result
  try {
    result = await installApp(options)
  } catch (cause) {
    result = { code: 1, program: 'none', error: cause }
  }
  if (result.code === 0) rmSync(aside, { recursive: true, force: true })
  else if (existsSync(aside)) {
    rmSync(modules, { recursive: true, force: true })
    renameSync(aside, modules)
  }
  if (result.error !== undefined) throw result.error
  return result
}

const alive = pid => { try { process.kill(pid, 0); return true } catch (cause) { return cause?.code === 'EPERM' } }

/** Bytes on disk that removing `root` frees: each file once, and only a file no link outside `root` keeps (an app's hard link keeps it). */
function freedBytes(root) {
  const seen = new Map()
  const walk = path => {
    const st = lstatSync(path, { bigint: true })
    if (st.isDirectory()) { for (const name of readdirSync(path)) walk(join(path, name)); return }
    const key = `${st.dev}:${st.ino}`
    const known = seen.get(key) ?? { links: Number(st.nlink), inside: 0, bytes: st.blocks > 0n ? Number(st.blocks) * 512 : Number(st.size) }
    known.inside += 1
    seen.set(key, known)
  }
  walk(root)
  let bytes = 0
  for (const file of seen.values()) if (file.links <= file.inside) bytes += file.bytes
  return bytes
}

/** The folders whose apps count as users of a Program: the list of apps, and the apps acryl keeps in its own home (Control Center, ADE). */
function appFolders(home) {
  const kept = existsSync(home)
    ? readdirSync(home, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== PROGRAM_DIR).map(entry => join(home, entry.name))
    : []
  return [...readApps(home).map(app => app.path), ...kept]
}

/**
 * What `acryl clean` would remove: `{ path, reason, bytes }` for every Program in `<home>/program` that no app uses, and every half-made one whose
 * install is no longer running. `bytes` is what removing it frees (on macOS a clone shares blocks with the apps made from it, so less may come back).
 */
export function planClean({ home }) {
  const root = join(home, PROGRAM_DIR)
  if (!existsSync(root)) return []
  const used = new Set(appFolders(home).map(programOf).filter(Boolean))
  const plan = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name)
    const making = /\.making-(\d+)$/u.exec(entry.name)
    if (making !== null) {
      if (!alive(Number(making[1]))) plan.push({ path, reason: 'left over from an install that stopped' })
    } else if (entry.name.startsWith('blends-') && !used.has(entry.name)) {
      plan.push({ path, reason: `no app on this computer uses Blends ${entry.name.slice('blends-'.length)}` })
    }
  }
  return plan.map(entry => ({ ...entry, bytes: freedBytes(entry.path) }))
}

/** Remove what planClean listed. Every path is checked first: one outside `<home>/program` stops it before anything is removed. */
export function removePrograms(home, plan) {
  const base = resolve(home, PROGRAM_DIR) + sep
  for (const { path } of plan) if (!resolve(path).startsWith(base)) throw new Error(`refusing to remove ${path}: it is outside ${base}`)
  for (const { path } of plan) rmSync(path, { recursive: true, force: true })
}
