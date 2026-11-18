#!/usr/bin/env node
// Usage: node scripts/verify-build-and-check.mjs [--driver codex|claude|pi]   (default codex)   A manual gate: it runs a real coding agent, so it is not part of `pnpm run check`.
// In a fresh agent app with the panel, a real (headless) Chrome opens the page and the message is sent from the panel, the way a person sends it. The agent builds a Notes page as a
// plugin, installs it, and then checks its own work in the SAME run through the door: it opens /notes, types a note, saves it and looks. The gate reads what the door audited
// (.acryl/audit/ui-control.jsonl) and fails unless the agent looked at and used the page it had just built. Its output is the record of the run.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const driver =
  process.argv.indexOf('--driver') === -1
    ? 'codex'
    : process.argv[process.argv.indexOf('--driver') + 1]
const log = (message) => console.log(`verify-build-and-check: ${message}`)
const fail = (message) => {
  throw new Error(`verify-build-and-check: ${message}`)
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

const message =
  'Do it now, without asking for approval. Add a Notes page to this app at /notes: a heading "Notes", a text box labelled "Note", a Save button, and a list; saving adds the note to the list on the page ' +
  '(a small script in the page is fine). Build it as a plugin in plugins/notes and install it into the running app. Then check your own work the way a person would, in this same run: ' +
  'with the door (.acryl/bin/acryl, see AGENTS.md) go to /notes, type a note, press Save, look at the page and confirm the note is listed. Tell me what you saw.'

const scratch = mkdtempSync(join(tmpdir(), 'build-and-check-'))
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
  run(process.execPath, [cli, 'init', app, '--template', 'agent', '--bare', '-y'], scratch)
  run('npm', ['install', '--no-audit', '--no-fund'], app)
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
  if (!base) fail(`the app did not start:\n${output}`)
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
  await cdp.send('Page.navigate', { url: `${base}/` })
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
    `const s = document.querySelector('#agent-panel').shadowRoot; s.querySelector('button.open').click(); const t = s.querySelector('textarea'); t.value = ${JSON.stringify(message)}; const d = s.querySelector('select'); d.value = ${JSON.stringify(driver)}; if (d.value !== ${JSON.stringify(driver)}) throw new Error('the driver ${driver} is not offered'); s.querySelector('form').requestSubmit(); true`,
  )
  log(`sent from the panel to ${driver}`)
  const panelAudit = join(app, '.acryl', 'audit', 'agent-panel.jsonl')
  const ended = await until(
    async () => existsSync(panelAudit) && /"ask":"end"/u.test(readFileSync(panelAudit, 'utf8')),
    900_000,
    2000,
  )
  // The page was reloaded (by the door after the plugin, and by the agent's own navigation) while the run went on: the run must have survived, and the panel must show it again.
  await sleep(3000)
  const seconds = Math.round((Date.now() - started) / 1000)
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
  log(`the agent's last lines:\n${panelLog.trim().split('\n').slice(-12).join('\n')}`)
  if (!ended) fail('the run did not end within 15 minutes')
  if (!/"changed":true/u.test(readFileSync(panelAudit, 'utf8')))
    fail('the run did not install a plugin')
  if (!panelLog.includes('Do it now'))
    fail('the panel does not show the run again after the reloads (its question is missing)')
  const page = await fetch(`${base}/notes`)
  if (page.status !== 200) fail(`/notes answers ${page.status}`)
  const used = (name) => audit.some((entry) => entry.tool === name && entry.outcome === 'ok')
  if (!used('look')) fail('the agent never looked at a page')
  if (!used('act type')) fail('the agent never typed into the page it built')
  if (
    !audit.some(
      (entry) =>
        entry.tool === 'act click' &&
        entry.outcome === 'ok' &&
        /save/iu.test(entry.target?.name ?? ''),
    )
  )
    fail('the agent never pressed Save on the page it built')
  log(
    'OK: the agent built /notes, then looked at it, typed a note and pressed Save through the door, in one run',
  )
  cdp.close()
} finally {
  browser?.kill('SIGKILL')
  if (server) await stopGroup(server)
  await sleep(300)
  rmSync(scratch, { recursive: true, force: true })
}
