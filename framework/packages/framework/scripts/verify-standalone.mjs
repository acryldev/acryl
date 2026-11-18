#!/usr/bin/env node
/**
 * The framework as a stranger gets it: pack this package, install the tarball in an empty folder under the public name (`acrylblends`), and
 * require that the four-line getting-started app serves its route on Node (through `serve` from `acrylblends/node-server`), and that a
 * consumer with only Node's types and no DOM library typechecks, including a module augmentation of the root and a server-side JSX page;
 * the DOM renderer (`acrylblends/jsx/dom*`, for the browser) typechecks with the DOM library, as a browser project uses it. Node is the runtime the
 * framework targets, and a `.tsx` app runs on it through `acrylblends/node-server/register` with the app's own typescript. Bun (`bun run`, the default export) is informational: it runs only when bun is installed, and a failure there is
 * reported without failing the check. This script never installs a runtime.
 *
 *   node scripts/verify-standalone.mjs [--keep]
 *
 * Runs offline: the tarball has no dependencies, and the typecheck uses this workspace's TypeScript and Node types. The folder is a fresh
 * temporary directory, removed afterwards unless `--keep`.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const folder = mkdtempSync(join(tmpdir(), 'acrylblends-standalone-'))
const app = join(folder, 'app')
mkdirSync(app)
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 })
const results = []
const report = (name, outcome) => { results.push([name, outcome]); console.log(`verify-standalone: ${name}: ${outcome}`) }

/** A free loopback port, so no run here takes a port someone else uses. */
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => { resolve(port) }) })
  probe.on('error', reject)
})

/** Start a server process, wait for `GET /` on `port` to answer, run `use` with that first answer, and always stop the process. */
async function withServer(command, args, port, env, use) {
  const child = spawn(command, args, { cwd: app, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  try {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`${command} exited (${String(child.exitCode)}): ${output}`)
      let first
      try {
        const response = await fetch(`http://127.0.0.1:${String(port)}/`)
        first = { status: response.status, body: await response.text() }
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }
      return await use(first)
    }
    throw new Error(`${command} never answered on port ${String(port)}: ${output}`)
  } finally {
    child.kill('SIGTERM')
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) })
  }
}

/** Start a server process, wait for `GET /` on `port` to answer, and return the body; the process is always stopped. */
const serveAndFetch = (command, args, port, env = {}) => withServer(command, args, port, env, first => first)

/** Google Chrome or Chromium, for the check of client components in a real browser: `CHROME_PATH`, else the usual install places. */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find(candidate => candidate !== undefined && candidate !== '' && spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 30_000 }).status === 0)
}

/** The page's DOM after its scripts ran, from headless Chrome with a fresh profile of its own (never the user's). */
function chromeDom(chrome, url) {
  const profile = mkdtempSync(join(tmpdir(), 'acrylblends-chrome-'))
  try {
    const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--virtual-time-budget=10000', '--dump-dom', url]
    // Ubuntu 24.04 blocks the unprivileged user namespaces Chrome's sandbox needs; this loads only the local test page.
    if (process.platform === 'linux') args.unshift('--no-sandbox')
    return execFileSync(chrome, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 })
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
}

const expectHello = (name, answer) => {
  if (answer.status !== 200 || answer.body !== 'Acryl!') throw new Error(`${name} answered ${String(answer.status)} ${JSON.stringify(answer.body)}`)
  report(name, 'GET / -> 200 "Acryl!"')
}

const installed = command => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0

