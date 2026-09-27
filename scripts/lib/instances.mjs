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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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

export function resolveInstance(name, home = homedir()) {
  const valid = instanceName(name)
  const root = join(instancesRoot(home), valid)
  return { name: valid, root, dshHome: join(root, '.dsh'), userDataName: `ACRYL ${valid}`, preferredPort: stablePort(valid), claimFile: join(root, CLAIM_FILE) }
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

/**
 * Take the instance for this process. A live holder refuses the claim, naming it; a dead holder (crash, kill -9) is replaced, so a stale
 * file never locks anyone out.
 */
export function claimInstance(instance, info, isAlive = processIsAlive) {
  const held = readClaim(instance.claimFile)
  if (held !== undefined && isAlive(held.pid)) {
    throw new InstanceError(`instance "${instance.name}" is already running (pid ${held.pid}${held.surface ? `, ${held.surface}` : ''}${held.port ? `, port ${held.port}` : ''}). Stop it (node scripts/instances.mjs stop ${instance.name}) or pick another name with --instance.`)
  }
  mkdirSync(instance.root, { recursive: true, mode: 0o700 })
  writeFileSync(instance.claimFile, `${JSON.stringify({ name: instance.name, ...info, startedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
}

/** Release only our own claim: never remove one a newer process took after ours was replaced. */
export function releaseInstance(instance, pid = process.pid) {
  if (readClaim(instance.claimFile)?.pid === pid) rmSync(instance.claimFile, { force: true })
}

/** Every instance with a folder, and whether its claim is live. Stale claims are reported as stopped. */
export function listInstances(home = homedir(), isAlive = processIsAlive) {
  const root = instancesRoot(home)
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && NAME.test(entry.name))
    .map(entry => {
      const claim = readClaim(join(root, entry.name, CLAIM_FILE))
      const running = claim !== undefined && isAlive(claim.pid)
      return { name: entry.name, root: join(root, entry.name), running, ...(running ? { pid: claim.pid, surface: claim.surface, blueprint: claim.blueprint, port: claim.port, startedAt: claim.startedAt } : {}) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Ask a running instance to stop (SIGTERM, which every surface handles as a clean shutdown). */
export function stopInstance(name, home = homedir(), kill = (pid, signal) => process.kill(pid, signal)) {
  const found = listInstances(home).find(instance => instance.name === instanceName(name))
  if (found === undefined) throw new InstanceError(`there is no instance "${name}"`)
  if (!found.running) return false
  kill(found.pid, 'SIGTERM')
  return true
}
