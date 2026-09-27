#!/usr/bin/env node
/**
 * Launch the blank canvas (`acryl.blank`, spec 036) on one surface, as a NAMED INSTANCE that shares nothing with any other ACRYL:
 *
 *   node scripts/blank.mjs web     [--instance orbit] [--name Orbit] [--accent '#e8590c'] [--port 3105] [--blueprint my.blueprint.yaml]
 *   node scripts/blank.mjs cli     [--instance orbit] [--name Orbit]
 *   node scripts/blank.mjs web --dir ~/apps/orbit          run an app created by `acryl new ~/apps/orbit` (its bin/acryl does this)
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
import { existsSync } from 'node:fs'
import { InstanceError, claimInstance, isMainModule, listInstances, releaseInstance, resolveInstance, resolveInstanceAt } from './lib/instances.mjs'

export const DEFAULT_INSTANCE = 'blank'

const FLAG_TO_ENV = { name: 'ACRYL_BRAND_NAME', tagline: 'ACRYL_BRAND_TAGLINE', accent: 'ACRYL_BRAND_ACCENT', 'accent-dark': 'ACRYL_BRAND_ACCENT_DARK', font: 'ACRYL_BRAND_FONT', mark: 'ACRYL_BRAND_MARK' }

/** Pure: what to run, in which environment, for one surface and instance. */
export function blankLaunchPlan(surface, flags, environment, home = homedir(), root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), runningSurfaces = []) {
  // `--dir <folder>` runs an app `acryl new` created; otherwise a managed instance named by `--instance` (default `blank`).
  const instance = flags.dir === undefined ? resolveInstance(String(flags.instance ?? DEFAULT_INSTANCE), home) : resolveInstanceAt(String(flags.dir), home)
  const definition = flags.dir !== undefined && flags.blueprint === undefined && existsSync(instance.blueprintFile) ? instance.blueprintFile : undefined
  const brandEnv = Object.fromEntries(Object.entries(FLAG_TO_ENV).flatMap(([flag, variable]) => (flags[flag] === undefined ? [] : [[variable, String(flags[flag])]])))
  // ACRYL_HOME is authoritative for every ACRYL path (profile, sessions, settings, global extensions, plugin state); an ambient DSH_HOME must not leak in.
  const { DSH_HOME: _ambient, ...clean } = environment
  const env = {
    ...clean,
    ACRYL_INSTANCE: instance.id,
    ACRYL_HOME: instance.root,
    ACRYL_BLUEPRINT: definition ?? (flags.blueprint === undefined ? 'acryl.blank' : resolve(String(flags.blueprint))),
    ...brandEnv,
  }
  const base = { instance, blueprint: env.ACRYL_BLUEPRINT }
  // An app that carries its own runtime (`acryl new --runtime`, the extracted ACRYL Web release archive) runs from it and needs nothing else of the framework.
  const carried = flags.dir !== undefined && existsSync(join(instance.root, 'runtime', 'lib', 'bin.js')) ? join(instance.root, 'runtime') : undefined
  if (carried !== undefined) {
    if (surface !== 'web') throw new InstanceError(`this instance carries only the Web runtime; "${surface}" needs the framework (run it from a framework checkout)`)
    const port = Number(flags.port ?? instance.preferredPort)
    return { ...base, surface, carried: true, command: process.execPath, args: [join(carried, 'lib', 'bin.js'), '--no-open'], env: { ...env, ACRYL_WEB_PORT: String(port) }, webPort: port }
  }
  if (surface === 'web') {
    const port = Number(flags.port ?? instance.preferredPort)
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error(`--port must be a port number from 1024 to 65535, got ${String(flags.port)}`)
    return { ...base, surface, command: process.execPath, args: [join(root, 'apps/acryl-web/bin/dev-run.mjs'), '--no-open'], env: { ...env, ACRYL_WEB_PORT: String(port) }, webPort: port }
  }
  if (surface === 'cli') return { ...base, surface, command: process.execPath, args: [join(root, 'apps/acryl-cli/bin/dev-run.mjs')], env }
  if (surface === 'desktop') {
    // Its own Electron user-data folder: the single-instance lock, window state and local storage are per instance.
    // Every Desktop instance runs the same built app (apps/acryl-desktop/lib). Building cleans that folder, so a second launch must not rebuild
    // underneath an instance that is already running from it: it starts from the existing build instead.
    const alreadyRunning = runningSurfaces.includes('desktop')
    return { ...base, surface, skipBuild: alreadyRunning, command: process.execPath, args: [join(root, 'scripts/dev-local.mjs'), ...(alreadyRunning ? ['--skip-build'] : [])], env: { ...env, ACRYL_LOCAL_PRODUCT_NAME: instance.userDataName } }
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

if (isMainModule(import.meta.url)) {
  const [surface = '', ...rest] = process.argv.slice(2)
  try {
    const running = listInstances().filter(instance => instance.running).map(instance => instance.surface)
    const plan = blankLaunchPlan(surface, parseFlags(rest), process.env, undefined, undefined, running)
    if (plan.skipBuild) process.stdout.write('blank: another Desktop instance is running from the current build, so this one starts without rebuilding\n')
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
