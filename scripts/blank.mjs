#!/usr/bin/env node
/**
 * Launch the blank canvas (`acryl.blank`, spec 036) on one surface, as a NAMED INSTANCE that shares nothing with any other ACRYL:
 *
 *   node scripts/blank.mjs web     [--instance orbit] [--name Orbit] [--accent '#e8590c'] [--port 3105] [--blueprint my.blueprint.yaml]
 *   node scripts/blank.mjs cli     [--instance orbit] [--name Orbit]
 *   node scripts/blank.mjs desktop [--instance orbit] [--name Orbit]
 *
 * `--instance` (default `blank`) names the instance. Its home, Electron user data, web port and project-scope folders all derive from that name
 * (`scripts/lib/instances.mjs`), so many instances run side by side without touching each other or your real ACRYL. A second start of the
 * same name is refused. `node scripts/instances.mjs list` shows what is running.
 */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { InstanceError, claimInstance, releaseInstance, resolveInstance } from './lib/instances.mjs'

export const DEFAULT_INSTANCE = 'blank'

const FLAG_TO_ENV = { name: 'ACRYL_BRAND_NAME', tagline: 'ACRYL_BRAND_TAGLINE', accent: 'ACRYL_BRAND_ACCENT', 'accent-dark': 'ACRYL_BRAND_ACCENT_DARK', font: 'ACRYL_BRAND_FONT', mark: 'ACRYL_BRAND_MARK' }

/** Pure: what to run, in which environment, for one surface and instance. */
export function blankLaunchPlan(surface, flags, environment, home = homedir(), root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const instance = resolveInstance(String(flags.instance ?? DEFAULT_INSTANCE), home)
  const brandEnv = Object.fromEntries(Object.entries(FLAG_TO_ENV).flatMap(([flag, variable]) => (flags[flag] === undefined ? [] : [[variable, String(flags[flag])]])))
  // ACRYL_HOME is authoritative for every ACRYL path (profile, sessions, settings, global extensions, plugin state); an ambient DSH_HOME must not leak in.
  const { DSH_HOME: _ambient, ...clean } = environment
  const env = {
    ...clean,
    ACRYL_INSTANCE: instance.name,
    ACRYL_HOME: instance.root,
    ACRYL_BLUEPRINT: flags.blueprint === undefined ? 'acryl.blank' : resolve(String(flags.blueprint)),
    ...brandEnv,
  }
  const base = { instance, blueprint: env.ACRYL_BLUEPRINT }
  if (surface === 'web') {
    const port = Number(flags.port ?? instance.preferredPort)
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error(`--port must be a port number from 1024 to 65535, got ${String(flags.port)}`)
    return { ...base, surface, command: process.execPath, args: [join(root, 'apps/acryl-web/bin/dev-run.mjs'), '--no-open'], env: { ...env, ACRYL_WEB_PORT: String(port) }, webPort: port }
  }
  if (surface === 'cli') return { ...base, surface, command: process.execPath, args: [join(root, 'apps/acryl-cli/bin/dev-run.mjs')], env }
  if (surface === 'desktop') {
    // Its own Electron user-data folder: the single-instance lock, window state and local storage are per instance.
    return { ...base, surface, command: process.execPath, args: [join(root, 'scripts/dev-local.mjs')], env: { ...env, ACRYL_LOCAL_PRODUCT_NAME: instance.userDataName } }
  }
  throw new Error(`unknown surface ${JSON.stringify(surface)}; use web, cli or desktop`)
}

export function parseFlags(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=')
    flags[key] = inline ?? argv[++i]
  }
  return flags
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [surface = '', ...rest] = process.argv.slice(2)
  try {
    const plan = blankLaunchPlan(surface, parseFlags(rest), process.env)
    claimInstance(plan.instance, { pid: process.pid, surface: plan.surface, blueprint: plan.blueprint, ...(plan.webPort === undefined ? {} : { port: plan.webPort }) })
    process.stdout.write(`blank: instance "${plan.instance.name}" in ${plan.instance.root}\n`)
    if (plan.webPort !== undefined) process.stdout.write(`blank: Web starts at 127.0.0.1:${plan.webPort} (moves to the next free port if taken)\n`)
    const release = () => releaseInstance(plan.instance)
    // The app runs in its own process group (the dev launchers run it through further child processes), so a stop reaches every one of them
    // and nothing is left listening after the name is freed. Windows has no process groups; there the direct child is signalled.
    const grouped = process.platform !== 'win32'
    const child = spawn(plan.command, plan.args, { env: plan.env, stdio: 'inherit', detached: grouped })
    const stop = signal => { try { process.kill(grouped ? -child.pid : child.pid, signal) } catch { /* already gone */ } }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop(signal))
    child.on('exit', code => { release(); process.exitCode = code ?? 0 })
    child.on('error', error => { release(); process.stderr.write(`blank: ${error.message}\n`); process.exitCode = 1 })
  } catch (error) {
    process.stderr.write(`blank: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = error instanceof InstanceError ? 3 : 2
  }
}
