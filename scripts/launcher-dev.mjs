#!/usr/bin/env node
/**
 * Look at the ACRYL launcher from this checkout, on any of its three faces: `pnpm launcher web | gui | tui | all`.
 *   web  the screen in a browser (the address is printed)         gui  the screen in the Electron window of this checkout's isolated app
 *   tui  the terminal screen (needs a terminal), in an isolated home so it never touches ~/.acryl
 *   blend  the launcher in the Blends frame (its right panel: chat, Claude Code, Codex, Pi), in a desktop window: scripts/launcher-blend.mjs
 *   all  web and gui in the background (their logs are in the folder printed), tui in this terminal; leaving the tui stops the other two
 * The packages the screen is made of (`acryl-launcher-desktop`, `acryl-sign-in`) are built first: `pnpm web` and `pnpm desktop` do not rebuild them.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FACES = ['web', 'gui', 'tui', 'all', 'blend']
const face = process.argv[2]
if (!FACES.includes(face)) {
  console.error(`usage: pnpm launcher <${FACES.join(' | ')}>`)
  process.exit(2)
}

if (face === 'blend') process.exit(spawnSync('node', ['scripts/launcher-blend.mjs'], { cwd: root, stdio: 'inherit' }).status ?? 0)

const run = (command, args, options = {}) => spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
const built = run('node', ['scripts/with-build-lock.mjs', 'corepack', 'pnpm', '--filter', 'acryl-launcher-desktop', '--filter', 'acryl-sign-in', 'run', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] })
if (built.status !== 0) process.exit(built.status ?? 1)

const scratch = join(process.env.ACRYL_LAUNCHER_DEV ?? join(tmpdir(), 'acryl-launcher-dev'))
mkdirSync(scratch, { recursive: true })
const children = []
const stopAll = () => { for (const child of children.splice(0)) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ } } }
process.on('exit', stopAll)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopAll(); process.exit(130) })

/** A background face with its output in `<scratch>/<name>.log`. */
function background(name, args) {
  const log = join(scratch, `${name}.log`)
  const fd = openSync(log, 'w')
  const child = spawn('corepack', ['pnpm', 'run', ...args], { cwd: root, detached: true, stdio: ['ignore', fd, fd] })
  children.push(child)
  console.log(`${name}: started, log ${log}`)
  return log
}

/** The address the web face prints, once it has. */
async function webAddress(log) {
  for (let waited = 0; waited < 180_000; waited += 1000) {
    const match = /ACRYL web: (\S+)/u.exec(readFileSync(log, 'utf8'))
    if (match) return match[1]
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return undefined
}

function tui() {
  const home = join(scratch, 'tui-home')
  mkdirSync(home, { recursive: true })
  console.log(`tui: isolated home ${home} (apps are suggested in ${join(scratch, 'tui-apps')})`)
  const result = spawnSync('node', ['apps/acryl-launcher-tui/scripts/dev.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, ACRYL_LAUNCHER_HOME: home, ACRYL_LAUNCHER_APPS: join(scratch, 'tui-apps') } })
  return result.status ?? 0
}

if (face === 'tui') process.exit(tui())
if (face === 'web' || face === 'gui') {
  const result = run('corepack', ['pnpm', 'run', face === 'web' ? 'web' : 'desktop'])
  process.exit(result.status ?? 0)
}
// all
const webLog = background('web', ['web'])
background('gui', ['desktop'])
const address = await webAddress(webLog)
console.log(address === undefined ? 'web: no address yet, see the log' : `web: ${address}`)
console.log('gui: the window opens when its build is done (the first run fetches Electron)')
const status = tui()
stopAll()
process.exit(status)
