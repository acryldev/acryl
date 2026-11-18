#!/usr/bin/env node
// The gate of the live install under `npm run dev`: every attendee of the workshop builds a plugin while the dev script watches the folder, installs it with
// `.acryl/bin/acryl plugin add plugins/<name>`, and expects the page. The install stages a copy of the plugin in .acrylblends/extensions-staged/ and loads it; if the dev
// script watches that copy, the install restarts the app halfway through and the door answers "no running app".
//   node scripts/verify-dev-install.mjs [--npm <version>]
// In a fresh agent app started with `npm run dev`: a plugin is installed live, then its source is changed and reloaded. The app must answer the plugin's page after the install and
// the reload without a restart and with its door up (the watcher takes the deletion of a staged copy for a change and restarts, and each start stages and prunes again: a loop);
// a change of the app's own source then restarts it exactly once, and the plugin is back from its staged copy.
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-dev-install: ${message}`)
const fail = (message) => {
  throw new Error(`verify-dev-install: ${message}`)
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
const scratch = mkdtempSync(join(tmpdir(), 'dev-install-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
delete env.ACRYL_DOOR
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
/** A plugin whose page shows the text of its version; the name is its own, so no route of the template can shadow it. */
const plugin = (version) => `import { Acryl } from 'acryl-router'
export const name = 'board'
export const inject = ['router']
export function apply(ctx: { router: { route(path: string, app: unknown): void } }) {
  const app = new Acryl()
  app.get('/board', (c) => c.html('<!doctype html><html><head><title>Board</title></head><body><main><h1>Board ${version}</h1></main></body></html>'))
  ctx.router.route('/', app)
}
`

let server
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
  mkdirSync(join(app, 'plugins', 'board'))
  writeFileSync(join(app, 'plugins', 'board', 'index.ts'), plugin('one'))

  const port = await freePort()
  server = startGroup('npm', ['run', 'dev'], {
    cwd: app,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  const count = (pattern) => (output.match(pattern) ?? []).length
  const base = await until(async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1], 40_000)
  if (!base) fail(`the app did not start:\n${output}`)
  const acryl = (...args) => {
    const r = spawnSync(
      join(app, '.acryl', 'bin', process.platform === 'win32' ? 'acryl.cmd' : 'acryl'),
      args,
      { cwd: app, env, encoding: 'utf8', shell: process.platform === 'win32' },
    )
    return { code: r.status, out: r.stdout, err: r.stderr }
  }
  const page = async () => {
    const r = await fetch(`${base}/board`)
    return r.ok ? await r.text() : undefined
  }
  const doorUp = () => {
    try {
      const door = JSON.parse(readFileSync(join(app, '.acryl', 'door.json'), 'utf8'))
      process.kill(door.pid, 0)
      return true
    } catch {
      return false
    }
  }
  if (!(await until(async () => doorUp(), 20_000))) fail(`no door after start:\n${output}`)
  // Dev has been listening; a settled output is the baseline: restarts from here on are the install's.
  await sleep(1500)
  const started = count(/listening on http/gu)

  const added = acryl('plugin', 'add', 'plugins/board')
  if (added.code !== 0) fail(`plugin add failed:\n${added.out}${added.err}\n--- app:\n${output}`)
  const text = await until(
    async () => (await page())?.includes('Board one') && (await page()),
    20_000,
  )
  if (!text) fail(`/board is not served after the install:\n${output}`)
  if (!doorUp()) fail(`the door is gone after the install:\n${output}`)
  // Give a restart the watcher would make time to show itself.
  await sleep(3000)
  const restarts = count(/Restarting/gu)
  if (restarts > 0)
    fail(
      `the install restarted the app ${restarts} time(s); the staged copy must not be watched:\n${output}`,
    )
  if (count(/listening on http/gu) !== started)
    fail(`the app listened again after the install:\n${output}`)
  log('the app did not restart for the install, the page is served and the door stayed up')

  // A change of the plugin's own source, then reload: the new page, still without a restart for the staged copy.
  writeFileSync(join(app, 'plugins', 'board', 'index.ts'), plugin('two'))
  const reloaded = acryl('plugin', 'reload', 'board')
  if (reloaded.code !== 0) fail(`plugin reload failed:\n${reloaded.out}${reloaded.err}`)
  if (!(await until(async () => (await page())?.includes('Board two'), 20_000)))
    fail(`/board does not show the new version after the reload:\n${output}`)
  if (!doorUp()) fail(`the door is gone after the reload:\n${output}`)
  await sleep(3000)
  if (count(/Restarting/gu) > 0)
    fail(
      `the reload restarted the app (the old staged copy was deleted under the watcher):\n${output}`,
    )
  log('a reload of the plugin did not restart the app either')

  // A change the app does restart for (its own source): exactly one restart, which starts the installed plugin again from its staged copy and does not set off another.
  const before = count(/listening on http/gu)
  const main = join(app, 'src', 'main.ts')
  writeFileSync(main, `${readFileSync(main, 'utf8')}\n// touched by the gate\n`)
  if (!(await until(async () => count(/listening on http/gu) === before + 1, 20_000)))
    fail(`the app did not restart for a change of src/main.ts:\n${output}`)
  if (!(await until(async () => (await page())?.includes('Board two'), 20_000)))
    fail(`/board is not served after the restart:\n${output}`)
  await sleep(4000)
  if (count(/Restarting/gu) !== 1 || count(/listening on http/gu) !== before + 1)
    fail(
      `one change of src/main.ts made ${count(/Restarting/gu)} restarts (expected 1):\n${output}`,
    )
  if (!(await until(async () => doorUp(), 10_000)))
    fail(`the door is gone after the restart:\n${output}`)
  log('a change of src restarts the app once and the plugin comes back from its staged copy')
  log('OK')
} finally {
  if (server) await stopGroup(server)
  rmSync(scratch, { recursive: true, force: true })
}
