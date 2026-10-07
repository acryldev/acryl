#!/usr/bin/env node
/** Isolated local Desktop launch: own DSH home + Electron userData, away from the installed app. */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { instanceEnvironment, osHomeDirectory, selectInstance } from './lib/instance-module.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The app instance this Desktop launch runs as, from the runtime's instance module (spec 036, "Self-containment"): an app or home the caller pinned, else
 * this checkout's worktree instance, else the main checkout's isolated development app (`~/.acryl-dev`, Electron "ACRYL Development"). Never the installed
 * app's `~/.acryl`.
 */
export function localDesktopInstance(environment = process.env, osHome = osHomeDirectory(), checkout = repoRoot) {
  return selectInstance({ env: environment, osHome, checkout, development: true })
}

/**
 * Where Electron keeps this instance's user data: the platform's application-data root plus the instance's own user-data name, so the window state,
 * storage and single-instance lock of two apps never meet.
 */
export function localUserDataRoot(instance, platform = process.platform, osHome = osHomeDirectory(), environment = process.env) {
  if (platform === 'win32') {
    const appData = environment.APPDATA
    if (typeof appData !== 'string' || appData.length === 0) throw new Error('APPDATA is unavailable; cannot isolate Desktop user data')
    return join(appData, instance.userDataName)
  }
  if (platform === 'darwin') return join(osHome, 'Library', 'Application Support', instance.userDataName)
  const config = environment.XDG_CONFIG_HOME
  return join(typeof config === 'string' && config.length > 0 ? config : join(osHome, '.config'), instance.userDataName)
}

/**
 * Isolated ACRYL homes start in advanced mode so Development Canvas is visible.
 * @param dshHome - resolved DSH_HOME for this launch
 */
export function ensureLocalAdvancedMode(dshHome) {
  mkdirSync(dshHome, { recursive: true, mode: 0o700 })
  const settingsPath = join(dshHome, 'settings.yaml')
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, 'dsh-desktop:\n  mode: advanced\n', { encoding: 'utf8', mode: 0o600 })
    return 'created'
  }
  const text = readFileSync(settingsPath, 'utf8')
  if (/\bmode:\s*advanced\b/u.test(text)) return 'already-advanced'
  if (/\bmode:\s*compatibility\b/u.test(text)) {
    writeFileSync(settingsPath, text.replace(/\bmode:\s*compatibility\b/u, 'mode: advanced'), { encoding: 'utf8' })
    return 'switched'
  }
  writeFileSync(
    settingsPath,
    `${text.replace(/\s*$/u, '')}\n\ndsh-desktop:\n  mode: advanced\n`,
    { encoding: 'utf8' },
  )
  return 'appended'
}

function corepackCommand() {
  return process.platform === 'win32' ? 'corepack.cmd' : 'corepack'
}

function runPnpm(args, env) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(corepackCommand(), ['pnpm', ...args], {
      stdio: 'inherit',
      env,
      cwd: resolve(fileURLToPath(new URL('..', import.meta.url))),
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolveExit(code ?? (signal === null ? 1 : 128))
    })
  })
}

export async function runDevLocal(argv = process.argv.slice(2), environment = process.env) {
  const skipBuild = argv.includes('--skip-build')
  const instance = localDesktopInstance(environment)
  const userData = localUserDataRoot(instance, process.platform, osHomeDirectory(), environment)
  mkdirSync(instance.dshHome, { recursive: true, mode: 0o700 })
  mkdirSync(userData, { recursive: true, mode: 0o700 })
  // The development app starts in advanced mode so Development Canvas is visible; an app keeps its own defaults.
  const mode = instance.kind === 'development' || instance.kind === 'worktree' ? ensureLocalAdvancedMode(instance.dshHome) : 'app-default'
  process.stdout.write(`dev:local app=${instance.id} (${instance.kind}) home=${instance.home}\n`)
  process.stdout.write(`dev:local userData=${userData}\n`)
  process.stdout.write(`dev:local desktop mode=${mode}\n`)
  const env = { ...environment, ...instanceEnvironment(instance), DSH_DESKTOP_USER_DATA: userData }
  if (!skipBuild) {
    // The market and what it is built from, in dependency order (it needs `acryl-settings` built first); a bare `--filter cordis-plugin-market` failed
    // on a fresh checkout with "Cannot find module 'acryl-settings'", because nothing before it had built that package.
    const marketCode = await runPnpm(['--filter', 'cordis-plugin-market...', '--workspace-concurrency=1', 'run', 'build'], env)
    if (marketCode !== 0) return marketCode
    return runPnpm(['--filter', 'acryl-desktop', 'run', 'dev'], env)
  }
  return runPnpm(['--filter', 'acryl-desktop', 'run', 'start'], env)
}

const invoked = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invoked === fileURLToPath(import.meta.url)) {
  void runDevLocal().then((code) => {
    process.exitCode = code
  }, (cause) => {
    process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}
