#!/usr/bin/env node
// What a user gets, from the tarballs alone: pack acrylblends and create-acrylblends, install ONLY those into an empty folder (the repository's sources are not on the path), run the
// installed `create-acrylblends` for each web template and `acrylblends init` for the agent template, install the new app and run ITS tests and type-check. The other gates run the
// repository's own command line; this one runs the installed one, so a file the package leaves out, or an import that is only right inside the repository, fails here.
//
//   node scripts/verify-packed.mjs
import './lib/scratch-home.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const log = (message) => console.log(`verify-packed: ${message}`)
/** The line a person copies from a plugin's page, in an app that is not running: it must reach the app's door command and say to start the app. */
const assertAcrylLine = (app) => {
  const answered = spawnSync('npm run acryl -- plugin pull github:someone/some-plugin@0.1.0', {
    cwd: app,
    encoding: 'utf8',
    shell: true,
  })
  if (answered.status !== 3 || !answered.stderr.includes('start it (npm run dev)'))
    throw new Error(
      `npm run acryl in ${app} did not say to start the app (exit ${answered.status}):\n${answered.stdout}${answered.stderr}`,
    )
}

const run = (command, args, cwd, env = {}) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    timeout: 900_000,
  })
const scratch = mkdtempSync(join(tmpdir(), 'verify-packed-'))
try {
  const packed = join(scratch, 'packed')
  mkdirSync(packed)
  for (const dir of ['cli', 'create'])
    run('pnpm', ['pack', '--pack-destination', packed], join(root, 'packages', dir))
  const tarball = (prefix) =>
    join(
      packed,
      readdirSync(packed).find((f) => f.startsWith(prefix) && f.endsWith('.tgz')),
    )
  const tools = join(scratch, 'tools')
  mkdirSync(tools)
  writeFileSync(join(tools, 'package.json'), '{"name":"tools","private":true}\n')
  run(
    'npm',
    ['install', '--no-audit', '--no-fund', tarball('acrylblends-'), tarball('create-acrylblends-')],
    tools,
  )
  const bin = (name) => join(tools, 'node_modules', '.bin', name)
  log('installed acrylblends and create-acrylblends from their tarballs')

  for (const template of ['nodejs', 'notes', 'chat', 'acryl-app']) {
    const app = join(scratch, `app-${template}`)
    // Only the files (the plain app): the tarball is installed next, as acrylblends may not be published yet.
    run(
      bin('create-acrylblends'),
      [app, '--template', template, '--bare', '--no-install', '--no-start', '-y'],
      scratch,
    )
    // The new app asks for the version of acrylblends it was made with, which may not be published yet: install the tarball (npm then records it).
    run('npm', ['install', '--no-audit', '--no-fund', tarball('acrylblends-')], app)
    run('npm', ['test'], app, { ACRYL_DOOR: 'off' })
    run('npm', ['run', 'check'], app)
    log(`${template}: made by the installed command, its tests and type-check pass`)
  }
  const blank = join(scratch, 'app-blank')
  run(bin('acrylblends'), ['init', blank, '--template', 'todo', '--bare', '-y'], scratch)
  run('npm', ['install', '--no-audit', '--no-fund'], blank)
  run('npm', ['test'], blank, { ACRYL_DOOR: 'off' })
  log('todo: made by the installed command, its tests pass')
  // A WebSocket upgrade route in an app made by the installed command (spec 047 T009): a plugin mounts `/ws` behind a check, a real `ws` client echoes through it, and unloading the
  // plugin closes the socket with 1001. The app's own copies of the router and the server run it, so the installed package's source is what is tested.
  const wsApp = join(scratch, 'app-nodejs')
  run('npm', ['install', 'ws', '--no-audit', '--no-fund'], wsApp)
  writeFileSync(
    join(wsApp, 'ws-check.ts'),
    `import { Context } from '@deepseek-ai/cordis'
import WebSocket from 'ws'
import * as nodeServer from './plugins/acryl-node-server/src/index.ts'
import * as router from './plugins/acryl-router/src/index.ts'

const ctx = new Context()
await ctx.plugin(router).await()
await ctx.plugin(nodeServer, { hostname: '127.0.0.1' }).await()
const echo = ctx.plugin({
  name: 'ws-echo',
  inject: ['router', 'nodeServer'],
  apply(inner: Context) {
    const upgrade = inner.nodeServer.upgrades()
    inner.router.route('/', new router.Acryl()
      .use('/ws', async (c, next) => (c.req.header('x-allow') === 'yes' ? next() : c.text('forbidden', 403)))
      .get('/ws', upgrade(() => ({ onMessage(event, socket) { socket.send('echo ' + String(event.data)) } }))))
  },
})
await echo.await()
const url = ctx.nodeServer.url.replace('http', 'ws') + '/ws'
const refused = await new Promise<string>((resolve) => {
  const client = new WebSocket(url)
  client.once('unexpected-response', (_request, response) => resolve(String(response.statusCode)))
  client.once('open', () => resolve('opened'))
  client.once('error', () => resolve('error'))
})
if (refused !== '403') throw new Error('expected a plain 403, got ' + refused)
const client = new WebSocket(url, { headers: { 'x-allow': 'yes' } })
const reply = await new Promise<string>((resolve, reject) => {
  client.once('message', (data) => resolve(String(data)))
  client.once('open', () => client.send('hi'))
  client.once('error', reject)
})
if (reply !== 'echo hi') throw new Error('expected echo hi, got ' + reply)
const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)))
await echo.dispose()
const code = await closed
if (code !== 1001) throw new Error('expected close 1001, got ' + String(code))
if (ctx.nodeServer.sockets !== 0) throw new Error('a socket is still open')
await ctx.fiber.dispose()
console.log('ws-check: ok')
`,
  )
  run('node', ['ws-check.ts'], wsApp)
  log(
    'nodejs: a WebSocket upgrade route refuses, echoes, and closes with 1001 when its plugin unloads',
  )
  // The agent panel and the PTY driver, added by the installed command: copied, installed (node-pty from the registry) and type-checked.
  const agentApp = join(scratch, 'app-agent')
  run(bin('acrylblends'), ['init', agentApp, '--template', 'agent', '--bare', '-y'], scratch)
  run(bin('acrylblends'), ['add', 'driver-pty'], agentApp)
  run('npm', ['install', '--no-audit', '--no-fund', tarball('acrylblends-')], agentApp)
  run('npm', ['run', 'check'], agentApp)
  assertAcrylLine(agentApp)
  log(
    'agent: agent-panel and driver-pty added by the installed command, installed and type-checked',
  )
  // A person's own routes must never make the template's tests fail: the common ones (/hello, /hi, /api) are added to the app's routes, and its tests still pass.
  const routesFile = join(agentApp, 'src', 'routes.ts')
  const routes = readFileSync(routesFile, 'utf8')
  const withRoutes = routes.replace(
    ".get('/health', (c) => c.json({ ok: true }))",
    ".get('/health', (c) => c.json({ ok: true }))\n      .get('/hello', (c) => c.json({ hello: 'workshop' }))\n      .get('/hi', (c) => c.json({ hi: true }))\n      .get('/api', (c) => c.json({ api: true }))",
  )
  if (withRoutes === routes)
    throw new Error(
      'the agent template no longer has the /health route where this gate adds its own',
    )
  writeFileSync(routesFile, withRoutes)
  run('npm', ['test'], agentApp, { ACRYL_DOOR: 'off' })
  log("agent: with routes at /hello, /hi and /api of its own, the template's tests still pass")
  // A starter from a registry, made by the installed command: a local registry folder with one app for acrylblends (made by the installed `acrylblends init`, marked with an
  // acryl.template.json) and one ACRYL starter. `create-acrylblends --from` makes the first, whose tests and type-check pass, and refuses the second in one line.
  const registry = join(scratch, 'registry')
  mkdirSync(registry)
  writeFileSync(join(registry, 'index.json'), '{"formatVersion":1,"entries":[]}\n')
  run(
    process.execPath,
    [
      join(root, 'scripts', 'make-registry-starters.mjs'),
      registry,
      '--only',
      'acrylblends.chat',
      '--cli',
      join(tools, 'node_modules', 'acrylblends', 'bin', 'acrylblends.js'),
    ],
    scratch,
  )
  mkdirSync(join(registry, 'blends', 'acryl.gtd'))
  writeFileSync(join(registry, 'blends', 'acryl.gtd', 'blend.yaml'), 'metadata:\n  id: acryl.gtd\n')
  writeFileSync(
    join(registry, 'index.json'),
    JSON.stringify({
      formatVersion: 1,
      entries: [
        { id: 'acryl.gtd', name: 'GTD', version: '0.1.0', path: 'blends/acryl.gtd' },
        {
          id: 'acrylblends.chat',
          name: 'Chat',
          version: '0.1.0',
          path: 'blends/acrylblends.chat',
          runtime: 'acrylblends',
        },
      ],
    }),
  )
  const pulled = join(scratch, 'app-pulled')
  run(
    bin('create-acrylblends'),
    [pulled, '--from', 'acrylblends.chat', '--registry', registry, '--bare', '-y'],
    scratch,
  )
  run('npm', ['install', '--no-audit', '--no-fund', tarball('acrylblends-')], pulled)
  run('npm', ['test'], pulled, { ACRYL_DOOR: 'off' })
  run('npm', ['run', 'check'], pulled)
  // The refusal is run the way `npm create acrylblends` runs it (`npm exec`): npm adds its own error lines, and the reason must still be on stderr.
  let refusal = ''
  try {
    run(
      'npm',
      [
        'exec',
        '--no',
        '--',
        'create-acrylblends',
        join(scratch, 'app-refused'),
        '--from',
        'acryl.gtd',
        '--registry',
        registry,
        '-y',
      ],
      tools,
    )
  } catch (error) {
    refusal = String(error.stderr ?? '')
  }
  if (!refusal.includes('acryl.gtd is an ACRYL app starter'))
    throw new Error(`the ACRYL starter was not refused in a line:\n${refusal}`)
  log(
    'registry: --from made an app from a runtime acrylblends entry (tests and type-check pass) and refused an ACRYL one',
  )
  // A relative path in a row of blend.yaml (`migrations: migrations`) is read from the app's folder: `add db` mounts the provider, the row gets its config, and the app's own tests boot it.
  const dbApp = join(scratch, 'app-db')
  run(bin('acrylblends'), ['init', dbApp, '--template', 'blank', '--bare', '-y'], scratch)
  run(bin('acrylblends'), ['add', 'db'], dbApp)
  mkdirSync(join(dbApp, 'migrations'))
  writeFileSync(
    join(dbApp, 'migrations', '001-notes.sql'),
    'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\n',
  )
  const manifestFile = join(dbApp, 'blend.yaml')
  // The hint of `add db`: a row of blend.yaml with the relative paths, and the plugin in the registry of src/app.ts.
  const rows = readFileSync(manifestFile, 'utf8')
  const withRow = rows.replace(
    '    - id: routes\n',
    '    - id: db\n      name: acryl-db-sqlite\n      config:\n        path: data/app.sqlite\n        migrations: migrations\n    - id: routes\n',
  )
  if (withRow === rows)
    throw new Error('the blank template no longer has a routes row where this gate adds the db row')
  writeFileSync(manifestFile, withRow)
  const appFile = join(dbApp, 'src', 'app.ts')
  const appSource = readFileSync(appFile, 'utf8')
  const registered = appSource
    .replace(
      'import * as nodeServer from',
      "import * as dbSqlite from '../plugins/acryl-db-sqlite/src/index.ts'\nimport * as nodeServer from",
    )
    // The registry literal may sit on one line or span several: the entry goes right after its opening brace.
    .replace(
      /export const registry = \{\s*/u,
      (opening) => `${opening}'acryl-db-sqlite': dbSqlite, `,
    )
  if (
    !registered.includes("'acryl-db-sqlite': dbSqlite") ||
    !registered.includes('import * as dbSqlite')
  )
    throw new Error(
      'the blank template no longer has the registry where this gate registers the db provider',
    )
  writeFileSync(appFile, registered)
  run('npm', ['install', '--no-audit', '--no-fund', tarball('acrylblends-')], dbApp)
  run('npm', ['run', 'check'], dbApp)
  // The template's own test checks its rows in their order and lets a feature's row sit between them, so the added db row needs no edit to it.
  run('npm', ['test'], dbApp, { ACRYL_DOOR: 'off' })
  if (!existsSync(join(dbApp, 'data', 'app.sqlite')))
    throw new Error(
      'the relative database path was not read from the app folder (no data/app.sqlite there)',
    )
  log(
    'db: a row with a relative migrations path was read from the app folder (the app boots in its tests)',
  )
  // An app made by an older published version, upgraded by the installed command: `upgrade` replaces its library plugins, and the upgraded app installs, type-checks and passes its tests.
  // The fixtures are apps made by the published 0.9.1 and 0.10.0 (`scripts/make-upgrade-fixtures.mjs`).
  for (const old of ['0.9.1', '0.10.0']) {
    const holder = join(scratch, `upgrade-${old}`)
    mkdirSync(holder)
    run(
      'tar',
      [
        '-xzf',
        join(root, 'packages', 'cli', 'test', 'fixtures', 'upgrade', `app-${old}.tgz`),
        '-C',
        holder,
      ],
      scratch,
    )
    const oldApp = join(holder, 'app')
    const upgraded = run(bin('acrylblends'), ['upgrade'], oldApp)
    if (!upgraded.includes('upgraded'))
      throw new Error(`upgrade of the ${old} app did nothing:\n${upgraded}`)
    run('npm', ['install', '--no-audit', '--no-fund'], oldApp)
    run('npm', ['run', 'check'], oldApp)
    assertAcrylLine(oldApp)
    run('npm', ['test'], oldApp, { ACRYL_DOOR: 'off' })
    if (
      !run(bin('acrylblends'), ['upgrade', '--dry-run'], oldApp).includes(
        'everything is up to date',
      )
    )
      throw new Error(`the upgraded ${old} app is not up to date`)
    log(
      `an app made by ${old}: upgraded by the installed command; it installs, type-checks, passes its tests, and has nothing left to upgrade`,
    )
  }
  log('OK')
} catch (error) {
  console.error(
    `verify-packed: FAILED: ${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`.slice(
      0,
      4000,
    ),
  )
  process.exitCode = 1
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