try {
  const packed = run('corepack', ['pnpm', 'pack', '--pack-destination', folder], root).trim().split('\n').pop()
  const tarball = readdirSync(folder).find(name => name.endsWith('.tgz'))
  if (tarball === undefined) throw new Error(`no tarball packed: ${packed}`)
  writeFileSync(join(app, 'package.json'), `${JSON.stringify({ name: 'hello-acryl', private: true, type: 'module', dependencies: { acrylblends: `file:../${tarball}` } }, null, 2)}\n`)
  run('npm', ['install', '--offline', '--no-audit', '--no-fund'], app)

  // The getting-started app, exactly as the docs show it.
  writeFileSync(join(app, 'index.ts'), [
    "import { Acryl } from 'acrylblends'",
    'const app = new Acryl()',
    "app.get('/', (c) => c.text('Acryl!'))",
    'export default app',
    '',
  ].join('\n'))

  // Node: the same app served by the Node adapter.
  writeFileSync(join(app, 'node.ts'), [
    "import { serve } from 'acrylblends/node-server'",
    "import app from './index.ts'",
    'serve({ fetch: app.fetch, port: Number(process.env.PORT), hostname: \'127.0.0.1\' })',
    '',
  ].join('\n'))
  const nodePort = await freePort()
  expectHello('node (serve from acrylblends/node-server)', await serveAndFetch(process.execPath, ['node.ts'], nodePort, { PORT: String(nodePort) }))

  // A .tsx app on Node: the register hook compiles it with the app's own typescript (a devDependency in every template; linked here), and
  // the default import source, acrylblends/jsx, renders it.
  symlinkSync(realpathSync(join(root, 'node_modules', 'typescript')), join(app, 'node_modules', 'typescript'), 'junction')
  writeFileSync(join(app, 'server.tsx'), [
    "import { Acryl } from 'acrylblends'",
    "import { serve } from 'acrylblends/node-server'",
    'const Title = ({ text }: { text: string }) => <h1>{text}</h1>',
    "const app = new Acryl().get('/', (c) => c.html(<Title text=\"Acryl!\" />))",
    "serve({ fetch: app.fetch, port: Number(process.env.PORT), hostname: '127.0.0.1' })",
    '',
  ].join('\n'))
  const tsxPort = await freePort()
  const tsx = await serveAndFetch(process.execPath, ['--import', 'acrylblends/node-server/register', 'server.tsx'], tsxPort, { PORT: String(tsxPort) })
  if (tsx.status !== 200 || tsx.body !== '<h1>Acryl!</h1>') throw new Error(`the .tsx app answered ${String(tsx.status)} ${JSON.stringify(tsx.body)}`)
  report('node (a .tsx app through acrylblends/node-server/register)', 'GET / -> 200 "<h1>Acryl!</h1>"')

  // Server-side JSX: the string renderer renders on Node, from the published build.
  const rendered = run(process.execPath, ['--input-type=module', '-e', "import { jsx } from 'acrylblends/jsx'; process.stdout.write(String(jsx('h1', { class: 'title' }, 'Acryl!')))"], app)
  if (rendered !== '<h1 class="title">Acryl!</h1>') throw new Error(`acrylblends/jsx rendered ${JSON.stringify(rendered)}`)
  report('node (server JSX from acrylblends/jsx)', 'renders <h1 class="title">Acryl!</h1>')

  // The plain entries load without Cordis (an optional peer dependency: not installed here).
  for (const plain of ['acrylblends', 'acrylblends/node-server', 'acrylblends/db', 'acrylblends/db/sqlite', 'acrylblends/kv', 'acrylblends/kv/json', 'acrylblends/streaming', 'acrylblends/body-limit']) {
    const loaded = run(process.execPath, ['--input-type=module', '-e', `await import('${plain}'); process.stdout.write('ok')`], app)
    if (loaded !== 'ok') throw new Error(`${plain} did not load without Cordis installed`)
  }
  // The Cordis forms need their peers. One copy of Acryl: the class a plain app creates is the class the Cordis router serves.
  for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/schemastery']) {
    mkdirSync(join(app, 'node_modules', '@deepseek-ai'), { recursive: true })
    // Each peer is found where a plugin that depends on it has it (pnpm keeps them per package).
    const found = ['packages/framework', 'plugins/acryl-door', 'plugins/acryl-node-server', 'plugins/acryl-db-sqlite'].map(d => join(root, '..', '..', d, 'node_modules', peer)).find(existsSync)
    if (found === undefined) throw new Error(`${peer} is not installed in this workspace`)
    symlinkSync(realpathSync(found), join(app, 'node_modules', peer), 'junction')
  }
  const once = run(process.execPath, ['--input-type=module', '-e', "import { Acryl } from 'acrylblends'; import { Acryl as served } from 'acrylblends/cordis/router'; process.stdout.write(String(Acryl === served))"], app)
  if (once !== 'true') throw new Error('acrylblends and acrylblends/cordis/router export two different Acryl classes')
  report('one Acryl, and the plain entries load without Cordis', 'acrylblends and acrylblends/cordis/router export the same Acryl; 8 plain entries import with no @deepseek-ai/cordis installed')

  // The data entries, from the packed build: openDb opens a file in a folder it creates, applies the numbered migrations once, enforces
  // foreign keys, rolls back a failing transaction, refuses a misnumbered folder, and a second open does not run the migrations again.
  mkdirSync(join(app, 'migrations'), { recursive: true })
  writeFileSync(join(app, 'migrations', '001-notes.sql'), 'CREATE TABLE users (id INTEGER PRIMARY KEY);\nCREATE TABLE notes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL);\n')
  writeFileSync(join(app, 'migrations', '002-tags.sql'), 'ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT \'\';\n')
  writeFileSync(join(app, 'data.mjs'), [
    "import { openDb } from 'acrylblends/db/sqlite'",
    "import assert from 'node:assert/strict'",
    "import { mkdirSync, writeFileSync } from 'node:fs'",
    "const path = 'data/nested/app.sqlite'",
    "const first = await openDb({ path, migrations: 'migrations' })",
    "const user = await first.db.get('INSERT INTO users DEFAULT VALUES RETURNING id')",
    "const note = await first.db.get('INSERT INTO notes (user_id, title) VALUES (?, ?) RETURNING *', user.id, 'hello')",
    "assert.deepEqual({ ...note }, { id: 1, user_id: user.id, title: 'hello', tags: '' })",
    "await assert.rejects(first.db.run('INSERT INTO notes (user_id, title) VALUES (?, ?)', 99, 'orphan'))",
    "assert.equal((await first.db.run('DELETE FROM users WHERE id = ?', user.id)).changes, 1)",
    "assert.deepEqual(await first.db.all('SELECT id FROM notes'), [])",
    "await assert.rejects(first.db.transaction(async (tx) => { await tx.run('INSERT INTO users DEFAULT VALUES'); throw new Error('stop') }), /stop/)",
    "assert.deepEqual(await first.db.all('SELECT id FROM users'), [])",
    "await first.close(); await first.close()",
    "const second = await openDb({ path, migrations: 'migrations' })",
    "assert.equal((await second.db.get('SELECT COUNT(*) AS n FROM _migrations')).n, 1)",
    "await second.close()",
    "const memory = await openDb({ path: ':memory:', migrations: 'migrations' })",
    "assert.deepEqual(await memory.db.all('SELECT * FROM notes'), []); await memory.close()",
    "mkdirSync('gap', { recursive: true }); writeFileSync('gap/001-a.sql', 'SELECT 1;'); writeFileSync('gap/003-c.sql', 'SELECT 1;')",
    "await assert.rejects(openDb({ path: ':memory:', migrations: 'gap' }), /003|002|gap|number/i)",
    "console.log('ok')",
    '',
  ].join('\n'))
  const data = run(process.execPath, ['data.mjs'], app).trim()
  if (data !== 'ok') throw new Error(`the db entries answered ${JSON.stringify(data)}`)
  report('data (acrylblends/db/sqlite: nested folder, migrations once, foreign keys, RETURNING, rollback, :memory:, a misnumbered folder refused)', 'ok')

  // The kv entries, from the packed build: openKv writes one file atomically (no temporary file left), update is atomic under concurrency,
  // a reopen sees the data, kvOnDb keeps the same documents in the app's SQL database, and copyKv is the import from the file into SQL.
  writeFileSync(join(app, 'kv.mjs'), [
    "import { copyKv } from 'acrylblends/kv'",
    "import { openKv } from 'acrylblends/kv/json'",
    "import { kvOnDb } from 'acrylblends/kv/db'",
    "import { openDb } from 'acrylblends/db/sqlite'",
    "import assert from 'node:assert/strict'",
    "import { readdirSync } from 'node:fs'",
    "const file = 'data/kv/kv.json'",
    "const first = await openKv({ path: file })",
    "await Promise.all(Array.from({ length: 30 }, () => first.kv.update('count', (n) => (n ?? 0) + 1)))",
    "await first.kv.set('theme', { dark: true })",
    "await assert.rejects(first.kv.update('count', async (n) => n + 1), /synchronous/)",
    "await assert.rejects(first.kv.set('bad', Number.NaN), TypeError)",
    "await first.close(); await first.close()",
    "assert.deepEqual(readdirSync('data/kv'), ['kv.json'])",
    "const second = await openKv({ path: file })",
    "assert.equal(await second.kv.get('count'), 30)",
    "assert.deepEqual(await second.kv.list(), ['count', 'theme'])",
    "const sql = await openDb({ path: ':memory:' })",
    "const target = kvOnDb(sql.db)",
    "assert.deepEqual(await copyKv(second.kv, target), { copied: 2, overwritten: 0 })",
    "assert.deepEqual(await target.get('theme'), { dark: true })",
    "assert.equal((await sql.db.get('SELECT COUNT(*) AS n FROM kv')).n, 2)",
    "await assert.rejects(copyKv(second.kv, target), /already has 2/)",
    "await second.close(); await sql.close()",
    "console.log('ok')",
    '',
  ].join('\n'))
  const kvCheck = run(process.execPath, ['kv.mjs'], app).trim()
  if (kvCheck !== 'ok') throw new Error(`the kv entries answered ${JSON.stringify(kvCheck)}`)
  report('kv (acrylblends/kv/json: atomic file, 30 concurrent updates, reopen; acrylblends/kv/db and copyKv: the file imported into SQL)', 'ok')

  // readSSE, from the packed build: a POST event stream served by streamSSE is read event by event, and the browser file clientModules serves
  // exists and imports nothing.
  writeFileSync(join(app, 'read-sse.mjs'), [
    "import { Acryl } from 'acrylblends'",
    "import { streamSSE } from 'acrylblends/streaming'",
    "import { readSSE } from 'acrylblends/read-sse'",
    "import assert from 'node:assert/strict'",
    "import { readFileSync } from 'node:fs'",
    "const app = new Acryl().post('/chat', (c) => streamSSE(c, async (stream) => {",
    "  await stream.writeSSE({ event: 'meta', data: '{\"conversation\":1}' })",
    "  for (const piece of ['Hel', 'lo\\nthere']) await stream.writeSSE({ event: 'token', data: JSON.stringify(piece) })",
    "  await stream.writeSSE({ event: 'done', data: '{}' })",
    "}))",
    "const seen = []",
    "for await (const event of readSSE(await app.request('/chat', { method: 'POST' }))) seen.push(event.event + ':' + event.data)",
    "assert.deepEqual(seen, ['meta:{\"conversation\":1}', 'token:\"Hel\"', 'token:\"lo\\\\nthere\"', 'done:{}'])",
    "const browser = readFileSync(new URL(import.meta.resolve('acrylblends/read-sse')).pathname.replace(/read-sse\\.js$/, 'browser/read-sse.js'), 'utf8')",
    "assert.ok(!/^import |from ['\"]/m.test(browser), 'the browser file imports nothing')",
    "assert.ok(browser.includes('readSSE'))",
    "console.log('ok')",
    '',
  ].join('\n'))
  const readSse = run(process.execPath, ['read-sse.mjs'], app).trim()
  if (readSse !== 'ok') throw new Error(`readSSE answered ${JSON.stringify(readSse)}`)
  report('readSSE (acrylblends/read-sse: a POST event stream from streamSSE read event by event; the browser file imports nothing)', 'ok')

  // Client components without a bundler, as the client components guide sets them up: a page with one script tag, `clientModules` serving
  // src/client, an island using the DOM renderer and the typed client. A real browser runs it in development (compiled on request), then in
  // production from the folder `buildClientModules` wrote, with typescript gone as `npm ci --omit=dev` leaves it.
  mkdirSync(join(app, 'src', 'client', 'parts'), { recursive: true })
  // The routes and their type live apart from the Node entry, so the browser code imports the type without Node's types.
  writeFileSync(join(app, 'app.ts'), [
    "import { Acryl } from 'acrylblends'",
    'export const app = new Acryl()',
    "  .get('/', (c) => c.html('<!doctype html><div id=\"counter\"></div><p id=\"greeting\"></p>'",
    // Server markup for the hydrated island, and a handle on its button taken before any module runs.
    "    + '<div id=\"island\"><button>Count 0</button></div><script>window.serverButton = document.querySelector(\"#island button\")</script>'",
    "    + '<script type=\"module\" src=\"/client/counter.tsx\"></script><script type=\"module\" src=\"/client/island.tsx\"></script>'",
    "    + '<script type=\"module\" src=\"/client/press.ts\"></script>'))",
    "  .get('/api/hello', (c) => c.json({ hello: 'browser' }))",
    'export type AppType = typeof app',
    '',
  ].join('\n'))
  writeFileSync(join(app, 'site.ts'), [
    "import { Acryl } from 'acrylblends'",
    "import { clientModules, serve } from 'acrylblends/node-server'",
    "import { app } from './app.ts'",
    "const site = new Acryl().route('/', app).route('/client', clientModules({ root: 'src/client', compiled: 'dist/client' }))",
    "serve({ fetch: site.fetch, port: Number(process.env.PORT), hostname: '127.0.0.1' })",
    '',
  ].join('\n'))
  writeFileSync(join(app, 'src', 'client', 'counter.tsx'), [
    "import { render, useState } from 'acrylblends/jsx/dom'",
    "import { hc } from 'acrylblends/client'",
    "import type { AppType } from '../../app.ts'",
    "import { label } from './parts/label.ts'",
    'const Counter = () => {',
    '  const [count, setCount] = useState(0)',
    '  return <button onClick={() => setCount(count + 1)}>{label(count)}</button>',
    '}',
    "render(<Counter />, document.getElementById('counter')!)",
    'const client = hc<AppType>(location.origin)',
    "const { hello } = await (await client.api.hello.$get()).json()",
    "document.getElementById('greeting')!.textContent = `hello ${hello}`",
    '',
  ].join('\n'))
  writeFileSync(join(app, 'src', 'client', 'parts', 'label.ts'), 'export const label = (count: number): string => `Count ${count}`\n')
  // hydrateRoot over server markup, as the guide's hydrateRoot section describes it: the island works, and the server's nodes are replaced.
  writeFileSync(join(app, 'src', 'client', 'island.tsx'), [
    "import { useState } from 'acrylblends/jsx/dom'",
    "import { hydrateRoot } from 'acrylblends/jsx/dom/client'",
    "import { label } from './parts/label.ts'",
    'const Island = () => {',
    '  const [count, setCount] = useState(0)',
    '  return <button onClick={() => setCount(count + 1)}>{label(count)}</button>',
    '}',
    "hydrateRoot(document.getElementById('island')!, <Island />)",
    "document.body.dataset.hydrated = 'yes'",
    '',
  ].join('\n'))
  // The test's own driver: two clicks on each island once both ran, then marks on the page.
  writeFileSync(join(app, 'src', 'client', 'press.ts'), [
    'const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))',
    "while (document.querySelector('#counter button') === null || document.getElementById('greeting')!.textContent === '' || document.body.dataset.hydrated !== 'yes') await pause(10)",
    "const serverButton = Reflect.get(window, 'serverButton') as Element",
    "document.body.dataset.replaced = serverButton.isConnected ? 'no' : 'yes'",
    "for (const island of ['#counter', '#island']) {",
    "  for (let at = 0; at < 2; at += 1) { document.querySelector<HTMLButtonElement>(`${island} button`)!.click(); await pause(50) }",
    '}',
    "document.body.dataset.done = 'yes'",
    '',
  ].join('\n'))
  const islandRan = (dom) =>
    dom.includes('<div id="counter"><button>Count 2</button></div>') && dom.includes('<p id="greeting">hello browser</p>')
    && dom.includes('<div id="island"><button>Count 2</button></div>') && dom.includes('data-replaced="yes"') && dom.includes('data-done="yes"')
  const chrome = findChrome()
  if (chrome === undefined && process.env.CI !== undefined) throw new Error('no Google Chrome or Chromium found (set CHROME_PATH); CI needs one for the client components check')
  const browserCheck = async (name, env) => {
    const port = await freePort()
    await withServer(process.execPath, ['site.ts'], port, { ...env, PORT: String(port) }, async () => {
      const module = await fetch(`http://127.0.0.1:${String(port)}/client/counter.tsx`)
      if (module.status !== 200 || module.headers.get('content-type') !== 'text/javascript; charset=utf-8') throw new Error(`${name}: /client/counter.tsx answered ${String(module.status)} ${String(module.headers.get('content-type'))}: ${await module.text()}`)
      if (chrome === undefined) { report(name, 'module served; browser skipped: no Google Chrome or Chromium installed'); return }
      const dom = chromeDom(chrome, `http://127.0.0.1:${String(port)}/`)
      if (!islandRan(dom)) throw new Error(`${name}: the island did not run in the browser: ${dom}`)
      report(name, 'headless Chrome: the island rendered, two clicks counted to 2, the typed client fetched; hydrateRoot replaced the server button and its island counted to 2')
    })
  }
  await browserCheck('client components, development (compiled on request)', { NODE_ENV: 'development' })
  // The documented build step, run the way an app's package.json script runs it.
  run(process.execPath, ['--input-type=module', '-e', "import { buildClientModules } from 'acrylblends/node-server'; buildClientModules({ root: 'src/client', outDir: 'dist/client' })"], app)
  unlinkSync(join(app, 'node_modules', 'typescript'))
  await browserCheck('client components, production (built folder, no typescript installed)', { NODE_ENV: 'production' })
  const devPort = await freePort()
  await withServer(process.execPath, ['site.ts'], devPort, { NODE_ENV: 'development', PORT: String(devPort) }, async () => {
    const response = await fetch(`http://127.0.0.1:${String(devPort)}/client/counter.tsx`)
    const text = await response.text()
    if (response.status !== 500 || !text.includes('npm install --save-dev typescript')) throw new Error(`development without typescript answered ${String(response.status)} ${text}`)
  })
  report('client components, development without typescript', '500 naming npm install --save-dev typescript')
  symlinkSync(realpathSync(join(root, 'node_modules', 'typescript')), join(app, 'node_modules', 'typescript'), 'junction')
  // The editor's view of the client folder: its own tsconfig.json, the DOM library and the DOM runtime, no Node types.
  writeFileSync(join(app, 'src', 'client', 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: { target: 'ES2024', lib: ['ES2024', 'DOM', 'DOM.Iterable'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, allowImportingTsExtensions: true, jsx: 'react-jsx', jsxImportSource: 'acrylblends/jsx/dom', types: [] },
    include: ['**/*.ts', '**/*.tsx'],
  }, null, 2)}\n`)
  run(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join('src', 'client', 'tsconfig.json')], app)
  report('client components, types (src/client/tsconfig.json: DOM library, no Node types, the typed client)', 'the island typechecks')

  if (installed('bun')) {
    const port = await freePort()
    try {
      expectHello('bun (bun run, export default app; informational)', await serveAndFetch('bun', ['run', 'index.ts'], port, { PORT: String(port) }))
    } catch (cause) {
      report('bun (informational)', `did not pass, not counted: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  } else report('bun (informational)', 'skipped: bun is not installed')

  // The Bun adapter on Bun itself (experimental, and the only runtime besides Node that has a gate): serveStatic reads a file with Bun.file, getConnInfo reads the client's address
  // from the server, and upgradeWebSocket echoes a message over a real WebSocket. It runs when bun is installed and is counted when it does; on CI (where bun is installed by the
  // workflow) a missing bun fails the check instead of skipping.
  if (!installed('bun') && process.env.CI) throw new Error('bun is not installed on this CI runner: the Bun smoke gate cannot run (the workflow installs it)')
  if (installed('bun')) {
    mkdirSync(join(app, 'static'), { recursive: true })
    writeFileSync(join(app, 'static', 'hello.txt'), 'hello from bun\n')
    writeFileSync(join(app, 'bun-server.ts'), [
      "import { Acryl } from 'acrylblends'",
      "import { getConnInfo, serveStatic, upgradeWebSocket, websocket } from 'acrylblends/bun'",
      'const app = new Acryl()',
      "app.get('/', (c) => c.text('Acryl!'))",
      "app.use('/static/*', serveStatic({ root: './' }))",
      "app.get('/ip', (c) => c.text(getConnInfo(c).remote.address ?? 'unknown'))",
      "app.get('/ws', upgradeWebSocket(() => ({ onMessage(event, ws) { ws.send(`echo ${String(event.data)}`) } })))",
      'export default { port: Number(process.env.PORT), hostname: \'127.0.0.1\', fetch: app.fetch, websocket }',
      '',
    ].join('\n'))
    const bunPort = await freePort()
    await withServer('bun', ['run', 'bun-server.ts'], bunPort, { PORT: String(bunPort) }, async () => {
      const base = `http://127.0.0.1:${String(bunPort)}`
      const file = await fetch(`${base}/static/hello.txt`)
      if (file.status !== 200 || (await file.text()) !== 'hello from bun\n') throw new Error(`bun serveStatic answered ${String(file.status)}`)
      const ip = await (await fetch(`${base}/ip`)).text()
      if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ip)) throw new Error(`bun getConnInfo answered ${JSON.stringify(ip)}`)
      const echoed = await new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${String(bunPort)}/ws`)
        const timer = setTimeout(() => reject(new Error('bun WebSocket did not echo')), 5000)
        socket.onopen = () => socket.send('ping')
        socket.onmessage = (event) => { clearTimeout(timer); socket.close(); resolve(String(event.data)) }
        socket.onerror = () => { clearTimeout(timer); reject(new Error('bun WebSocket failed')) }
      })
      if (echoed !== 'echo ping') throw new Error(`bun WebSocket answered ${JSON.stringify(echoed)}`)
    })
    report('bun adapter (acrylblends/bun on Bun: serveStatic, getConnInfo, upgradeWebSocket)', 'a file, the client address and a WebSocket echo')
  }

  // The README is the npm page: every TypeScript example in it is written into the consumer and typechecked with the rest. A block whose first
  // line is `// <file>.ts` is that file (other examples import it); every other block is a file of its own.
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const examples = [...readme.matchAll(/^```ts\n([\s\S]*?)^```$/gmu)].map((match, at) => {
    const named = /^\/\/ ([\w-]+\.ts)\n/u.exec(match[1])
    return { file: named === null ? `readme-${String(at)}.ts` : named[1], source: match[1] }
  })
  if (examples.length === 0) throw new Error('README.md has no TypeScript examples')
  for (const example of examples) writeFileSync(join(app, example.file), example.source)

  // Types: Node's types only, no DOM library, every subpath imported, and the root augmented as the docs show.
  const types = join(root, 'node_modules', '@types')
  mkdirSync(join(app, 'node_modules', '@types'), { recursive: true })
  for (const name of readdirSync(types)) {
    // The workspace links @types packages; the consumer gets real copies, with the packages each one depends on (pnpm keeps those beside it),
    // so the check reads nothing from the workspace but these types.
    const real = realpathSync(join(types, name))
    run('cp', ['-RL', real, join(app, 'node_modules', '@types', name)], app)
    const { dependencies = {} } = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'))
    for (const dependency of Object.keys(dependencies)) run('cp', ['-RL', join(real, '..', '..', dependency), join(app, 'node_modules', dependency)], app)
  }
  const exported = Object.keys(JSON.parse(run('node', ['-e', "process.stdout.write(JSON.stringify(require('./node_modules/acrylblends/package.json').exports))"], app))).filter(key => key !== './package.json')
  // The DOM renderer is for the browser: its types are the DOM's. Every other subpath needs no DOM library.
  // Browser modules: the DOM renderer, and the door's page (it reads the document).
  const isDom = key => key === './jsx/dom' || key.startsWith('./jsx/dom/') || key === './door/page'
  const subpaths = exported.filter(key => !isDom(key))
  const domSubpaths = exported.filter(isDom)
  if (domSubpaths.length === 0) throw new Error('no acrylblends/jsx/dom subpath to typecheck')
  const imports = keys => keys.map((key, at) => `import type * as Entry${String(at)} from '${key === '.' ? 'acrylblends' : `acrylblends/${key.slice(2)}`}'`)
  // A server-side JSX page, the way the JSX guide writes one.
  writeFileSync(join(app, 'page.tsx'), [
    '/** @jsxImportSource acrylblends/jsx */',
    "import { Acryl } from 'acrylblends'",
    "import type { FC } from 'acrylblends/jsx'",
    'const Title: FC<{ text: string }> = ({ text }) => <h1 onClick={(event) => event.preventDefault()}>{text}</h1>',
    "export const pages = new Acryl().get('/', (c) => c.html(<Title text=\"Acryl!\" />))",
    '',
  ].join('\n'))
  writeFileSync(join(app, 'types.ts'), [
    "import type { Acryl } from 'acrylblends'",
    ...imports(subpaths),
    '',
    "declare module 'acrylblends' {",
    '  interface ContextVariableMap { user: string }',
    '  interface NotFoundResponse { readonly notFound: true }',
    '}',
    '',
    "export function who(app: Acryl): void { app.get('/me', c => c.text(c.get('user'))) }",
    `export type Entries = [${subpaths.map((_, at) => `typeof Entry${String(at)}`).join(', ')}]`,
    '',
  ].join('\n'))
  writeFileSync(join(app, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: { target: 'ES2024', lib: ['ES2024'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, allowImportingTsExtensions: true, jsx: 'react-jsx', types: ['node'] },
    files: ['index.ts', 'node.ts', 'types.ts', 'page.tsx', ...examples.map(example => example.file)],
  }, null, 2)}\n`)
  run(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], app)
  report('types (Node types only, no DOM; every subpath but the DOM renderer; root augmentation; a JSX page)', `${String(subpaths.length)} entries typecheck`)

  // The DOM renderer as a browser project uses it: the DOM library, its entries, and a component rendered into the page.
  writeFileSync(join(app, 'dom.ts'), [...imports(domSubpaths), '', `export type Entries = [${domSubpaths.map((_, at) => `typeof Entry${String(at)}`).join(', ')}]`, ''].join('\n'))
  writeFileSync(join(app, 'client.tsx'), [
    '/** @jsxImportSource acrylblends/jsx/dom */',
    "import { render, useState } from 'acrylblends/jsx/dom'",
    'const Counter = () => {',
    '  const [count, setCount] = useState(0)',
    '  return <button onClick={(event: MouseEvent) => setCount(count + event.detail)}>{count}</button>',
    '}',
    'render(<Counter />, document.body)',
    '',
  ].join('\n'))
  writeFileSync(join(app, 'tsconfig.dom.json'), `${JSON.stringify({
    compilerOptions: { target: 'ES2024', lib: ['ES2024', 'DOM', 'DOM.Iterable'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, jsx: 'react-jsx', types: [] },
    files: ['dom.ts', 'client.tsx'],
  }, null, 2)}\n`)
  run(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.dom.json'], app)
  report('types (the DOM renderer with the DOM library; a component rendered into the page)', `${String(domSubpaths.length)} entries typecheck`)
  // The upstream project's name appears only in LICENSE files (owner's rule). The name is read from this package's LICENSE, so this
  // script does not spell it either.
  const licensed = /built from the ACRYL port of (\S+) v\d/u.exec(readFileSync(join(root, 'LICENSE'), 'utf8'))
  if (licensed === null) throw new Error('LICENSE does not name the project this package is ported from')
  if (new RegExp(`\\b${licensed[1]}\\b`, 'iu').test(readme)) throw new Error('README.md names the upstream project; only LICENSE may')
  report('README (the npm page)', `${String(examples.length)} TypeScript examples typecheck; no upstream name`)
} catch (cause) {
  console.error(`verify-standalone: FAILED: ${cause instanceof Error ? (cause.stdout ?? '') + (cause.stderr ?? '') + cause.message : String(cause)}`)
  process.exitCode = 1
} finally {
  if (keep) console.log(`verify-standalone: kept ${folder}`)
  else rmSync(folder, { recursive: true, force: true })
}
