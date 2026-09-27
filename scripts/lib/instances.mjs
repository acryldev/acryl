/**
 * ACRYL instances (spec 036, "Many instances"): a named, isolated run of one Blueprint. Everything that could make two runs
 * collide is derived from the instance name, so two instances share nothing by construction:
 *
 *   home        ~/.acryl-instances/<name>            ACRYL_HOME: profile, sessions, settings, global extensions, plugin state
 *   user data   "ACRYL <name>"                        Electron user data folder, so the single-instance lock is per instance
 *   web port    3100 + hash(name) % 900, then next free   stable per name (bookmarks keep working), never a clash
 *   claim       <home>/instance.json                  one live process per name; a second start is refused with who holds it
 *
 * Pure functions plus a small file boundary; the launcher (`blank.mjs`) is the only caller today, and the same module is what a
 * framework `acryl init` / `acryl instance` command will use.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const INSTANCES_DIR_NAME = '.acryl-instances'
export const CLAIM_FILE = 'instance.json'
export const PORT_BASE = 3100
export const PORT_SPAN = 900

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u

export class InstanceError extends Error {}

/** A short lowercase name (letters, digits, dashes): it becomes a folder, an app name and a port seed. */
export function instanceName(value) {
  if (typeof value !== 'string' || !NAME.test(value) || value.length > 32) throw new InstanceError(`instance name must be lowercase letters, digits and dashes (at most 32), got ${JSON.stringify(value)}`)
  return value
}

/** FNV-1a: small, stable across runs and platforms, and good enough to spread names over a port range. */
export function stablePort(name) {
  let hash = 0x811c9dc5
  for (const character of name) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return PORT_BASE + (hash % PORT_SPAN)
}

export function instancesRoot(home = homedir()) {
  return join(home, INSTANCES_DIR_NAME)
}

/** The app's definition, a Blends manifest (`acryl new` writes it). */
export const BLUEPRINT_FILE = 'blend.yaml'

/**
 * An instance is a folder (an app `acryl new` creates). The folder IS the ACRYL home: what the user owns and commits sits at the top
 * (`blend.yaml`, `extensions/`), what the runtime keeps is under `.dsh/` and `instance.json` (both git-ignored). The instance name is
 * the folder's name, so nothing beyond the folder itself has to be registered anywhere.
 */
export function resolveInstanceAt(dir, home = homedir()) {
  // The real path: one folder reached by two spellings (a symlink, `..`) must be one instance, or the same home could be started twice under two ids.
  const root = existsSync(dir) ? realpathSync(dir) : resolve(dir)
  const name = instanceName(basename(root))
  // Two folders may share a name (`~/a/orbit`, `~/b/orbit`). The id is what must never repeat: it seeds the port, names the Electron user data and namespaces
  // project scope. A managed instance's name is already unique; a folder gets a short digest of where it lives, like a container id.
  const managed = dirname(root) === (existsSync(join(home, INSTANCES_DIR_NAME)) ? realpathSync(join(home, INSTANCES_DIR_NAME)) : join(home, INSTANCES_DIR_NAME))
  const id = managed ? name : `${name}-${createHash('sha1').update(root).digest('hex').slice(0, 4)}`
  return { name, id, root, dshHome: join(root, '.dsh'), userDataName: `ACRYL ${id}`, preferredPort: stablePort(id), claimFile: join(root, CLAIM_FILE), blueprintFile: join(root, BLUEPRINT_FILE), managed }
}

/** A managed instance: the same folder layout, kept under `~/.acryl-instances/<name>` when the user has not picked a folder. */
export function resolveInstance(name, home = homedir()) {
  return resolveInstanceAt(join(instancesRoot(home), instanceName(name)), home)
}

/** Is a process with this pid alive? `EPERM` means alive but not ours. */
export function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function readClaim(file) {
  try {
    const claim = JSON.parse(readFileSync(file, 'utf8'))
    return Number.isInteger(claim?.pid) ? claim : undefined
  } catch {
    return undefined
  }
}

/** Where running instances announce themselves so `ps` finds them wherever their folder is (like the daemon's container list). One small file per instance. */
export function runningDir(home = homedir()) {
  return join(instancesRoot(home), '.running')
}

/**
 * Take the instance for this process. A live holder refuses the claim, naming it; a dead holder (crash, kill -9) is replaced, so a stale
 * file never locks anyone out.
 */
