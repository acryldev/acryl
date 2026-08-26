#!/usr/bin/env node
/** Isolated local Desktop launch: own DSH home + Electron userData, away from the installed app. */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ACRYL_DSH_HOME_DIR_NAME = '.dsh-acryl'
export const ACRYL_USER_DATA_PRODUCT_NAME = 'ACRYL Development'

/**
 * Resolve isolated persistence roots for a local ACRYL/Desktop launch.
 * @param platform - process.platform
 * @param homeDirectory - os.homedir()
 * @param environment - process.env
 */
export function resolveLocalDesktopRoots(
  platform = process.platform,
  homeDirectory = homedir(),
  environment = process.env,
) {
  const dshHome = join(homeDirectory, ACRYL_DSH_HOME_DIR_NAME)
  if (platform === 'win32') {
    const appData = environment.APPDATA
    if (typeof appData !== 'string' || appData.length === 0) {
      throw new Error('APPDATA is unavailable; cannot isolate Desktop user data')
    }
    return { dshHome, userData: join(appData, ACRYL_USER_DATA_PRODUCT_NAME) }
  }
  if (platform === 'darwin') {
    return {
      dshHome,
      userData: join(homeDirectory, 'Library', 'Application Support', ACRYL_USER_DATA_PRODUCT_NAME),
    }
  }
  const config = environment.XDG_CONFIG_HOME
  const configHome = typeof config === 'string' && config.length > 0
    ? config
    : join(homeDirectory, '.config')
  return { dshHome, userData: join(configHome, ACRYL_USER_DATA_PRODUCT_NAME) }
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

function yarnCommand() {
  return process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
}

function runYarn(args, env) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(yarnCommand(), args, {
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
  const roots = resolveLocalDesktopRoots(process.platform, homedir(), environment)
  mkdirSync(roots.dshHome, { recursive: true, mode: 0o700 })
  mkdirSync(roots.userData, { recursive: true, mode: 0o700 })
  const mode = ensureLocalAdvancedMode(roots.dshHome)
  process.stdout.write(`dev:local DSH_HOME=${roots.dshHome}\n`)
  process.stdout.write(`dev:local userData=${roots.userData}\n`)
  process.stdout.write(`dev:local desktop mode=${mode}\n`)
  process.stdout.write('dev:local quit the installed ACRYL app if it is still running\n')
  const env = {
    ...environment,
    DSH_HOME: roots.dshHome,
    DSH_DESKTOP_USER_DATA: roots.userData,
  }
  if (!skipBuild) {
    const marketCode = await runYarn(['workspace', 'dsh-community-market', 'build'], env)
    if (marketCode !== 0) return marketCode
    return runYarn(['workspace', 'dsh-plugin-desktop', 'dev'], env)
  }
  return runYarn(['workspace', 'dsh-plugin-desktop', 'start'], env)
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
