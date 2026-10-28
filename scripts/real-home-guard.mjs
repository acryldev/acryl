#!/usr/bin/env node
/**
 * Fails the gate when a TEST changes the real ACRYL homes: `check` must not write the developer's `~/.acryl`, `~/.acryl-dev`,
 * `~/.acryl-worktrees`, `~/.acryl-instances` (the running-app Registry and its locks) or `~/.dsh`.
 *
 *   node scripts/real-home-guard.mjs -- <command…>   record, run the command, verify, and exit with the command's code
 *
 * Vitest workers get a HOME of their own from `scripts/testing/isolate-home.ts`; this guard is the backstop for every other test runner
 * (`node --test`, the packaged and scaffolding gates) and for a future test that overrides HOME on purpose. A file added, removed, resized or
 * rewritten in a real home fails the gate with its path.
 *
 * An app built before T011 does not announce itself, so the Registry cannot excuse it; when a change lands in one of the homes such an app writes,
 * the failure says so and how to proceed (quit it, or run with `ACRYL_REAL_HOME_GUARD=off`).
 *
 * An app that is running right now writes its own home (the development app's session logs, the installed app's settings), so the homes of
 * the live apps the Registry lists are left out and said so, one line each. `~/.acryl-instances` itself is always checked, except that the
 * live apps' own Registry entries may change. Nothing else is excused: a home with no live entry still fails, and so does a stale entry (its
 * process is gone). Set `ACRYL_REAL_HOME_GUARD=off` only to inspect a home by hand.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { processIsAlive } from '../runtime/acryl-harness-runtime/src/instance/offline-lock.ts'
import { registryDir } from '../runtime/acryl-harness-runtime/src/instance/registry.ts'

/** The real homes of the OS user, as `instance/` names them. */
const REAL_HOME_FOLDERS = ['.acryl', '.acryl-dev', '.acryl-worktrees', '.acryl-instances', '.dsh']
/** The Registry is always checked; only its live entries may change. */
const REGISTRY_FOLDER = '.acryl-instances'
/** The homes an app built before T011 writes while it runs, without announcing itself. */
const HOMES_OF_UNANNOUNCING_APPS = ['.acryl', '.acryl-dev', '.dsh']

/** The apps that are running now, read through the AppInstance family (`registryDir`): the Registry files whose pid is alive. A dead entry excuses nothing. */
function liveApps(osHome) {
  const dir = registryDir(osHome)
  if (!existsSync(dir)) return []
  const apps = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const file = join(dir, name)
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'))
      if (!Number.isInteger(value.pid) || typeof value.home !== 'string' || !processIsAlive(value.pid)) continue
      apps.push({ name: String(value.name ?? value.id ?? name), home: value.home, pid: value.pid, file })
    } catch {
      continue
    }
  }
  return apps.sort((a, b) => a.home.localeCompare(b.home))
}

/** `~` for the OS home, so the report reads like the documentation. */
const tilde = (osHome, path) => (path === osHome ? '~' : path.startsWith(`${osHome}${sep}`) ? `~/${relative(osHome, path).split(sep).join('/')}` : path)

/**
 * Every file under each real home as `path -> size:mtime:inode`, which changes on any write.
 * @param skipHomes - the live apps' homes, left out of every watched folder except the Registry.
 * @param allowed - files whose changes are not reported (the live apps' own Registry entries).
 */
function snapshot(osHome, skipHomes, allowed) {
  const entries = new Map()
  const inside = (path, folder) => path === folder || path.startsWith(`${folder}${sep}`)
  const walk = (path, skipHomes) => {
    if (skipHomes.some(home => inside(path, home))) return
    let stats
    try {
      stats = lstatSync(path)
    } catch {
      return
    }
    if (stats.isDirectory()) {
      entries.set(path, 'dir')
      let names
      try {
        names = readdirSync(path)
      } catch {
        return
      }
      for (const name of names) walk(join(path, name), skipHomes)
      return
    }
    entries.set(path, `${String(stats.size)}:${String(stats.mtimeMs)}:${String(stats.ino)}`)
  }
  for (const folder of REAL_HOME_FOLDERS) {
    const path = join(osHome, folder)
    if (!existsSync(path)) continue
    // The Registry is walked whole (a live app announces into it, and its own entry is allowed by name); every other folder skips the live apps' homes.
    walk(path, folder === REGISTRY_FOLDER ? [] : skipHomes)
  }
  for (const file of allowed) entries.delete(file)
  return entries
}

const argv = process.argv.slice(2)
const at = argv.indexOf('--')
if (at === -1 || at === argv.length - 1) {
  console.error('usage: real-home-guard.mjs -- <command…>')
  process.exit(2)
}
const command = argv.slice(at + 1)
if (process.env.ACRYL_REAL_HOME_GUARD === 'off') {
  const off = spawnSync(command[0], command.slice(1), { stdio: 'inherit' })
  process.exit(off.status ?? 1)
}

const osHome = homedir()
const apps = liveApps(osHome)
const skipHomes = apps.map(app => app.home)
const allowed = new Set(apps.map(app => app.file))
for (const app of apps) console.error(`real-home-guard: skipped ${tilde(osHome, app.home)}: app ${app.name} pid ${String(app.pid)} is running`)

const report = join(osHome, '.cache', 'acryl-real-home-guard.json')
const before = snapshot(osHome, skipHomes, allowed)
try {
  writeFileSync(report, JSON.stringify({ at: new Date().toISOString(), folders: REAL_HOME_FOLDERS, skipped: apps.map(app => ({ name: app.name, home: app.home, pid: app.pid })) }, null, 2))
} catch {
  // The report is context for a developer, never a reason to fail.
}

const child = spawnSync(command[0], command.slice(1), { stdio: 'inherit' })
const after = snapshot(osHome, skipHomes, allowed)
const changed = []
for (const [path, state] of after) {
  const was = before.get(path)
  if (was === undefined) changed.push({ line: `added   ${path}`, path })
  else if (was !== state) changed.push({ line: `changed ${path}`, path })
}
for (const path of before.keys()) if (!after.has(path)) changed.push({ line: `removed ${path}`, path })

if (changed.length > 0) {
  console.error(`real-home-guard: the gate wrote the OS user's real ACRYL homes (${REAL_HOME_FOLDERS.map(folder => `~/${folder}`).join(', ')}):`)
  for (const { line } of changed.slice(0, 40)) console.error(`  ${line}`)
  if (changed.length > 40) console.error(`  … and ${String(changed.length - 40)} more`)
  // A pre-T011 app (built before 905a801c) writes these homes and announces nothing, so the Registry above cannot have excused it.
  const early = HOMES_OF_UNANNOUNCING_APPS.some(folder => changed.some(({ path }) => path === join(osHome, folder) || path.startsWith(`${join(osHome, folder)}${sep}`)))
  if (early) console.error('An ACRYL app built before 905a801c (T011) does not announce itself; if one is running against this home, quit it or run with ACRYL_REAL_HOME_GUARD=off.')
  console.error('Isolate the test that wrote them (set HOME to a temp folder before it boots a composition root), then run the gate again.')
  process.exit(1)
}
process.exit(child.status ?? 1)
