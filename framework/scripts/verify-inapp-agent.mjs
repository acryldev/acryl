#!/usr/bin/env node
// Usage: node scripts/verify-inapp-agent.mjs   A manual gate: it calls a real model (DeepSeek), so it is not part of `pnpm run check`.
// The app's OWN agent (the panel's built-in `agent` driver, not Codex or Claude) with a real model through the openai plugin: it must find the door's verbs among its tools (`door_look`,
// `door_act`) and use them on the open page. The DeepSeek key is read from the usual place into the server's environment only; it is never printed and never written into the app.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-inapp-agent: ${message}`)
const fail = (message) => {
  throw new Error(`verify-inapp-agent: ${message}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms, every = 500) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await fn().catch(() => undefined)
    if (value) return value
    await sleep(every)
  }
}
const chrome = findChrome()
if (!chrome) fail('no Chrome or Chromium on this machine (set CHROME_BIN)')

const keyFile = join(homedir(), '.secure-storage/llmproviders/deepseek/deepseek.json')
if (!existsSync(keyFile)) fail(`no DeepSeek key at ${keyFile}`)
const key = JSON.parse(readFileSync(keyFile, 'utf8')).deepseek_api_key
if (typeof key !== 'string' || key === '') fail('the DeepSeek key file has no deepseek_api_key')
const message =
  'Use your door tools. Look at the page that is open, press the button "Add one" twice (look again before each press, the refs change), then look once more and tell me the number shown after "Count:".'

const scratch = mkdtempSync(join(tmpdir(), 'inapp-agent-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
delete env.ACRYL_DOOR
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
}
let server
let browser
try {
  const app = join(scratch, 'app')
  run(process.execPath, [cli, 'init', app, '--template', 'agent', '-y'], scratch)
  mkdirSync(join(app, 'plugins', 'counter'))
  writeFileSync(
    join(app, 'plugins', 'counter', 'index.ts'),
    `import { Acryl } from 'acryl-router'
export const name = 'counter'
export const inject = ['router']
export function apply(ctx: { router: { route(path: string, app: unknown): void } }) {
  const app = new Acryl()
  app.get('/counter', (c) => c.html('<!doctype html><html><head><title>Counter</title></head><body><main><h1>Counter</h1><p id="n">Count: 0</p><button id="b" type="button">Add one</button></main><script>let n = 0; document.getElementById("b").onclick = () => { n += 1; document.getElementById("n").textContent = "Count: " + n }</script></body></html>'))
  ctx.router.route('/', app)
}
`,
  )
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  const port = await freePort()
  // The key goes into this process's environment and nowhere else.
  server = startGroup('npm', ['start'], {
    cwd: app,
    env: {
      ...env,
      PORT: String(port),
      ACRYLBLENDS_MODEL_URL: 'https://api.deepseek.com',
      ACRYLBLENDS_MODEL: 'deepseek-chat',
      ACRYLBLENDS_MODEL_KEY: key,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  const base = await until(async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1], 40_000)
  if (!base) fail(`the app did not start:\n${output.replaceAll(key, '***')}`)
  if (!/model: deepseek-chat at https:\/\/api\.deepseek\.com/u.test(output))
    fail(`the app did not pick the real model:\n${output.replaceAll(key, '***')}`)
  const devPort = await freePort()
  let cdp
  for (let attempt = 0; attempt < 2 && cdp === undefined; attempt++) {
    browser = spawn(chrome, chromeFlags(join(scratch, 'chrome'), devPort), { stdio: 'ignore' })
    cdp = await until(() => devtools(devPort), 30_000)
    if (cdp === undefined) browser.kill('SIGKILL')
  }
  if (!cdp) fail('headless Chrome did not open')
  const evaluate = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
      .result?.result?.value
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: `${base}/counter` })
  if (
    !(await until(
      () =>
        evaluate(
          "Boolean(document.querySelector('#agent-panel')?.shadowRoot?.querySelector('button.open'))",
        ),
      20_000,
    ))
  )
    fail('the panel did not appear')
  const started = Date.now()
  await evaluate(
    `const s = document.querySelector('#agent-panel').shadowRoot; s.querySelector('button.open').click(); const t = s.querySelector('textarea'); t.value = ${JSON.stringify(message)}; const d = s.querySelector('select'); d.value = 'agent'; if (d.value !== 'agent') throw new Error('the agent driver is not offered'); s.querySelector('form').requestSubmit(); true`,
  )
  log('sent from the panel to the in-app agent (a real model: deepseek-chat)')
  const panelAudit = join(app, '.acryl', 'audit', 'agent-panel.jsonl')
  const ended = await until(
    async () => existsSync(panelAudit) && /"ask":"end"/u.test(readFileSync(panelAudit, 'utf8')),
    240_000,
    1000,
  )
  const seconds = Math.round((Date.now() - started) / 1000)
  await sleep(1500)
  const panelLog =
    (await evaluate(
      "document.querySelector('#agent-panel')?.shadowRoot?.querySelector('#log')?.innerText ?? ''",
    )) ?? ''
  const audit = existsSync(join(app, '.acryl', 'audit', 'ui-control.jsonl'))
    ? readFileSync(join(app, '.acryl', 'audit', 'ui-control.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
  const tools = audit.map(
    (entry) =>
      `${entry.tool}${entry.target ? ` ${entry.target.role} "${entry.target.name}"` : ''}:${entry.outcome}`,
  )
  log(`the run ended after ${seconds} s (${ended ? 'the panel reported the end' : 'timed out'})`)
  log(`the door audit (${tools.length} calls): ${tools.join(' | ')}`)
  log(`the panel shows:\n${panelLog.trim().split('\n').slice(-10).join('\n')}`)
  if (!ended) fail('the run did not end in 4 minutes')
  const clicks = audit.filter(
    (entry) =>
      entry.tool === 'act click' &&
      entry.outcome === 'ok' &&
      /add one/iu.test(entry.target?.name ?? ''),
  ).length
  if (!audit.some((entry) => entry.tool === 'look' && entry.outcome === 'ok'))
    fail('the agent never looked at the page through the door')
  if (clicks < 2) fail(`the agent pressed "Add one" ${clicks} time(s); twice was asked`)
  if (!/\b2\b/u.test(panelLog.split('\n').slice(-6).join('\n')))
    fail('the agent did not report the number 2')
  log(
    'OK: the in-app agent, with a real model, found the door verbs among its tools, looked at the open page and pressed the button twice',
  )
  cdp.close()
} finally {
  browser?.kill('SIGKILL')
  if (server) await stopGroup(server)
  await sleep(300)
  rmSync(scratch, { recursive: true, force: true })
}
