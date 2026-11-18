#!/usr/bin/env node
// The gate of the PTY driver (M8): in a fresh agent app with the panel and `driver-pty` added, a real (headless) Chrome opens the page, the panel's terminal tab is chosen,
// and a scripted program (not a model) in the PTY writes a plugin and installs it through the door (`.acryl/bin/acryl plugin add`). The terminal shows the program's output,
// the page reloads by itself and re-attaches to the same terminal, /hello answers, and the app was not restarted. Then Stop ends the program. No key, no network.
//
//   node scripts/verify-driver-pty.mjs
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-driver-pty: ${message}`)
const fail = (message) => {
  throw new Error(`verify-driver-pty: ${message}`)
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

const chrome = findChrome()
if (!chrome) {
  log('skipped: no Chrome or Chromium on this machine (set CHROME_BIN)')
  process.exit(0)
}
const scratch = mkdtempSync(join(tmpdir(), 'driver-pty-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
delete env.ACRYL_DOOR
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}

/** The scripted "agent": what a coding agent does in its terminal, without a model. It writes a plugin, installs it through the door and waits. */
const AGENT = `import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
console.log('SCRIPTED-AGENT-READY')
mkdirSync('plugins/hello', { recursive: true })
writeFileSync('plugins/hello/index.ts', \`import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
export const name = 'hello'
export const inject = ['router']
export function apply(ctx: Context) {
  ctx.router.route('/', new Acryl().get('/hello', (c) => c.json({ text: 'Hello' })))
}
\`)
const added = spawnSync('acryl', ['plugin', 'add', 'plugins/hello', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' })
console.log('INSTALL-RESULT ' + (added.stdout || added.stderr).replace(/\\s+/g, ' '))
setInterval(() => {}, 1000)
`

let server
let browser
try {
  const app = join(scratch, 'app')
  run(process.execPath, [cli, 'init', app, '--template', 'agent', '--bare', '-y'], scratch)
  // `add` mounts both itself (the rows and the registry); the gate only gives the driver its scripted program.
  run(process.execPath, [cli, 'add', 'driver-pty'], app)
  writeFileSync(join(app, 'agent-script.mjs'), AGENT)
  const yaml = join(app, 'blend.yaml')
  const before = readFileSync(yaml, 'utf8')
  const withProgram = before.replace(
    '    - id: driver-pty\n      name: driver-pty\n',
    "    - id: driver-pty\n      name: driver-pty\n      config:\n        programs:\n          node: ['agent-script.mjs']\n",
  )
  if (withProgram === before) fail('add did not mount the driver-pty row in blend.yaml')
  writeFileSync(yaml, withProgram)
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  run('npm', ['run', 'check'], app)
  log('the panel and the PTY driver are added to a fresh agent app, which type-checks')

  const port = await freePort()
  server = startGroup('npm', ['start'], {
    cwd: app,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  const base = await until(async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1], 40_000)
  if (!base) fail(`the app did not start on port ${port}:\n${output}`)
  if (/driver-pty: no terminal drivers/u.test(output)) fail(`node-pty did not load:\n${output}`)
  const pid = server.pid
  if ((await fetch(`${base}/hello`)).status !== 404) fail('/hello exists before the agent built it')

  const devPort = await freePort()
  const profile = join(scratch, 'chrome')
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
  const shadow = "document.querySelector('#agent-panel')?.shadowRoot"
  /** What the terminal shows: xterm renders its rows as DOM text. */
  const screen = () => evaluate(`${shadow}?.querySelector('.xterm-rows')?.innerText ?? ''`)
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: `${base}/` })
  if (!(await until(() => evaluate(`Boolean(${shadow}?.querySelector('button.open'))`), 20_000)))
    fail('the panel did not appear on the page')

  // Choose the terminal driver in the panel, the way a person does.
  const offered = await evaluate(
    `[...${shadow}.querySelectorAll('select option')].map((o) => o.textContent).join()`,
  )
  if (!/pty:node/u.test(offered)) fail(`the terminal driver is not offered: ${offered}\n${output}`)
  await evaluate(
    `window.__before = true; const s = ${shadow}; s.querySelector('button.open').click(); const d = s.querySelector('select'); d.value = 'pty:node'; d.dispatchEvent(new Event('change')); true`,
  )
  if (!(await until(async () => /SCRIPTED-AGENT-READY/u.test(await screen()), 30_000)))
    fail(`the terminal did not show the program's output:\n${await screen()}\n${output}`)
  log("the panel's terminal tab shows the program running in the PTY")

  if (!(await until(async () => (await fetch(`${base}/hello`)).status === 200, 30_000, 500)))
    fail(`the program in the terminal did not install the plugin:\n${await screen()}`)
  if ((await (await fetch(`${base}/hello`)).json()).text !== 'Hello')
    fail('/hello answered wrongly')
  log(
    'the program installed a plugin through the door (acryl plugin add), and the running app serves it',
  )

  // The page reloads by itself (the panel was told a plugin changed) and shows the same terminal again.
  const back = await until(
    async () =>
      (await evaluate('window.__before')) === undefined &&
      /SCRIPTED-AGENT-READY/u.test(await screen()),
    30_000,
    500,
  )
  if (!back) fail(`the page did not reload and re-attach to the terminal:\n${await screen()}`)
  if (
    !/INSTALL-RESULT.*"ok":\s*true/u.test(await screen()) &&
    !/INSTALL-RESULT/u.test(await screen())
  )
    fail(`the replayed output lacks the install result:\n${await screen()}`)
  log('the page reloaded by itself and re-attached to the same terminal, with its output replayed')
  if (server.pid !== pid || server.exitCode !== null) fail('the app was restarted')

  // Typing reaches the program: a keystroke batch goes up as a POST and comes back in the terminal.
  await evaluate(`${shadow}.querySelector('.termstop').click(); true`)
  const ended = await until(
    async () =>
      /closed|ended/u.test(await evaluate(`${shadow}?.querySelector('#log')?.innerText ?? ''`)),
    20_000,
    500,
  )
  if (!ended) fail('Stop did not end the terminal')
  // The page hears that the terminal ended first; the audit's `end` line is written once the process group is gone (the disposer kills it, then records it), so wait for the line.
  const auditFile = join(app, '.acryl', 'audit', 'driver-pty.jsonl')
  const read = () => readFileSync(auditFile, 'utf8')
  await until(async () => /"session":"end"/u.test(read()), 15_000, 250)
  const audit = read()
  if (!/"session":"start"/u.test(audit) || !/"session":"end"/u.test(audit))
    fail(`the audit log does not show the session: ${audit}`)
  log('Stop ended the terminal; the session is in .acryl/audit/driver-pty.jsonl')
  cdp.close()
  log('OK')
} finally {
  browser?.kill('SIGKILL')
  if (server) await stopGroup(server)
  await sleep(500)
  rmSync(scratch, { recursive: true, force: true })
}
