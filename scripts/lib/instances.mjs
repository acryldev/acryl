/**
 * The launcher side of ACRYL app instances (spec 036, "Self-containment"): claim one live process per app, announce it in the Registry, list, stop and
 * remove. Every rule (where an app lives, its port, its Electron user data, the lock and the registry) is the runtime's instance module; this file only
 * adapts it to the launchers and `scripts/instances.mjs`.
 */
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AppInstanceError,
  LockHeldError,
  MANAGED_HOMES_DIR_NAME,
  acquireLock,
  announce,
  appFolder,
  listRunning,
  managedApp,
  osHomeDirectory,
  processIsAlive,
  readLock,
  releaseLock,
  withdraw,
} from './instance-module.mjs'

export class InstanceError extends Error {}

export { appFolder, managedApp }

/** Take the app for this launcher process: refused, naming the holder, while another live process runs it; a crashed holder is replaced. */
export function claimInstance(instance, info, isAlive = processIsAlive, osHome = osHomeDirectory()) {
  try {
    acquireLock(instance.runLockFile, { id: instance.id, home: instance.home, ...info }, {
      alive: isAlive,
      describe: holder => `app "${instance.id}" is already running (pid ${holder.pid}${holder.surface ? `, ${holder.surface}` : ''}${holder.port ? `, port ${holder.port}` : ''}). Stop it (node scripts/instances.mjs stop ${instance.id}) or start another app.`,
    })
  } catch (error) {
    if (error instanceof LockHeldError) throw new InstanceError(error.message)
    throw error
  }
  announce(osHome, instance, info)
}

/** Release only our own claim and announcement. */
export function releaseInstance(instance, pid = process.pid, osHome = osHomeDirectory()) {
  releaseLock(instance.runLockFile, pid)
  withdraw(osHome, instance, pid)
}

/** Every managed app (running or not) and every running app anywhere, from the Registry. */
export function listInstances(osHome = osHomeDirectory(), isAlive = processIsAlive) {
  const byId = new Map()
  const root = join(osHome, MANAGED_HOMES_DIR_NAME)
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      let instance
      try { instance = managedApp(entry.name, osHome) } catch { continue }
      const holder = readLock(instance.runLockFile)
      const running = holder !== undefined && isAlive(holder.pid)
      byId.set(instance.id, { id: instance.id, name: instance.name, home: instance.home, running, ...(running ? { pid: holder.pid, surface: holder.surface, port: holder.port } : {}) })
    }
  }
  for (const app of listRunning(osHome, isAlive)) byId.set(app.id, { ...app, running: true })
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Ask a running app to stop (SIGTERM, which every surface handles as a clean shutdown). */
export function stopInstance(id, osHome = osHomeDirectory(), kill = (pid, signal) => process.kill(pid, signal)) {
  const found = listInstances(osHome).find(app => app.id === id || app.name === id)
  if (found === undefined) throw new InstanceError(`there is no app "${id}"`)
  if (!found.running) return false
  kill(found.pid, 'SIGTERM')
  return true
}

/**
 * Delete a stopped MANAGED app (like docker rm). Refuses a running one and anything outside the managed root; an app in a folder the user chose is theirs
 * to delete.
 */
export function removeInstance(name, osHome = osHomeDirectory(), isAlive = processIsAlive) {
  let instance
  try { instance = managedApp(name, osHome) } catch (error) { throw new InstanceError(error instanceof AppInstanceError ? error.message : String(error)) }
  if (!existsSync(instance.home)) throw new InstanceError(`there is no app "${instance.name}"`)
  const target = realpathSync(instance.home)
  if (join(realpathSync(join(osHome, MANAGED_HOMES_DIR_NAME)), instance.name) !== target) throw new InstanceError(`refusing to remove ${target}: it is not a managed app folder`)
  const holder = readLock(instance.runLockFile)
  if (holder !== undefined && isAlive(holder.pid)) throw new InstanceError(`app "${instance.name}" is running (pid ${holder.pid}); stop it first`)
  rmSync(target, { recursive: true, force: true })
  return target
}

/** Is this module the one node was started with? Real paths: a folder reached through a symlink must still run. */
export function isMainModule(importMetaUrl, argv1 = process.argv[1]) {
  if (argv1 === undefined) return false
  try { return realpathSync(argv1) === realpathSync(fileURLToPath(importMetaUrl)) } catch { return false }
}
