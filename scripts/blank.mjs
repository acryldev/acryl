#!/usr/bin/env node
/**
 * Start an ACRYL app on one surface, as a sealed instance (spec 036, "Self-containment"):
 *
 *   node scripts/blank.mjs web --dir ~/apps/orbit          an app `acryl new` created (its bin/acryl runs exactly this)
 *   node scripts/blank.mjs web [--instance orbit]          a managed app in ~/.acryl-instances/<name>, from the blank Blueprint (default name: blank)
 *   options: --port <n>  --name <brand name>  --accent '#rrggbb'  --blueprint <file.yaml>        surfaces: web | desktop | cli
 *
 * Where the app lives, its port, its Electron user data and its project scope come from the runtime's instance module; this launcher claims the app (one
 * live process per app), announces it in the Registry, hands the family to the app through the environment contract, and releases it on exit.
 * `node scripts/instances.mjs ps` lists what is running.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InstanceError, appFolder, claimInstance, isMainModule, listInstances, managedApp, releaseInstance } from './lib/instances.mjs'
import { instanceEnvironment, osHomeDirectory, withWebPort } from './lib/instance-module.mjs'

export const DEFAULT_INSTANCE = 'blank'

const FLAG_TO_ENV = { name: 'ACRYL_BRAND_NAME', tagline: 'ACRYL_BRAND_TAGLINE', accent: 'ACRYL_BRAND_ACCENT', 'accent-dark': 'ACRYL_BRAND_ACCENT_DARK', font: 'ACRYL_BRAND_FONT', mark: 'ACRYL_BRAND_MARK' }

/** The variables that decide where an app lives. The launcher replaces them with the app's own family; an ambient value must never leak into an app. */
const PLACEMENT = ['ACRYL_HOME', 'DSH_HOME', 'ACRYL_WEB_PORT', 'ACRYL_INSTANCE', 'ACRYL_LOCAL_PRODUCT_NAME', 'ACRYL_BLUEPRINT']

/** Pure: what to run, in which environment, for one surface and app. */
export function blankLaunchPlan(surface, flags, environment, osHome = osHomeDirectory(), root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), runningSurfaces = []) {
  let instance
  try {
    instance = flags.dir === undefined ? managedApp(String(flags.instance ?? DEFAULT_INSTANCE), osHome) : appFolder(String(flags.dir), osHome)
    if (flags.port !== undefined) instance = withWebPort(instance, Number(flags.port))
  } catch (error) {
    throw new InstanceError(error instanceof Error ? error.message : String(error))
  }
  const clean = Object.fromEntries(Object.entries(environment).filter(([key]) => !PLACEMENT.includes(key)))
  const brandEnv = Object.fromEntries(Object.entries(FLAG_TO_ENV).flatMap(([flag, variable]) => (flags[flag] === undefined ? [] : [[variable, String(flags[flag])]])))
  // An app folder's own definition is its Blueprint; a managed app without one starts from the blank canvas.
  const blueprint = flags.blueprint !== undefined ? resolve(String(flags.blueprint)) : instance.definitionFile !== undefined && existsSync(instance.definitionFile) ? instance.definitionFile : 'acryl.blank'
  const env = { ...clean, ...instanceEnvironment(instance), ACRYL_BLUEPRINT: blueprint, ...brandEnv }
  const base = { instance, blueprint, webPort: instance.webPort.start }
  // An app that carries its own runtime (`acryl new --runtime`) runs from it and needs nothing else of the framework.
  const carried = flags.dir !== undefined && existsSync(join(instance.home, 'runtime', 'lib', 'bin.js')) ? join(instance.home, 'runtime') : undefined
  if (carried !== undefined) {
    if (surface !== 'web') throw new InstanceError(`this app carries only the Web runtime; "${surface}" needs the framework (run it from a framework checkout)`)
    return { ...base, surface, carried: true, command: process.execPath, args: [join(carried, 'lib', 'bin.js'), '--no-open'], env }
  }
  if (surface === 'web') return { ...base, surface, command: process.execPath, args: [join(root, 'apps/acryl-web/bin/dev-run.mjs'), '--no-open'], env }
  if (surface === 'cli') return { ...base, surface, command: process.execPath, args: [join(root, 'apps/acryl-cli/bin/dev-run.mjs')], env }
  if (surface === 'desktop') {
    // Every Desktop app runs the same built Electron app (apps/acryl-desktop/lib); building cleans that folder, so a second one starts from the existing build.
    const alreadyRunning = runningSurfaces.includes('desktop')
    return { ...base, surface, skipBuild: alreadyRunning, command: process.execPath, args: [join(root, 'scripts/dev-local.mjs'), ...(alreadyRunning ? ['--skip-build'] : [])], env }
  }
  throw new InstanceError(`unknown surface ${JSON.stringify(surface)}; use web, cli or desktop`)
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
    const running = listInstances().filter(app => app.running).map(app => app.surface)
    const plan = blankLaunchPlan(surface, parseFlags(rest), process.env, undefined, undefined, running)
    claimInstance(plan.instance, { pid: process.pid, surface: plan.surface, ...(plan.surface === 'web' ? { port: plan.webPort } : {}) })
    process.stdout.write(`acryl: app "${plan.instance.id}" in ${plan.instance.home}\n`)
    if (plan.skipBuild) process.stdout.write('acryl: another Desktop app is running from the current build, so this one starts without rebuilding\n')
    const release = () => releaseInstance(plan.instance)
    // The app runs in its own process group (the dev launchers run it through further child processes), so a stop reaches every one of them.
    const grouped = process.platform !== 'win32'
    const child = spawn(plan.command, plan.args, { env: plan.env, stdio: 'inherit', detached: grouped })
    const stop = signal => { try { process.kill(grouped ? -child.pid : child.pid, signal) } catch { /* already gone */ } }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stop(signal))
    child.on('exit', code => { release(); process.exitCode = code ?? 0 })
    child.on('error', error => { release(); process.stderr.write(`acryl: ${error.message}\n`); process.exitCode = 1 })
  } catch (error) {
    process.stderr.write(`acryl: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = error instanceof InstanceError ? 3 : 2
  }
}
