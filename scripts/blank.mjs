#!/usr/bin/env node
/**
 * Launch the blank canvas (`acryl.blank`, spec 036) on one surface, in its own home so your real ACRYL profile is never touched.
 *
 *   node scripts/blank.mjs web     [--name Orbit] [--accent '#e8590c'] [--port 3081] [--blueprint my.blueprint.yaml]
 *   node scripts/blank.mjs cli     [--name Orbit]
 *   node scripts/blank.mjs desktop [--name Orbit]        (own home ~/.acryl-blank and own Electron user data "ACRYL Blank")
 *
 * Every surface runs in `~/.acryl-blank/.dsh`; the Web server listens on port 3081 unless `--port` says otherwise: 3080 belongs to the main-branch app.
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BLANK_HOME_DIR_NAME = '.acryl-blank'
export const DEFAULT_BLANK_WEB_PORT = 3081

const FLAG_TO_ENV = { name: 'ACRYL_BRAND_NAME', tagline: 'ACRYL_BRAND_TAGLINE', accent: 'ACRYL_BRAND_ACCENT', 'accent-dark': 'ACRYL_BRAND_ACCENT_DARK', font: 'ACRYL_BRAND_FONT', mark: 'ACRYL_BRAND_MARK' }

/** Pure: what to run, in which environment, for one surface. */
export function blankLaunchPlan(surface, flags, environment, home = homedir(), root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const brandEnv = Object.fromEntries(Object.entries(FLAG_TO_ENV).flatMap(([flag, variable]) => (flags[flag] === undefined ? [] : [[variable, String(flags[flag])]])))
  const env = { ...environment, ACRYL_BLUEPRINT: flags.blueprint === undefined ? 'acryl.blank' : resolve(String(flags.blueprint)), ...brandEnv }
  const isolated = join(home, BLANK_HOME_DIR_NAME, '.dsh')
  if (surface === 'web') {
    const port = Number(flags.port ?? DEFAULT_BLANK_WEB_PORT)
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error(`--port must be a port number from 1024 to 65535, got ${String(flags.port)}`)
    return { command: process.execPath, args: [join(root, 'apps/acryl-web/bin/dev-run.mjs'), '--no-open'], env: { ...env, DSH_HOME: isolated, ACRYL_WEB_PORT: String(port) }, webPort: port, home: isolated }
  }
  if (surface === 'cli') return { command: process.execPath, args: [join(root, 'apps/acryl-cli/bin/dev-run.mjs')], env: { ...env, DSH_HOME: isolated }, home: isolated }
  // Its own DSH home and Electron user-data folder: shares no profile, history, market setting or single-instance lock with the development app.
  if (surface === 'desktop') return { command: process.execPath, args: [join(root, 'scripts/dev-local.mjs')], env: { ...env, ACRYL_LOCAL_HOME_DIR: BLANK_HOME_DIR_NAME, ACRYL_LOCAL_PRODUCT_NAME: 'ACRYL Blank' } }
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
    if (plan.webPort !== undefined) process.stdout.write(`blank: Web will listen on 127.0.0.1:${plan.webPort}\n`)
    if (plan.home !== undefined) process.stdout.write(`blank: DSH_HOME=${plan.home}\n`)
    spawn(plan.command, plan.args, { env: plan.env, stdio: 'inherit' }).on('exit', code => { process.exitCode = code ?? 0 })
  } catch (error) {
    process.stderr.write(`blank: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
