#!/usr/bin/env node
// The workshop's deploy block: what the agent built in development is what production serves. A fresh agent app; a plugin (a page at /board) is installed live through the door
// in `npm run dev`; the dev server stops; `NODE_ENV=production npm start` must serve /board, say which extensions it started, and keep every way to change them off:
// /ask, /extensions, /extensions/approve and /tasks answer 404 and the install verb is refused. A second start, with the plugin's folder gone but the app's record still naming
// it, must warn by name.
//   node scripts/verify-production-extension.mjs [--npm <version>]
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-production-extension: ${message}`)
const fail = (message) => {
  throw new Error(`verify-production-extension: ${message}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms, every = 300) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await fn().catch(() => undefined)
    if (value) return value
    await sleep(every)
  }
}
const npmArg =
  process.argv.indexOf('--npm') === -1 ? undefined : process.argv[process.argv.indexOf('--npm') + 1]
const isWindows = process.platform === 'win32'
const scratch = mkdtempSync(join(tmpdir(), 'production-ext-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
delete env.ACRYL_DOOR
delete env.NODE_ENV
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: isWindows && command === 'npm',
  })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
/** Stop a process and what it started (Windows has no process groups). */
async function stopTree(child) {
  if (isWindows && child.pid !== undefined)
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  await stopGroup(child)
}
const board = `import { Acryl } from 'acryl-router'
export const name = 'board'
export const inject = ['router']
export function apply(ctx: { router: { route(path: string, app: unknown): void } }) {
  const app = new Acryl()
  app.get('/board', (c) => c.html('<!doctype html><html><head><title>Board</title></head><body><main><h1>Workshop board</h1></main></body></html>'))
  ctx.router.route('/', app)
}
`

const started = []
/** Start `npm run <script>` in the app and wait for its listening line. */
async function serve(app, script, extra) {
  const child = startGroup('npm', ['run', script], {
    cwd: app,
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
  })
  const proc = { child, output: '' }
  child.stdout.on('data', (c) => (proc.output += c))
  child.stderr.on('data', (c) => (proc.output += c))
  started.push(proc)
  proc.base = await until(async () => /listening on (http:\/\/\S+)/u.exec(proc.output)?.[1], 40_000)
  if (!proc.base) fail(`npm run ${script} did not start:\n${proc.output}`)
  return proc
}
const status = async (base, path, method = 'GET') =>
  (await fetch(`${base}${path}`, { method, headers: { accept: 'text/html' } })).status

try {
  const app = join(scratch, 'app')
  if (npmArg === undefined)
    run(process.execPath, [cli, 'init', app, '--template', 'agent', '--bare', '-y'], scratch)
  else
    run(
      'npx',
      ['--yes', `acrylblends@${npmArg}`, 'init', app, '--template', 'agent', '-y'],
      scratch,
    )
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  mkdirSync(join(app, 'plugins', 'board'), { recursive: true })
  writeFileSync(join(app, 'plugins', 'board', 'index.ts'), board)

  // Development: the plugin is installed live, through the door, the way the workshop's agent does.
  const dev = await serve(app, 'dev', { PORT: String(await freePort()) })
  const added = spawnSync(
    join(app, '.acryl', 'bin', isWindows ? 'acryl.cmd' : 'acryl'),
    ['plugin', 'add', 'plugins/board'],
    { cwd: app, env, encoding: 'utf8', shell: isWindows },
  )
  if (added.status !== 0) fail(`plugin add failed:\n${added.stdout}${added.stderr}`)
  if ((await status(dev.base, '/board')) !== 200)
    fail('/board is not served in development after the install')
  await stopTree(dev.child)
  await until(
    async () =>
      await fetch(dev.base).then(
        () => false,
        () => true,
      ),
    15_000,
  )

  // Production.
  // A deploy installs without the development dependencies (`npm ci --omit=dev`): what production needs at run time has to be in dependencies, not only in devDependencies.
  run('npm', ['prune', '--omit=dev', '--no-audit', '--no-fund'], app)
  if (!existsSync(join(app, 'node_modules', 'ws', 'package.json')))
    fail(
      'ws is not installed without the development dependencies: the state plugin follows keys over a WebSocket in production',
    )
  const production = await serve(app, 'start', {
    NODE_ENV: 'production',
    PORT: String(await freePort()),
  })
  if (!production.output.includes('extensions (read-only): board'))
    fail(`production did not say which extensions it started:\n${production.output}`)
  if ((await status(production.base, '/board')) !== 200)
    fail(
      `/board answers ${await status(production.base, '/board')} in production: the deploy ships nothing the attendee made`,
    )
  if ((await status(production.base, '/health')) !== 200)
    fail('/health is not served in production')
  // State is followed over a WebSocket in production too (`watch` of /api/state/client.js): a program with no Origin and a loopback Host is let in.
  const followed = await new Promise((resolve) => {
    const socket = new WebSocket(`${production.base.replace('http', 'ws')}/api/state/ws`)
    const timer = setTimeout(() => resolve('no answer in 5 s'), 5000)
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({ t: 'sub', key: 'extensions' })),
    )
    socket.addEventListener('message', (event) => {
      const frame = JSON.parse(String(event.data))
      if (frame.t === 'ping') return
      clearTimeout(timer)
      socket.close()
      resolve(frame.key === 'extensions' && 'value' in frame ? 'ok' : JSON.stringify(frame))
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      resolve('the upgrade was refused')
    })
  })
  if (followed !== 'ok') fail(`production does not serve state over a WebSocket: ${followed}`)
  for (const [path, method] of [
    ['/ask', 'POST'],
    ['/extensions', 'GET'],
    ['/extensions/approve', 'POST'],
    ['/extensions/deny', 'POST'],
    ['/tasks', 'GET'],
    ['/tasks/cancel', 'POST'],
  ]) {
    const answer = await status(production.base, path, method)
    if (answer !== 404) fail(`${method} ${path} answers ${answer} in production; it must be 404`)
  }
  if (/acryl-door|\.acryl[\\/](door\.json|bin[\\/])/u.test(production.output))
    fail(`production mentions the door:\n${production.output}`)
  log(
    'production, installed without the development dependencies, serves /board from plugins/, says so at start, follows state over a WebSocket, and /ask, /extensions*, /tasks* are 404',
  )
  await stopTree(production.child)
  await until(
    async () =>
      await fetch(production.base).then(
        () => false,
        () => true,
      ),
    15_000,
  )

  // A record of dev that plugins/ cannot back: named, not silent.
  rmSync(join(app, 'plugins', 'board'), { recursive: true, force: true })
  const again = await serve(app, 'start', {
    NODE_ENV: 'production',
    PORT: String(await freePort()),
  })
  if (!/WARNING: extensions\.json records the extension "board"/u.test(again.output))
    fail(
      `production did not warn about the recorded extension whose folder is gone:\n${again.output}`,
    )
  if ((await status(again.base, '/board')) !== 404)
    fail('/board is served although its folder is gone')
  log('a recorded extension whose folder is missing is a named warning, not silence')
  log('OK')
} finally {
  for (const { child } of started.reverse()) await stopTree(child)
  await sleep(300)
  try {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch (cause) {
    log(`could not remove ${scratch}: ${cause.message}`)
  }
}