export function claimInstance(instance, info, isAlive = processIsAlive, home = homedir()) {
  const held = readClaim(instance.claimFile)
  if (held !== undefined && isAlive(held.pid)) {
    throw new InstanceError(`instance "${instance.name}" is already running (pid ${held.pid}${held.surface ? `, ${held.surface}` : ''}${held.port ? `, port ${held.port}` : ''}). Stop it (node scripts/instances.mjs stop ${instance.name}) or pick another name with --instance.`)
  }
  mkdirSync(instance.root, { recursive: true, mode: 0o700 })
  const claim = { name: instance.name, id: instance.id, root: instance.root, ...info, startedAt: new Date().toISOString() }
  writeFileSync(instance.claimFile, `${JSON.stringify(claim, null, 2)}\n`, { mode: 0o600 })
  mkdirSync(runningDir(home), { recursive: true, mode: 0o700 })
  writeFileSync(join(runningDir(home), `${instance.id}.json`), `${JSON.stringify(claim, null, 2)}\n`, { mode: 0o600 })
}

/** Release only our own claim: never remove one a newer process took after ours was replaced. */
export function releaseInstance(instance, pid = process.pid, home = homedir()) {
  if (readClaim(instance.claimFile)?.pid === pid) rmSync(instance.claimFile, { force: true })
  if (readClaim(join(runningDir(home), `${instance.id}.json`))?.pid === pid) rmSync(join(runningDir(home), `${instance.id}.json`), { force: true })
}

/**
 * Every instance: the managed ones (folders under `~/.acryl-instances`, running or not) and any running one anywhere (from the running registry). A stale
 * announcement, whose process is gone, is dropped.
 */
export function listInstances(home = homedir(), isAlive = processIsAlive) {
  const byId = new Map()
  const root = instancesRoot(home)
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !NAME.test(entry.name)) continue
      const folder = join(root, entry.name)
      const claim = readClaim(join(folder, CLAIM_FILE))
      const running = claim !== undefined && isAlive(claim.pid)
      byId.set(entry.name, { name: entry.name, id: entry.name, root: folder, running, ...(running ? summary(claim) : {}) })
    }
  }
  const registry = runningDir(home)
  if (existsSync(registry)) {
    for (const entry of readdirSync(registry)) {
      const claim = readClaim(join(registry, entry))
      if (claim === undefined) continue
      if (!isAlive(claim.pid)) { rmSync(join(registry, entry), { force: true }); continue }
      byId.set(claim.id ?? claim.name, { name: claim.name, id: claim.id ?? claim.name, root: claim.root, running: true, ...summary(claim) })
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function summary(claim) {
  return { pid: claim.pid, surface: claim.surface, blueprint: claim.blueprint, port: claim.port, startedAt: claim.startedAt }
}

/** Ask a running instance to stop (SIGTERM, which every surface handles as a clean shutdown). */
export function stopInstance(name, home = homedir(), kill = (pid, signal) => process.kill(pid, signal)) {
  const found = listInstances(home).find(instance => instance.id === name || instance.name === name)
  if (found === undefined) throw new InstanceError(`there is no instance "${name}"`)
  if (!found.running) return false
  kill(found.pid, 'SIGTERM')
  return true
}

/**
 * Remove a MANAGED instance (one under `~/.acryl-instances`), like `docker rm`: its home, data and extensions are deleted. Refuses a running instance, and
 * refuses anything that is not a direct child of the instances root, so a name can never reach outside it. An instance the user scaffolded into their own
 * folder is theirs to delete; this never removes one.
 */
export function removeInstance(name, home = homedir(), isAlive = processIsAlive) {
  const instance = resolveInstance(name, home)
  if (!existsSync(instance.root)) throw new InstanceError(`there is no instance "${instance.name}"`)
  const root = realpathSync(instancesRoot(home))
  const target = realpathSync(instance.root)
  if (join(root, instance.name) !== target) throw new InstanceError(`refusing to remove ${target}: it is not a managed instance folder`)
  const claim = readClaim(instance.claimFile)
  if (claim !== undefined && isAlive(claim.pid)) throw new InstanceError(`instance "${instance.name}" is running (pid ${claim.pid}); stop it first`)
  rmSync(target, { recursive: true, force: true })
  return target
}

/**
 * Is this module the one node was started with? Compared by real path: a folder reached through a symlink (macOS keeps /var -> /private/var, and a house may live
 * anywhere) has a different argv path than its module URL, and a plain string compare then silently runs nothing.
 */
export function isMainModule(importMetaUrl, argv1 = process.argv[1]) {
  if (argv1 === undefined) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(importMetaUrl))
  } catch {
    return false
  }
}
