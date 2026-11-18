#!/usr/bin/env node
// The gate of 1.0.4's door: an agent that builds a page can look at it and click through it in the same run.
//   node scripts/verify-door-reload.mjs [--npm <version>]
// With --npm the app is made by the PUBLISHED acrylblends of that version (npx), not by this checkout: the registry check of a release.
// In a fresh agent app, a plugin serves a page that has NO door script tag, a real (headless) Chrome opens it, and the folder's own command (`.acryl/bin/acryl`) is used as an agent
// uses it: `look` sees the page (the door adds its script to every HTML page in development); a change to the plugin followed by `plugin reload` shows the new page without anyone
// reloading it (the door reloads the open pages and answers once they are back); a change the plugin system does not know about is picked up by `act reload`; `act navigate --path`
// goes to another page of the app and refuses a path that would leave it. The door's script AND the agent panel's script reach every page an agent can build: a plugin installed
// while the app runs, one loaded at boot from plugins/, and one mounted as a row of blend.yaml ahead of both. Offline: no model, no key.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-door-reload: ${message}`)
const fail = (message) => {
  throw new Error(`verify-door-reload: ${message}`)
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
const chrome = findChrome()
if (!chrome) {
  log('skipped: no Chrome or Chromium on this machine (set CHROME_BIN)')
  process.exit(0)
}
const scratch = mkdtempSync(join(tmpdir(), 'door-reload-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
delete env.ACRYL_DOOR
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}

/** A plugin whose pages carry no door script: /p1 shows a version and the contents of page.txt (read on each request), /p2 is another page. */
const plugin = (version) => `import { readFileSync } from 'node:fs'
import { Acryl } from 'acryl-router'

export const name = 'pages'
export const inject = ['router']

export function apply(ctx: { router: { route(path: string, app: unknown): void } }) {
  const app = new Acryl()
  app.get('/p1', (c) => c.html('<!doctype html><html><head><title>One</title></head><body><main><h1>Version ${version}</h1><p>' + readFileSync('page.txt', 'utf8') + '</p><a href="/p2">Next page</a></main></body></html>'))
  app.get('/p2', (c) => c.html('<!doctype html><html><head><title>Two</title></head><body><main><h1>Second page</h1></main></body></html>'))
  ctx.router.route('/', app)
}
`

let server
let browser
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
  // A plugin that is a row of blend.yaml, mounted before the panel's and the door's rows: its pages come first in the order of mounts.
  mkdirSync(join(app, 'plugins', 'rowpage'))
  writeFileSync(
    join(app, 'plugins', 'rowpage', 'index.ts'),
    // A row is imported by src/app.ts before anything runs; it still imports the framework by name, as an agent writes it (acrylblends, acrylblends/body-limit).
    `import { Acryl } from 'acrylblends'
import { bodyLimit } from 'acrylblends/body-limit'
export const name = 'rowpage'
export const inject = ['router']
export function apply(ctx: { router: { route(path: string, app: unknown): void } }) {
  const app = new Acryl().use(bodyLimit({ maxSize: 16 * 1024 }))
  app.get('/r1', (c) => c.html('<!doctype html><html><head><title>Row</title></head><body><main><h1>A page of a row</h1></main></body></html>'))
  ctx.router.route('/', app)
}
`,
  )
  const manifest = join(app, 'blend.yaml')
  const rows = readFileSync(manifest, 'utf8')
  const withRow = rows.replace(
    '    - id: router\n',
    '    - id: rowpage\n      name: rowpage\n    - id: router\n',
  )
  if (withRow === rows) fail('the agent template has no router row where this gate puts its own')
  writeFileSync(manifest, withRow)
  const source = join(app, 'src', 'app.ts')
  const code = readFileSync(source, 'utf8')
  const withEntry = code
    .replace(
      'import * as router from',
      "import * as rowpage from '../plugins/rowpage/index.ts'\nimport * as router from",
    )
    .replace('export const registry = {\n', 'export const registry = {\n  rowpage,\n')
  if (!withEntry.includes('  rowpage,\n') || !withEntry.includes('import * as rowpage'))
    fail('the agent template no longer has the registry where this gate registers its own plugin')
  writeFileSync(source, withEntry)
  // A plugin that owns a state cell and changes it on POST /tick (section G follows it from a page whose connections are all held), and teaches the scripted model one command: "look here"
  // makes the app's own agent call the door's look, as an agent in the panel does (section H asks it from one of two tabs).
  mkdirSync(join(app, 'plugins', 'ticker'))
  writeFileSync(
    join(app, 'plugins', 'ticker', 'index.ts'),
    `import { Acryl } from 'acryl-router'

export const name = 'ticker'
export const inject = ['router', 'state', 'model', 'tools']

export function apply(ctx: { router: { route(path: string, app: unknown): void }; state: { cell(key: string, initial: number): { update(change: (n: number) => number): void } }; model: { teach?(rule: (input: { question: string; step: number }) => unknown): () => void }; tools: { register(name: string, tool: { description: string; parameters: object; run(input: unknown): Promise<string> }): () => void } }) {
  const count = ctx.state.cell('ticker.count', 0)
  ctx.router.route('/', new Acryl().post('/tick', (c) => { count.update((n) => n + 1); return c.json({ ok: true }) }))
  ctx.tools.register('slow', { description: 'takes three seconds', parameters: {}, run: async () => { await new Promise((resolve) => setTimeout(resolve, 3000)); return 'slept' } })
  ctx.model.teach?.(({ question, step }) => (step !== 0 ? undefined : question.trim() === 'look here' ? { tool: 'door_look', input: {} } : question.trim() === 'take your time' ? { tool: 'slow', input: {} } : undefined))
}
`,
  )
  mkdirSync(join(app, 'plugins', 'pages'))
  writeFileSync(join(app, 'plugins', 'pages', 'index.ts'), plugin('one'))
  writeFileSync(join(app, 'page.txt'), 'first text')

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
  const acryl = (...args) => {
    const r = spawnSync(
      join(app, '.acryl', 'bin', process.platform === 'win32' ? 'acryl.cmd' : 'acryl'),
      args,
      { cwd: app, env, encoding: 'utf8', shell: process.platform === 'win32' },
    )
    return { code: r.status, out: r.stdout, err: r.stderr }
  }
  // The pages of the plugin loaded at boot (pages) and of the row (rowpage) carry both scripts in the HTML the server sends, however early their plugin was mounted.
  for (const path of ['/p1', '/r1']) {
    const html = await (await fetch(`${base}${path}`)).text()
    for (const [what, marker] of [
      ['the door', '/api/acryl-door/page.js'],
      ['the agent panel', '/api/agent-panel/panel.js'],
    ])
      if (!html.includes(marker)) fail(`${path} was served without ${what}'s script:\n${html}`)
    if (html.split('/api/acryl-door/page.js').length !== 2)
      fail(`${path} carries the door's script more than once`)
  }
  log(
    "B: a page of a plugin loaded at boot and a page of a row mounted ahead of the door and the panel both carry the door's and the panel's scripts",
  )
  const added = acryl('plugin', 'add', 'plugins/pages')
  if (added.code !== 0) fail(`plugin add failed:\n${added.out}${added.err}`)

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
  await cdp.send('Page.navigate', { url: `${base}/p1` })

  // B: the page has no script tag, and the door can still look at it.
  const seen = await until(async () => {
    const r = acryl('look')
    return r.code === 0 && r.out.includes('Version one') ? r.out : undefined
  }, 20_000)
  if (!seen)
    fail(`look did not see the page (it carries no door script tag):\n${acryl('brief').out}`)
  if (!seen.includes('first text')) fail(`look lacks the page's text:\n${seen}`)
  log('B: look sees a page that carries no door script tag (the door added it)')

  // A, the plugin way: change the plugin, `plugin reload`; the open page is reloaded by the door and the verb answers when it is back.
  await evaluate('window.__before = true; true')
  writeFileSync(join(app, 'plugins', 'pages', 'index.ts'), plugin('two'))
  const reloaded = acryl('plugin', 'reload')
  if (reloaded.code !== 0) fail(`plugin reload failed:\n${reloaded.out}${reloaded.err}`)
  const afterPlugin = acryl('look')
  if (afterPlugin.code !== 0 || !afterPlugin.out.includes('Version two'))
    fail(`after plugin reload the page was not the new one:\n${afterPlugin.out}${afterPlugin.err}`)
  if ((await evaluate('window.__before')) !== undefined)
    fail('the page was not reloaded after the plugin change')
  log('A: plugin reload reloads the open page by itself, and look at once sees the new one')

  // A, the verb: a change the plugin system does not see (a file the page reads) needs `act reload`.
  writeFileSync(join(app, 'page.txt'), 'second text')
  const stale = acryl('look')
  if (!stale.out.includes('first text')) fail(`the page changed without a reload:\n${stale.out}`)
  const reload = acryl('act', 'reload')
  if (reload.code !== 0 || !reload.out.includes('the page is back'))
    fail(`act reload failed:\n${reload.out}${reload.err}`)
  const afterReload = acryl('look')
  if (!afterReload.out.includes('second text'))
    fail(`act reload did not bring the new text:\n${afterReload.out}`)
  log(
    'A: act reload brings a change the plugin system does not know about, and answers once the page is back',
  )

  // A, navigate: another page of the app by a link or by path, and a path that leaves the app is refused.
  const moved = acryl('act', 'navigate', '--path', '/p2')
  if (moved.code !== 0 || !moved.out.includes('the page is back'))
    fail(`act navigate failed:\n${moved.out}${moved.err}`)
  if (!acryl('look').out.includes('Second page')) fail('navigate did not reach /p2')
  const outside = acryl('act', 'navigate', '--path', '//evil.example')
  if (outside.code === 0 || !/invalid/u.test(outside.err))
    fail(`a path that leaves the app was not refused: ${outside.out}${outside.err}`)
  if (!acryl('look').out.includes('Second page')) fail('the refused navigate moved the page')
  log('A: act navigate --path goes to another page of the app, and refuses a path that leaves it')
  cdp.close()

  // A, a mistyped path: the window is not stranded. The app answers 404 with a page that carries the door's script, `navigate` names the status, and the agent looks, clicks the way
  // back and navigates on, all in the same window.
  const lost = acryl('act', 'navigate', '--path', '/nope')
  if (lost.code !== 0 || !lost.out.includes('404 at /nope'))
    fail(`act navigate to a missing path did not say 404:\n${lost.out}${lost.err}`)
  const lostLook = acryl('look')
  if (lostLook.code !== 0 || !lostLook.out.includes('404 Not Found'))
    fail(`the window cannot be looked at on a missing path:\n${lostLook.out}${lostLook.err}`)
  const back = /\[ref=([\d.]+)\]/u.exec(
    lostLook.out.split('\n').find((line) => line.includes('Back to the app')) ?? '',
  )?.[1]
  if (back === undefined) fail(`the 404 page has no way back in what look shows:\n${lostLook.out}`)
  const clicked = acryl('act', 'click', '--ref', back)
  if (clicked.code !== 0) fail(`clicking the way back failed:\n${clicked.out}${clicked.err}`)
  const home = await until(async () => {
    const seen = acryl('look')
    return seen.code === 0 && !seen.out.includes('404 Not Found') && seen.out
  }, 15_000)
  if (!home) fail('the way back did not lead to a page of the app')
  const again = acryl('act', 'navigate', '--path', '/p1')
  if (again.code !== 0 || !again.out.includes('200 at /p1'))
    fail(`act navigate back to /p1 did not say 200:\n${again.out}${again.err}`)
  if (!acryl('look').out.includes('Version')) fail('the window did not come back to /p1')
  log(
    'A: a mistyped path gives a 404 page the door can still drive, navigate names the 404, and the window comes back',
  )

  // C, two tabs of the app (the workshop's normal state: the panel's tab and a tab the agent navigates). The door drives one page, deterministically: the one it just sent
  // somewhere (it comes back as a new page), else the one in front. A look right after a navigate must answer within a few seconds, whichever tab the person last touched, and never wait the whole call timeout on a page in the background.
  const tabs = () => fetch(`http://127.0.0.1:${devPort}/json`).then((r) => r.json())
  const appTabs = async () =>
    (await tabs()).filter((t) => t.type === 'page' && t.url.startsWith(base))
  const first = (await appTabs())[0]
  if (first === undefined) fail('C: the first tab is gone')
  const secondTab = await fetch(`http://127.0.0.1:${devPort}/json/new?${base}/p2`, {
    method: 'PUT',
  }).then((r) => r.json())
  await until(async () => (await appTabs()).length === 2, 15_000)
  const timed = (...args) => {
    const started = Date.now()
    const answer = acryl(...args)
    return { ...answer, ms: Date.now() - started }
  }
  const activate = (tab) => fetch(`http://127.0.0.1:${devPort}/json/activate/${tab.id}`)
  for (const [front, back, path, heading] of [
    [first, secondTab, '/p2', 'Second page'],
    [secondTab, first, '/p1', 'Version'],
    [first, secondTab, '/p2', 'Second page'],
  ]) {
    await activate(front)
    await sleep(700)
    const moved = timed('act', 'navigate', '--path', path)
    if (moved.code !== 0)
      fail(`C: act navigate ${path} with two tabs failed:\n${moved.out}${moved.err}`)
    const seen = timed('look')
    if (seen.code !== 0 || !seen.out.includes(heading) || seen.ms > 2500)
      fail(
        `C: the look after navigating ${path} with two tabs took ${seen.ms} ms and ${seen.code === 0 ? 'read' : 'failed with'}:\n${seen.out}${seen.err}`,
      )
    void back
  }
  log(
    'C: with two tabs a look right after a navigate answers at once with the page that was navigated',
  )

  // D, the panel in a real browser: it sits beside the page (the page gets narrower and its fixed elements follow), it renders an answer as Markdown without ever making markup,
  // and it closes without leaving the page narrower.
  const panelCdp = await devtools(devPort)
  const panelPageId = async () => {
    const mark = `mark-${String(Date.now())}`
    await panelCdp.send('Runtime.evaluate', {
      expression: `document.title = ${JSON.stringify(mark)}; true`,
    })
    return (await tabs()).find((tab) => tab.title === mark)?.id
  }
  const inPage = async (expression) => {
    const answer = await panelCdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (answer.result?.exceptionDetails)
      fail(`D: the page threw: ${JSON.stringify(answer.result.exceptionDetails).slice(0, 500)}`)
    return answer.result?.result?.value
  }
  await panelCdp.send('Page.enable')
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () => (await inPage("!!document.getElementById('agent-panel')")) === true,
    20_000,
  )
  await inPage(
    "document.body.insertAdjacentHTML('beforeend', '<div id=pin style=\"position:fixed;top:0;right:0;width:40px;height:40px\">pin</div>'); true",
  )
  const before = await inPage(
    '({ width: document.documentElement.getBoundingClientRect().width, inner: innerWidth, pin: document.getElementById("pin").getBoundingClientRect().right })',
  )
  await inPage(
    "document.getElementById('agent-panel').shadowRoot.querySelector('button.open').click(); true",
  )
  const open = await inPage(
    '({ width: document.documentElement.getBoundingClientRect().width, inner: innerWidth, pin: document.getElementById("pin").getBoundingClientRect().right, panel: document.getElementById("agent-panel").shadowRoot.querySelector("section").getBoundingClientRect().left })',
  )
  if (!(open.width <= before.inner - 300))
    fail(
      `D: with the panel open the page is ${open.width} px wide in a ${open.inner} px window (it was ${before.width}); the panel covers it`,
    )
  if (!(open.panel >= open.width - 1))
    fail(
      `D: the page is ${open.width} px wide but the panel starts at ${open.panel} px: they overlap`,
    )
  await inPage(
    "document.getElementById('agent-panel').shadowRoot.querySelector('button.close').click(); true",
  )
  const closed = await inPage(
    '({ width: document.documentElement.getBoundingClientRect().width, inner: innerWidth, style: document.documentElement.getAttribute("style") })',
  )
  if (Math.abs(closed.width - before.width) > 1)
    fail(
      `D: closing the panel left the page ${closed.width} px wide (it was ${before.width}); style=${closed.style}`,
    )
  log(
    'D: the panel docks beside the page (the page gets narrower) and gives the width back when it closes',
  )
  const sample =
    '## Title\n\nSome **bold** and `code` and <img src=x onerror="window.__owned=1"> and [bad](javascript:window.__owned=2)\n\n- one\n- two'
  const markup = await inPage(`import('/api/agent-panel/client/markdown.ts').then((m) => {
    const box = document.createElement('div')
    box.append(m.renderMarkdown(${JSON.stringify(sample)}, document))
    document.body.append(box)
    return { html: box.innerHTML, images: box.querySelectorAll('img, script').length, owned: window.__owned ?? null, links: box.querySelectorAll('a').length }
  })`)
  if (markup.images !== 0 || markup.owned !== null || markup.links !== 0)
    fail(`D: the Markdown renderer made markup from an answer: ${JSON.stringify(markup)}`)
  if (
    !/<h4>Title<\/h4>/u.test(markup.html) ||
    !/<strong>bold<\/strong>/u.test(markup.html) ||
    !/<ul><li>one<\/li><li>two<\/li><\/ul>/u.test(markup.html)
  )
    fail(`D: the answer was not rendered as Markdown: ${markup.html}`)
  log(
    'D: an answer is rendered as Markdown, and an <img>, a script and a javascript: link in it stay text',
  )

  // E, a page that holds the browser's six connections per host (two windows that stream their own state do): the door's answers must still get through. The page channel runs over a
  // WebSocket, which is not one of the six; forced back to the event stream, the same page cannot be looked at, which is the failure this section exists to catch.
  // Only one page may be connected, or the door could answer from another one and show nothing.
  for (const tab of await appTabs())
    if (tab.id !== (await panelPageId()))
      await fetch(`http://127.0.0.1:${devPort}/json/close/${tab.id}`)
  await sleep(800)
  if ((await appTabs()).length !== 1)
    fail(`E: ${(await appTabs()).length} tabs of the app are open, expected one`)
  const hogs = `window.__hogs = Array.from({ length: 6 }, () => new EventSource('/api/state/extensions/events')); true`
  const saturated = () =>
    inPage(
      `Promise.race([fetch('/health').then(() => 'answered'), new Promise((r) => setTimeout(() => r('queued'), 2500))])`,
    )
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () => (await inPage("!!document.getElementById('agent-panel')")) === true,
    20_000,
  )
  if (!(await until(async () => acryl('look').code === 0, 20_000)))
    fail('E: the page is not connected to the door')
  await inPage(hogs)
  await sleep(1000)
  if ((await saturated()) !== 'queued')
    fail('E: six open streams did not saturate the page, so this section proves nothing')
  const throughSocket = timed('look')
  if (throughSocket.code !== 0 || throughSocket.ms > 2500 || !throughSocket.out.includes('Version'))
    fail(
      `E: with the page's six connections held, look took ${throughSocket.ms} ms and ${throughSocket.code === 0 ? 'read' : 'failed with'}:\n${throughSocket.out}${throughSocket.err}`,
    )
  log(
    'E: with six streams held open in the page, a look still answers at once (the page channel is a WebSocket)',
  )
  // The panel in the same page, six connections still held: a question to the agent is asked and answered over its own socket, and Stop is sent on it too.
  const panelLog = `(() => { const root = document.getElementById('agent-panel').shadowRoot; return Array.from(root.querySelectorAll('#log .msg')).map((el) => el.className + '|' + el.textContent) })()`
  await inPage(
    "(() => { const root = document.getElementById('agent-panel').shadowRoot; root.querySelector('button.open').click(); const box = root.querySelector('textarea'); box.value = 'add 2 3'; root.querySelector('form').requestSubmit(); return true })()",
  )
  const answered = await until(async () => {
    const lines = await inPage(panelLog)
    return (
      Array.isArray(lines) &&
      lines.some((entry) => entry.startsWith('msg md|') && entry.length > 'msg md|'.length) &&
      !lines.some((entry) => entry.startsWith('msg working|')) &&
      lines
    )
  }, 20_000)
  if (!answered)
    fail(
      `E: with six connections held, the panel's question was not answered: ${JSON.stringify(await inPage(panelLog))}`,
    )
  log(
    'E: with six streams held open in the page, the panel asks the agent and shows the answer (its run is a WebSocket too)',
  )
  // The same page kept to the event stream: its answers queue behind the six, and the door says so in seconds.
  // (A navigation is a request too: it would queue behind the six, so they are let go first.)
  await inPage('window.__hogs.forEach((source) => source.close()); true')
  await sleep(500)
  await inPage("localStorage.setItem('acryl-door-transport', 'stream'); true")
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () => (await inPage("!!document.getElementById('agent-panel')")) === true,
    20_000,
  )
  if (!(await until(async () => acryl('look').code === 0, 20_000)))
    fail('E: the page kept to the event stream is not connected to the door')
  await inPage(hogs)
  await sleep(1000)
  const throughStream = timed('look')
  if (throughStream.code === 0)
    fail(
      'E: kept to the event stream, a page with six connections held was looked at; the section no longer shows the failure it guards against',
    )
  if (throughStream.ms > 9000 || !/none responded|did not answer|timeout/u.test(throughStream.err))
    fail(
      `E: kept to the event stream, the look should fail within seconds saying no page answered; it took ${throughStream.ms} ms:\n${throughStream.out}${throughStream.err}`,
    )
  await inPage('window.__hogs.forEach((source) => source.close()); true')
  await sleep(500)
  const recovered = await until(async () => {
    const seen = acryl('look')
    return seen.code === 0 && seen.out.includes('Version')
  }, 20_000)
  if (!recovered) fail('E: the event stream fallback does not work once the connections are free')
  await inPage("localStorage.removeItem('acryl-door-transport'); true")
  log(
    'E: kept to the event stream, six held connections make a look fail in seconds with a named reason, and it works again once they are free',
  )

  // F, a message typed the moment the page loads: the panel is still asking the server for the latest run (over its socket) and the answer "there is none" is slow. The message must be
  // asked and answered, not dropped because the panel believed it was busy following a run that does not exist (this lost a message in CI on a slow runner).
  const slow = await panelCdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const Real = window.WebSocket
      window.WebSocket = new Proxy(Real, {
        construct(target, args) {
          const socket = new target(...args)
          if (String(args[0]).includes('/run/ws')) {
            // Frames and the close arrive late but in their order, as a slow network would deliver them.
            for (const name of ['onmessage', 'onclose']) {
              const own = Object.getOwnPropertyDescriptor(Real.prototype, name)
              Object.defineProperty(socket, name, { configurable: true, set(handler) { own.set.call(socket, (event) => setTimeout(() => handler.call(socket, event), 1500)) } })
            }
          }
          return socket
        },
      })
    })()`,
  })
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () =>
      (await inPage(
        "!!document.getElementById('agent-panel')?.shadowRoot?.querySelector('button.open')",
      )) === true,
    20_000,
  )
  await sleep(300)
  await inPage(
    "(() => { const root = document.getElementById('agent-panel').shadowRoot; root.querySelector('button.open').click(); const box = root.querySelector('textarea'); box.value = 'add 4 5'; root.querySelector('form').requestSubmit(); return true })()",
  )
  const typedEarly = await until(async () => {
    const lines = await inPage(panelLog)
    return (
      Array.isArray(lines) &&
      lines.some((entry) => entry.startsWith('msg md|') && entry.includes('9')) &&
      lines
    )
  }, 20_000)
  if (!typedEarly)
    fail(
      `F: a message typed while the panel looked for the latest run was dropped: ${JSON.stringify(await inPage(panelLog))}`,
    )
  await panelCdp.send('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: slow.result.identifier,
  })
  log('F: a message typed while the panel is still asking for the latest run is asked and answered')
  // G, state followed from a page whose six connections are all held: ticket 14. `watch` of /api/state/client.js carries every key over one WebSocket, so a seventh connection is not
  // needed; an EventSource per key would queue behind the six and the page would never see a change. The server changes the cell (POST /tick) and the page must show each value.
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () => (await inPage("!!document.getElementById('agent-panel')")) === true,
    20_000,
  )
  await inPage(
    `window.__ticks = []; import('/api/state/client.js').then((m) => { window.__stopTicks = m.watch('ticker.count', (value) => window.__ticks.push(value), (error) => window.__ticks.push('error: ' + error.message)); window.__watchLoaded = true }); true`,
  )
  if (!(await until(async () => (await inPage('window.__ticks.join(",")')) === '0', 10_000)))
    fail(
      `G: watch did not deliver the first value: ${await inPage('JSON.stringify(window.__ticks)')}`,
    )
  await inPage(hogs)
  await sleep(1000)
  if ((await saturated()) !== 'queued')
    fail('G: six open streams did not saturate the page, so this section proves nothing')
  for (let tick = 1; tick <= 3; tick += 1) {
    const posted = await fetch(`${base}/tick`, { method: 'POST', headers: { origin: base } })
    if (!posted.ok) fail(`G: POST /tick answered ${posted.status}`)
    const shown = await until(
      async () =>
        (await inPage('window.__ticks.join(",")')) ===
        ['0', '1', '2', '3'].slice(0, tick + 1).join(','),
      5_000,
      100,
    )
    if (!shown)
      fail(
        `G: with the page's six connections held, a change of ticker.count never reached watch (it saw ${await inPage('JSON.stringify(window.__ticks)')})`,
      )
  }
  await inPage('window.__stopTicks(); window.__hogs.forEach((source) => source.close()); true')
  log(
    'G: with six streams held open in the page, watch of a state key still shows every change (one WebSocket, not a seventh connection)',
  )
  // H, the page whose panel asked is the page the agent drives (found on macOS: a browser tab left open from an earlier block took the calls of a question asked in a window). Two tabs of
  // the app: the panel's, behind, and another in front that the agent navigated earlier (so the Host insists on it). A question asked in the panel's tab makes the app's agent look, and the
  // look must be of the panel's own page, not of the tab in front.
  const hOtherTab = await fetch(`http://127.0.0.1:${devPort}/json/new?${base}/p2`, {
    method: 'PUT',
  }).then((r) => r.json())
  await until(async () => (await appTabs()).length === 2, 15_000)
  await activate(hOtherTab)
  await sleep(700)
  const hMoved = timed('act', 'navigate', '--path', '/p2')
  if (hMoved.code !== 0) fail(`H: act navigate with two tabs failed:\n${hMoved.out}${hMoved.err}`)
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () =>
      (await inPage(
        "!!document.getElementById('agent-panel')?.shadowRoot?.querySelector('button.open')",
      )) === true,
    20_000,
  )
  await activate(hOtherTab)
  await sleep(700)
  const hOtherFirst = timed('look')
  if (hOtherFirst.code !== 0 || !hOtherFirst.out.includes('Second page'))
    fail(
      `H: the tab in front is not the page a plain look reads, so this section proves nothing:\n${hOtherFirst.out}${hOtherFirst.err}`,
    )
  await inPage(
    "(() => { const root = document.getElementById('agent-panel').shadowRoot; root.querySelector('button.open').click(); const box = root.querySelector('textarea'); box.value = 'look here'; root.querySelector('form').requestSubmit(); return true })()",
  )
  // The log still shows the earlier run the page found on load: read what follows this question.
  const afterQuestion = (lines) => lines.slice(lines.lastIndexOf('msg me|look here') + 1)
  const hReading = await until(async () => {
    const lines = await inPage(panelLog)
    return (
      Array.isArray(lines) &&
      lines.includes('msg me|look here') &&
      afterQuestion(lines).find(
        (entry) => entry.startsWith('msg md|') && entry.includes('The answer is'),
      )
    )
  }, 20_000)
  if (!hReading)
    fail(
      `H: the question asked in the panel was not answered: ${JSON.stringify(await inPage(panelLog))}`,
    )
  if (!hReading.includes('Version') || hReading.includes('Second page'))
    fail(
      `H: the agent's look from the panel's page read the other tab, not the page that asked: ${hReading.slice(0, 300)}`,
    )
  await fetch(`http://127.0.0.1:${devPort}/json/close/${hOtherTab.id}`)
  log("H: with another tab in front, the agent asked from a page's panel looks at that page")
  // I, the "Agent is driving" bar stays up for the whole of a run asked for from this page's panel, between the calls too, with a Stop that ends the run. The app's agent is taught a
  // tool that takes three seconds and makes no door call: the bar must be there all that time, and gone when the run ends.
  const bar = () =>
    inPage(
      "(() => { const el = document.querySelector('.acrylDoorBar'); return el === null ? null : el.textContent })()",
    )
  const ask = (text) =>
    inPage(
      `(() => { const root = document.getElementById('agent-panel').shadowRoot; const box = root.querySelector('textarea'); box.value = ${JSON.stringify(text)}; root.querySelector('form').requestSubmit(); return true })()`,
    )
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () =>
      (await inPage(
        "!!document.getElementById('agent-panel')?.shadowRoot?.querySelector('button.open')",
      )) === true,
    20_000,
  )
  await inPage(
    "document.getElementById('agent-panel').shadowRoot.querySelector('button.open').click(); true",
  )
  if ((await bar()) !== null) fail('I: the bar is up with no run going')
  await ask('take your time')
  if (!(await until(async () => (await bar()) !== null, 5_000, 50)))
    fail('I: the bar did not come up when the run started')
  const seenWhile = []
  const started = Date.now()
  while (Date.now() - started < 2000) {
    seenWhile.push(await bar())
    await sleep(250)
  }
  if (seenWhile.some((text) => text === null || !text.includes('Agent is driving')))
    fail(
      `I: the bar was not up for the whole of a run with no call in flight: ${JSON.stringify(seenWhile)}`,
    )
  if (!(await until(async () => (await bar()) === null, 10_000)))
    fail(`I: the bar is still up after the run ended: ${await bar()}`)
  // Stop on the bar ends a run that is going.
  await ask('take your time')
  await until(async () => (await bar()) !== null, 5_000)
  await inPage("document.querySelector('.acrylDoorBar button').click(); true")
  const cancelled = await until(async () => {
    const lines = await inPage(panelLog)
    return Array.isArray(lines) && lines.some((entry) => entry.includes('The run was cancelled'))
  }, 15_000)
  if (!cancelled)
    fail(`I: Stop on the bar did not end the run: ${JSON.stringify(await inPage(panelLog))}`)
  if (!((await bar()) ?? '').includes('Agent stopped'))
    fail(`I: after Stop the bar does not say the agent stopped: ${await bar()}`)
  await inPage("document.querySelector('.acrylDoorBar button').click(); true")
  if ((await bar()) !== null) fail('I: Allow again did not take the bar down')
  log(
    'I: the Agent is driving bar stays up for the whole of a run, between the calls, and its Stop ends the run',
  )

  // J, the appearance chosen in one window reaches the others at once (the storage event), and the page's colours follow it.
  const homeTab = await fetch(`http://127.0.0.1:${devPort}/json/new?${base}/`, {
    method: 'PUT',
  }).then((r) => r.json())
  const homeCdp = await devtools(devPort, homeTab)
  const inHome = async (expression) =>
    (await homeCdp.send('Runtime.evaluate', { expression, returnByValue: true })).result?.result
      ?.value
  await until(async () => (await inHome('document.readyState')) === 'complete', 15_000)
  const look = () =>
    inHome(
      'JSON.stringify({ theme: document.documentElement.dataset.theme ?? null, background: getComputedStyle(document.documentElement).backgroundColor })',
    )
  for (const [value, theme, background] of [
    ['dark', 'dark', 'rgb(17, 24, 39)'],
    ['light', 'light', 'rgb(255, 255, 255)'],
    [null, null, undefined],
  ]) {
    await inPage(
      value === null
        ? "localStorage.removeItem('theme'); true"
        : `localStorage.setItem('theme', '${value}'); true`,
    )
    const reached = await until(async () => JSON.parse(await look()).theme === theme, 5_000, 100)
    if (!reached)
      fail(
        `J: the appearance set to ${value} in one window did not reach the other: ${await look()}`,
      )
    if (background !== undefined && JSON.parse(await look()).background !== background)
      fail(`J: the page's colours did not follow the appearance ${value}: ${await look()}`)
  }
  homeCdp.close()
  await fetch(`http://127.0.0.1:${devPort}/json/close/${homeTab.id}`)
  log(
    'J: the appearance chosen in one window reaches an open page of another at once, with its colours',
  )
  // K, the app restarts while a page stays open (`node --watch` does it at every change of a file, so a page left open while the attendee edits meets it all the time): the panel's token
  // belongs to one start of the app, the door's channel and the state socket must reconnect by themselves. The same document, never reloaded, must still ask the agent (the panel
  // fetches a new session and tries once more, unseen), be looked at through the door, and keep following a state key.
  await panelCdp.send('Page.navigate', { url: `${base}/p1` })
  await until(
    async () =>
      (await inPage(
        "!!document.getElementById('agent-panel')?.shadowRoot?.querySelector('button.open')",
      )) === true,
    20_000,
  )
  await inPage(
    `window.__sameDocument = true; window.__restartTicks = []; import('/api/state/client.js').then((m) => m.watch('ticker.count', (value) => window.__restartTicks.push(value))); document.getElementById('agent-panel').shadowRoot.querySelector('button.open').click(); true`,
  )
  // The key has counted the ticks of section G already: it is followed from there.
  if (!(await until(async () => (await inPage('window.__restartTicks.length')) >= 1, 5_000, 100)))
    fail('K: before the restart, the page was not given the state key')
  const counted = await inPage('window.__restartTicks.at(-1)')
  for (const wanted of [counted + 1, counted + 2]) {
    await fetch(`${base}/tick`, { method: 'POST', headers: { origin: base } })
    if (
      !(await until(
        async () => (await inPage('window.__restartTicks.at(-1)')) === wanted,
        5_000,
        100,
      ))
    )
      fail(
        `K: before the restart, the state key did not reach the page: ${await inPage('JSON.stringify(window.__restartTicks)')}`,
      )
  }
  // A run going when the app stops ends with it: the panel says so instead of just going quiet.
  await ask('take your time')
  if (
    !(await until(
      async () => (await inPage(panelLog)).some((entry) => entry.startsWith('msg working|')),
      10_000,
      100,
    ))
  )
    fail(
      `K: the slow run did not start before the restart: ${JSON.stringify(await inPage(panelLog))}`,
    )
  await stopGroup(server)
  if (
    !(await until(
      async () =>
        (
          await inPage(panelLog)
        ).some((entry) => entry.startsWith('msg err|The app stopped while the agent was working')),
      10_000,
      100,
    ))
  )
    fail(
      `K: a run cut short by the restart was not reported in the panel: ${JSON.stringify(await inPage(panelLog))}`,
    )
  output = ''
  server = startGroup('npm', ['start'], {
    cwd: app,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  if (!(await until(async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1] === base, 40_000)))
    fail(`K: the app did not start again on ${base}:\n${output}`)
  if (!(await until(async () => acryl('look').code === 0, 30_000)))
    fail('K: the open page did not reconnect to the door after the app restarted')
  await ask('add 2 3')
  const afterRestart = await until(async () => {
    const lines = await inPage(panelLog)
    return (
      Array.isArray(lines) &&
      lines.includes('msg me|add 2 3') &&
      lines
        .slice(lines.lastIndexOf('msg me|add 2 3') + 1)
        .find((entry) => entry.startsWith('msg md|') && entry.includes('The answer is 5'))
    )
  }, 20_000)
  if (!afterRestart)
    fail(
      `K: after the app restarted, a question asked in the same page was not answered: ${JSON.stringify(await inPage(panelLog))}`,
    )
  if (!(await until(async () => (await inPage('window.__restartTicks.at(-1)')) === 0, 20_000)))
    fail(
      `K: the state key was not followed again after the restart: ${await inPage('JSON.stringify(window.__restartTicks)')}`,
    )
  await fetch(`${base}/tick`, { method: 'POST', headers: { origin: base } })
  if (!(await until(async () => (await inPage('window.__restartTicks.at(-1)')) === 1, 10_000, 100)))
    fail(
      `K: a change after the restart did not reach the page: ${await inPage('JSON.stringify(window.__restartTicks)')}`,
    )
  if ((await inPage('window.__sameDocument')) !== true)
    fail('K: the page was reloaded, so this section proves nothing')
  log(
    'K: after the app restarted, the page that stayed open asks the agent, is looked at through the door and follows state again, with no reload',
  )
  panelCdp.close()
  log('OK')
} finally {
  browser?.kill('SIGKILL')
  if (server) await stopGroup(server)
  await sleep(300)
  rmSync(scratch, { recursive: true, force: true })
}
