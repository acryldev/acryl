// Opens one ACRYL app in its own window from an OS shortcut (Spotlight, the Start menu, an app launcher), the way Control Center's Start does: the
// saved model key in its environment, `npm install` the first time, then `npm run desktop` in its folder, left running after this script ends.
// os-shortcuts.js copies this file and model-key.js (Node built-ins only) into <ACRYL home>/shortcuts; every shortcut runs:
//   node <ACRYL home>/shortcuts/shortcut-open.mjs <app folder> [<name the app shows>]
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { basename, delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modelEnv } from './model-key.js'

const [folder, name] = process.argv.slice(2)
if (!folder || !existsSync(join(folder, 'blend.yaml'))) {
  console.error(`acryl: ${folder ?? '(no folder)'} is not an ACRYL app any more; open ACRYL Control Center to remove its shortcut`)
  process.exit(1)
}
const home = dirname(dirname(fileURLToPath(import.meta.url)))
const windows = process.platform === 'win32'
// Windows names it Path; a copied environment is case-sensitive, so the existing key is the one to extend.
const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
const env = {
  ...process.env,
  [pathKey]: `${dirname(process.execPath)}${delimiter}${process.env[pathKey] ?? ''}`,
  ...modelEnv(home, process.env),
  ...(name ? { ACRYLBLENDS_NAME: name } : {}),
}
mkdirSync(join(home, 'logs', 'shortcuts'), { recursive: true })
const log = openSync(join(home, 'logs', 'shortcuts', `${basename(folder)}.log`), 'a')
// One command string on Windows (npm is npm.cmd, which only a shell runs); a shell with an argument list is deprecated (DEP0190).
const npm = words => windows ? [`npm ${words.join(' ')}`, [], { shell: true }] : ['npm', words, {}]
const run = (words, options) => { const [command, args, extra] = npm(words); return [command, args, { cwd: folder, env, windowsHide: true, ...extra, ...options }] }

if (!existsSync(join(folder, 'node_modules', '.package-lock.json'))) {
  const installed = spawnSync(...run(['install', '--no-audit', '--no-fund'], { stdio: ['ignore', log, log] }))
  if (installed.status !== 0) process.exit(installed.status ?? 1)
}
spawn(...run(['run', 'desktop'], { stdio: ['ignore', log, log], detached: true })).unref()
