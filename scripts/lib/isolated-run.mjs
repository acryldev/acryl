/**
 * Isolation by construction for anything that boots an ACRYL app outside a unit test (a gate smoke, a packed-app check, a live-run launcher).
 *
 * Two jobs, both failing closed:
 *  - `isolatedEnvironment` builds the child environment: a throwaway root holding HOME, the ACRYL and engine homes, and the Electron user data, with every
 *    ACRYL_/DSH_ placement variable of the caller removed first, and ACRYL_REQUIRE_ISOLATED_HOME set so the runtime itself refuses a real home
 *    (`runtime/acryl-harness-runtime/src/instance/select.ts`). HOME is moved too, so code that asks the OS for "the home" (the engine's default workspace
 *    under ~/Documents, macOS Application Support, a stray ~/.dsh) lands in the throwaway root as well.
 *  - `snapshotRealHomes` / `changedSince` record and compare the OS user's real ACRYL and DSH data, so a breach is reported by the run that caused it.
 *
 * A script that spawns a built or packed app must use this module (scripts/verify-layout.mjs enforces it for every such script).
 *
 * @module scripts/lib/isolated-run
 */
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const REQUIRE_ISOLATED_HOME_ENV = 'ACRYL_REQUIRE_ISOLATED_HOME'

/** Variables that decide where an app lives or how it is named; none may leak in from the caller. */
const PLACEMENT = /^(ACRYL_(HOME|WEB_PORT|INSTANCE|LOCAL_PRODUCT_NAME|BLUEPRINT)|DSH_(HOME|DESKTOP_USER_DATA))$/u

/** The OS user's real app data a run must never touch, relative to the real home. */
const REAL_PATHS = [
  '.acryl',
  '.acryl-dev',
  '.acryl-worktrees',
  '.acryl-instances',
  '.dsh',
  'Library/Application Support/ACRYL',
  'Documents/deepseek-harness',
]
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.pnpm', '.git', 'Cache', 'Code Cache', 'GPUCache', 'logs'])
const FILE_CAP = 200_000

/**
 * A throwaway root with the whole environment of one isolated run.
 * @param {{ label: string, base?: NodeJS.ProcessEnv, port?: number, extra?: Record<string, string> }} options
 */
export function isolatedEnvironment({ label, base = process.env, port, extra = {} }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `acryl-${label}-`)))
  const home = join(root, 'home')
  const acrylHome = join(root, 'acryl-home')
  const userData = join(root, 'electron-user-data')
  for (const dir of [home, acrylHome, userData]) mkdirSync(dir, { recursive: true })
  const env = {}
  for (const [key, value] of Object.entries(base)) if (value !== undefined && !PLACEMENT.test(key) && key !== REQUIRE_ISOLATED_HOME_ENV) env[key] = value
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    ACRYL_HOME: acrylHome,
    DSH_HOME: join(acrylHome, '.dsh'),
    DSH_DESKTOP_USER_DATA: userData,
    ACRYL_LOCAL_PRODUCT_NAME: `ACRYL-${label}`,
    [REQUIRE_ISOLATED_HOME_ENV]: '1',
    ...(port === undefined ? {} : { ACRYL_WEB_PORT: String(port) }),
    ...extra,
  })
  return { env, root, home: acrylHome, dispose: () => { rmSync(root, { recursive: true, force: true }) } }
}

/** Newest modification time and file count under each real path, ignoring bulky regenerable folders. Cheap enough to take before and after a run. */
export function snapshotRealHomes(osHome = homedir()) {
  const snapshot = {}
  for (const relative of REAL_PATHS) {
    const path = join(osHome, relative)
    const state = { exists: false, newest: 0, newestPath: '', files: 0 }
    try { lstatSync(path); state.exists = true } catch { snapshot[relative] = state; continue }
    walk(path, state)
    snapshot[relative] = state
  }
  return snapshot
}

function walk(path, state) {
  let entries
  try { entries = readdirSync(path, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (state.files > FILE_CAP) return
    const full = join(path, entry.name)
    let stat
    try { stat = lstatSync(full) } catch { continue }
    if (stat.mtimeMs > state.newest) { state.newest = stat.mtimeMs; state.newestPath = full }
    state.files += 1
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) walk(full, state)
  }
}

/** Paths whose snapshot differs from the earlier one: empty when the run left the real homes alone. */
export function changedSince(before, after = snapshotRealHomes()) {
  return Object.keys(after).filter(path => before[path]?.exists !== after[path].exists || before[path]?.newest !== after[path].newest || before[path]?.files !== after[path].files)
}

/** Throw naming the real paths a run changed and the newest file in each (an app of the owner's that is running meanwhile can write there too: look at the file). */
export function assertRealHomesUntouched(before, label, after = snapshotRealHomes()) {
  const changed = changedSince(before, after)
  if (changed.length > 0) throw new Error(`${label} changed the real app data of this machine: ${changed.map(path => `~/${path} (newest: ${after[path].newestPath || 'removed'})`).join(', ')}`)
}
