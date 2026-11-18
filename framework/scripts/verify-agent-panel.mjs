#!/usr/bin/env node
// Usage: node scripts/verify-agent-panel.mjs [--driver claude|codex|pi|acp:dsh]   (default: the app's own scripted agent)
// The gate of spec 049 slice 14: in a fresh agent app with the panel added, a real (headless) Chrome opens the page, the message "create route hello /hello Hello" is sent from the
// panel, the agent builds the feature, the page reloads, and /hello answers Hello, in the same process (no restart). Uses the app's offline scripted agent: no key, no network.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-agent-panel: ${message}`)
const fail = (message) => {
  throw new Error(`verify-agent-panel: ${message}`)
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

const driverArg =
  process.argv.indexOf('--driver') === -1
    ? 'agent'
    : process.argv[process.argv.indexOf('--driver') + 1]
const message =
  driverArg === 'agent'
    ? 'create route hello /hello Hello'
    : 'Add a plugin plugins/hello that serves GET /hello answering the JSON {"text":"Hello"} (look at plugins/builder or docs/framework for how a plugin mounts a route), and install it into the running app through the door: .acryl/bin/acryl plugin add plugins/hello. Do not restart or stop the app.'

const chrome = findChrome()
if (!chrome) {
  log('skipped: no Chrome or Chromium on this machine (set CHROME_BIN)')
  process.exit(0)
}
const scratch = mkdtempSync(join(tmpdir(), 'agent-panel-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
delete env.ACRYL_DOOR
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
// acp:dsh is DeepSeek Harness through the ACP driver (driver-acp, with dsh on the PATH). The app and the agent get a home of this run (HOME and DSH_HOME), so
// nothing they write lands in the real home.
const acp = driverArg.startsWith('acp:')
// pi and dsh are driven with DeepSeek: the key is read from the usual place into the app's environment, as the product test does, and never printed.
const serverEnv = { ...env }
if (acp) {
  serverEnv.HOME = join(scratch, 'home')
  serverEnv.DSH_HOME = join(serverEnv.HOME, '.dsh')
  mkdirSync(serverEnv.DSH_HOME, { recursive: true })
}
if (driverArg === 'pi' || driverArg === 'acp:dsh') {
  const keyFile = join(homedir(), '.secure-storage/llmproviders/deepseek/deepseek.json')
  if (!existsSync(keyFile)) fail(`no DeepSeek key at ${keyFile}`)
  serverEnv.DEEPSEEK_API_KEY = JSON.parse(readFileSync(keyFile, 'utf8')).deepseek_api_key
}
let server
let browser
try {
  const app = join(scratch, 'app')
  run(process.execPath, [cli, 'init', app, '--template', 'agent', '--bare', '-y'], scratch)
  // `add` mounts the panel (and driver-acp) itself: the rows in blend.yaml and the entries in the registry of src/app.ts.
  if (acp) run(process.execPath, [cli, 'add', 'driver-acp'], app)
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  run('npm', ['run', 'check'], app)
  log('the panel is added to a fresh agent app, which type-checks')

  const port = await freePort()
  server = startGroup('npm', ['start'], {
    cwd: app,
    env: { ...serverEnv, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  const base = await until(async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1], 40_000)
  if (!base) fail(`the app did not start on port ${port}:\n${output}`)
  const pid = server.pid
  if ((await fetch(`${base}/hello`)).status !== 404) fail('/hello exists before the agent built it')

  const devPort = 20000 + Math.floor(Math.random() * 20000)
  const profile = join(scratch, 'chrome')
  // A cold headless Chrome on a busy runner can be slow or fail to start once: try twice, 30 s each.
  let cdp
  for (let attempt = 0; attempt < 2 && cdp === undefined; attempt++) {
    browser = spawn(chrome, chromeFlags(profile, devPort), { stdio: 'ignore' })
    cdp = await until(() => devtools(devPort), 30_000)
    if (cdp === undefined) browser.kill('SIGKILL')
  }
  if (!cdp) fail('headless Chrome did not open')
  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.result?.exceptionDetails)
      fail(
        `in the page: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`,
      )
    return r.result?.result?.value
  }
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: `${base}/` })
  const panelUp = await until(
    () =>
      evaluate(
        "Boolean(document.querySelector('#agent-panel')?.shadowRoot?.querySelector('button.open'))",
      ),
    20_000,
  )
  if (!panelUp) fail('the panel did not appear on the page')
  log("the panel appears on the app's page (a button in a shadow root)")

  // Open it, write the message, send it, the way a person does.
  await evaluate(
    `window.__before = true; const s = document.querySelector('#agent-panel').shadowRoot; s.querySelector('button.open').click(); const t = s.querySelector('textarea'); t.value = ${JSON.stringify(message)}; const d = s.querySelector('select'); d.value = ${JSON.stringify(driverArg)}; if (d.value !== ${JSON.stringify(driverArg)}) throw new Error('the driver ${driverArg} is not offered'); s.querySelector('form').requestSubmit(); true`,
  )
  const built = await until(
    async () => (await fetch(`${base}/hello`)).status === 200,
    driverArg === 'agent' ? 20_000 : 600_000,
    1000,
  )
  if (!built)
    fail(
      `the agent did not build /hello from the panel:\n${await evaluate("document.querySelector('#agent-panel').shadowRoot.querySelector('#log').innerText")}`,
    )
  const body = await (await fetch(`${base}/hello`)).json()
  if (body.text !== 'Hello') fail(`/hello answered ${JSON.stringify(body)}`)
  log('from the panel, the agent built /hello, and the running app serves it')

  const reloaded = await until(
    async () =>
      (await evaluate('window.__before')) === undefined &&
      (await evaluate("Boolean(document.querySelector('#agent-panel')?.shadowRoot)")),
    // The page reloads when the run ends, which for a coding agent is minutes after its feature first answers.
    driverArg === 'agent' ? 20_000 : 600_000,
    1000,
  )
  if (!reloaded)
    fail(
      `the page did not reload after the plugin was installed. The panel's log:\n${await evaluate("document.querySelector('#agent-panel')?.shadowRoot?.querySelector('#log')?.innerText")}\n${readFileSync(join(app, '.acryl', 'audit', 'agent-panel.jsonl'), 'utf8')}`,
    )
  log('the page reloaded by itself and shows the panel again')
  if (server.pid !== pid || server.exitCode !== null) fail('the app was restarted')
  const list = spawnSync(join(app, '.acryl', 'bin', 'acryl'), ['plugin', 'list', '--json'], {
    cwd: app,
    env,
    encoding: 'utf8',
  })
  if (!JSON.parse(list.stdout).some((p) => p.name === 'hello' && p.state === 'active'))
    fail(`hello is not an active plugin: ${list.stdout}`)
  const audit = readFileSync(join(app, '.acryl', 'audit', 'agent-panel.jsonl'), 'utf8')
  if (!new RegExp(`"ask":"end","driver":"${driverArg}","changed":true`, 'u').test(audit))
    fail(`the audit log does not show the run: ${audit}`)
  log(
    'same process (no restart), hello is an active plugin, the run is in .acryl/audit/agent-panel.jsonl',
  )
  cdp.close()
  log('OK')
} finally {
  browser?.kill('SIGKILL')
  if (server) await stopGroup(server)
  await sleep(500)
  rmSync(scratch, { recursive: true, force: true })
}
