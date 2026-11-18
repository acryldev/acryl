#!/usr/bin/env node
// Manual gate (it opens a real window, so it needs a display and an Electron binary, and is not part of `pnpm run check`): generate a todo app with --desktop in a scratch HOME,
// run `npm run desktop`, check that the window shows the app's own route content, a second launch hands over to the first, closing the window ends the process and frees the
// port, nothing was written to the real user's application-data folder, and nothing is left running.
//
//   node scripts/verify-desktop.mjs [screenshot.png]
//
// Electron's binary comes from ELECTRON_CACHE (default: the platform's electron cache), so a cached download is reused.
import './lib/scratch-home.mjs'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const cli = join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
const args = process.argv.slice(2)
const npmAt = args.indexOf('--from-npm')
/** With `--from-npm <version>` the published package is used instead of this checkout: a blank app, then `acrylblends add desktop` on it, as a user would. */
const fromNpm = npmAt >= 0 ? args[npmAt + 1] : undefined
/** With `--plain [--tarball <acrylblends .tgz>]` the app is a plain Acryl app made by create-acrylblends (template nodejs), then `acrylblends add desktop`; the package is the tarball, or `--from-npm`'s version. */
const plain = args.includes('--plain')
const tarballAt = args.indexOf('--tarball')
const tarball = tarballAt >= 0 ? resolve(args[tarballAt + 1] ?? '') : undefined
const positional = args.filter(
  (a, i) => !a.startsWith('--') && i !== npmAt + 1 && i !== tarballAt + 1,
)
const shot = resolve(positional[0] ?? join(tmpdir(), 'acrylblends-desktop-window.png'))
const log = (m) => console.log(`verify-desktop: ${m}`)
const fail = (m) => {
  throw new Error(`verify-desktop: ${m}`)
}
const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-desktop-'))
const home = join(scratch, 'home')
mkdirSync(home)
const env = {
  ...process.env,
  HOME: home,
  ELECTRON_CACHE: process.env.ELECTRON_CACHE ?? join(homedir(), 'Library', 'Caches', 'electron'),
}
const appSupport =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : join(homedir(), '.config')
const marker = join(scratch, 'marker')
writeFileSync(marker, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const entry = plain ? 'plugins/desktop-web/main.ts' : 'plugins/desktop/main.ts'
/** A free port for the debugging connection (a fixed or random port could belong to another program, or to a previous run still closing). */
const port = await new Promise((resolvePort, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port: free } = probe.address()
    probe.close(() => resolvePort(free))
  })
})
const electronLog = join(scratch, 'electron.log')
let child
/** The step being run, printed with the failure. */
let current = 'start'
const step = (name) => {
  current = name
}
try {
  step('create the app')
  if (plain) {
    run(
      process.execPath,
      [
        join(root, 'packages', 'create', 'bin', 'create-acrylblends.js'),
        'app',
        '--template',
        'nodejs',
        // Only the files: the framework is installed next, from the tarball or the version named.
        '--bare',
        '--no-install',
        '--no-start',
        '-y',
      ],
      scratch,
    )
    const app = join(scratch, 'app')
    run('npm', ['install', tarball ?? `acrylblends@${fromNpm}`, '--no-audit', '--no-fund'], app)
    run(
      process.execPath,
      [join(app, 'node_modules', 'acrylblends', 'bin', 'acrylblends.js'), 'add', 'desktop'],
      app,
    )
  } else if (fromNpm) {
    const npx = (...rest) => run('npx', ['--yes', `acrylblends@${fromNpm}`, ...rest], scratch)
    npx('init', 'app', '--name', 'verify-desktop-window', '--template', 'blank', '-y')
    npx('add', 'desktop', '--dir', 'app')
  } else
    run(
      process.execPath,
      [
        cli,
        'init',
        'app',
        '--name',
        'verify-desktop-window',
        '--template',
        'todo',
        '--desktop',
        '-y',
      ],
      scratch,
    )
  const app = join(scratch, 'app')
  step('npm install')
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  // A plain install must not have downloaded the binary (Electron 44 has no install script): the first `electron` run does, and this gate launches without installing it by hand.
  if (existsSync(join(app, 'node_modules', 'electron', 'dist')))
    fail(
      'npm install downloaded the Electron binary; the lazy first-run download was not exercised',
    )
  step('first launch: wait for the window')
  const launchStarted = Date.now()
  child = spawn(
    join(app, 'node_modules', '.bin', 'electron'),
    [`--remote-debugging-port=${port}`, entry],
    {
      cwd: app,
      env: { ...env, ACRYLBLENDS_PORT: '0' },
      stdio: ['ignore', openSync(electronLog, 'a'), openSync(electronLog, 'a')],
    },
  )
  let target
  for (let i = 0; i < 240 && target === undefined; i++) {
    await sleep(500)
    target = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .then((l) => l.find((t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:')))
      .catch(() => undefined)
  }
  if (!target) fail('no window opened on the app within 2 minutes')
  if (!existsSync(join(app, 'node_modules', 'electron', 'dist')))
    fail('the window opened but the binary is not in node_modules/electron/dist')
  log(
    `the first launch fetched the Electron binary and opened the window in ${Math.round((Date.now() - launchStarted) / 1000)} s`,
  )
  step('the window shows the app')
  const url = new URL(target.url)
  const expectedPath = fromNpm || plain ? '/' : '/todo'
  if (url.pathname !== expectedPath)
    fail(`the window opened on ${url.pathname}, not ${expectedPath}`)
  if (!fromNpm && !plain) {
    const created = await fetch(`${url.origin}/todo/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Desktop window works' }),
    })
    if (created.status !== 201) fail(`the app's own API answered ${created.status}`)
  }
  await sleep(500)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => {
    ws.onopen = r
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id) pending.get(m.id)?.(m.result)
  }
  const call = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const text = (
    await call('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })
  ).result.value
  const wanted = plain ? 'Acryl!' : fromNpm ? '"ok":true' : 'Desktop window works'
  if (!text.includes(wanted))
    fail(`the window does not show the app's content: ${JSON.stringify(text)}`)
  const png = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(shot, Buffer.from(png.data, 'base64'))
  log(`the window shows the app's own page and the todo it just got (${shot})`)
  // A second launch of the same app hands over to the first one and ends.
  step('second launch hands over')
  const second = spawnSync(join(app, 'node_modules', '.bin', 'electron'), [entry], {
    cwd: app,
    env: { ...env, ACRYLBLENDS_PORT: '0' },
    timeout: 30_000,
  })
  if (second.status !== 0) fail(`the second launch did not end cleanly (${second.status})`)
  const windows = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())).filter(
    (t) => t.type === 'page',
  )
  if (windows.length !== 1) fail(`${windows.length} windows after a second launch`)
  log('a second launch of the same app ended and left one window')
  // Closing the window ends the process, after the server stopped.
  step('close the window: the process ends')
  const exited = new Promise((r) => child.once('exit', (code) => r(code)))
  await call('Runtime.evaluate', { expression: 'window.close()' })
  const code = await Promise.race([exited, sleep(15_000).then(() => 'timeout')])
  if (code === 'timeout') fail('closing the window did not end the process within 15 s')
  ws.close()
  if (
    await fetch(url.origin).then(
      () => true,
      () => false,
    )
  )
    fail('the app server still answers after the window closed')
  step('nothing left running, nothing written outside the app')
  const left = spawnSync('pgrep', ['-f', join(app, 'node_modules', 'electron')], {
    encoding: 'utf8',
  }).stdout.trim()
  if (left) fail(`processes are left running: ${left}`)
  if (!existsSync(join(app, '.acrylblends', 'electron')))
    fail("Electron's user data is not inside the app's own home")
  // Any new entry counts: if this fails, the message names the entries and when they changed, so the cause can be read instead of guessed.
  const touched = spawnSync(
    'find',
    [appSupport, '-maxdepth', '1', '-newer', marker, '-exec', 'ls', '-ldT', '{}', ';'],
    {
      encoding: 'utf8',
    },
  ).stdout.trim()
  if (touched) fail(`something was written to ${appSupport}: ${touched}`)
  log(
    `closing the window ended the process (exit ${code}) and freed the port; nothing left running; user data is in the app's home; nothing written to ${appSupport}`,
  )
  log('OK')
} catch (error) {
  const text = (value) => (value === undefined ? '' : String(value).trim())
  console.error(`verify-desktop: FAILED at step "${current}": ${error.message}`)
  if (error.stdout || error.stderr)
    console.error(
      `--- the failing command's output ---\n${text(error.stdout)}\n${text(error.stderr)}`,
    )
  if (existsSync(electronLog))
    console.error(
      `--- Electron's own output (last 60 lines) ---\n${readFileSync(electronLog, 'utf8').split('\n').slice(-60).join('\n')}`,
    )
  console.error(
    `--- processes of this app ---\n${text(spawnSync('pgrep', ['-fl', scratch], { encoding: 'utf8' }).stdout)}`,
  )
  console.error(
    `--- new entries in ${appSupport} ---\n${text(spawnSync('find', [appSupport, '-maxdepth', '1', '-newer', marker], { encoding: 'utf8' }).stdout)}`,
  )
  process.exitCode = 1
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL')
  rmSync(scratch, { recursive: true, force: true })
}
