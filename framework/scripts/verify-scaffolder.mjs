#!/usr/bin/env node
import './lib/scratch-home.mjs'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
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
import { join, resolve } from 'node:path'
/**
 * Prove each template works the way a user runs it:
 *
 *  1. build the CLI and run `acrylblends init` for real into an empty temp directory
 *  2. a second `init` into the same directory must refuse and change nothing
 *  3. the generated package.json depends at run time only on the named packages (constitution III)
 *  4. npm install, `npm run check` (types), `npm test`, boot it with `npm start` in a throwaway home, request its routes,
 *     stop it with SIGINT, and confirm its data stayed in that home
 *
 * Needs the network for the install step. Fails on the first problem.
 */
import { probeDoor } from './lib/door-probe.mjs'

const root = resolve(import.meta.dirname, '..')
const cliDir = join(root, 'packages', 'cli')
const cli = join(cliDir, 'bin', 'acrylblends.js')
const scratch = mkdtempSync(join(tmpdir(), 'verify-scaffolder-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const TEMPLATES = {
  blank: ['--template', 'blank'],
  todo: ['--template', 'todo'],
  agent: ['--template', 'agent'],
}

const log = (message) => console.log(`verify-scaffolder: ${message}`)
const fail = (message) => {
  throw new Error(`verify-scaffolder: ${message}`)
}

const capture = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })

/** True once `url` answers with any status, within `timeoutMs`. */
async function waitForOk(url, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (
      await fetch(url, { redirect: 'manual' }).then(
        () => true,
        () => false,
      )
    )
      return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

function waitForUrl(child, timeoutMs = 60_000) {
  return new Promise((done, reject) => {
    let output = ''
    const timer = setTimeout(
      () => reject(new Error(`not listening after ${timeoutMs}ms:\n${output}`)),
      timeoutMs,
    )
    const onData = (chunk) => {
      output += chunk
      const match = /listening on (http:\/\/\S+)/.exec(output)
      if (match) {
        clearTimeout(timer)
        done(match[1])
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => reject(new Error(`exited early with ${code}:\n${output}`)))
  })
}

/**
 * Stop the app the way Ctrl+C in a terminal does: SIGINT to its whole process group (npm, the shell npm starts, and node). Signalling
 * npm alone is not enough on Linux, where /bin/sh (dash) does not pass the signal on to node. Windows has no process groups.
 */
const interrupt = (child, signal) => {
  if (process.platform === 'win32') child.kill(signal)
  else process.kill(-child.pid, signal)
}

async function stopCleanly(child) {
  const exited = new Promise((done) => child.once('exit', (code) => done(code)))
  interrupt(child, 'SIGINT')
  const code = await Promise.race([
    exited,
    new Promise((done) => setTimeout(() => done('timeout'), 10_000)),
  ])
  if (code === 'timeout') {
    interrupt(child, 'SIGKILL')
    fail('the app did not stop within 10s of SIGINT')
  }
  if (code !== 0 && code !== null) fail(`the app exited with ${code} on SIGINT`)
}

async function json(response, what) {
  if (response.status !== 200) fail(`${what} returned ${response.status}`)
  return response.json()
}

/**
 * Every template must pass its own tests where an agent runs them. Codex's default sandbox (`workspace-write`, no network) forbids the system temp folder and listening on a
 * port, so a template whose tests need either leaves the agent unable to check its work. `codex sandbox` runs the command under that sandbox; without Codex the check says so.
 */
let sandboxNoticeShown = false
function testsInCodexSandbox(dir, label) {
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'))
  try {
    const probe = spawnSync('codex', ['--version'], { encoding: 'utf8' })
    if (probe.status !== 0) {
      if (!sandboxNoticeShown)
        log('skipped the Codex sandbox check: codex is not installed on this machine')
      sandboxNoticeShown = true
      return
    }
    const run = spawnSync(
      'codex',
      ['sandbox', '-c', 'sandbox_mode="workspace-write"', '--', 'npm', 'test'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: home, TERM: 'xterm' },
      },
    )
    if (run.status !== 0)
      fail(
        `${label}: the tests fail in Codex's default sandbox:\n${(run.stdout + run.stderr)
          .split('\n')
          .filter((l) => /✖|EPERM|Error/.test(l))
          .slice(0, 6)
          .join('\n')}`,
      )
    const skipped = /skipped: .*/.exec(run.stdout)?.[0]
    log(`${label}: the tests pass in Codex's default sandbox${skipped ? ` (${skipped})` : ''}`)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

try {
  log('building the acrylblends CLI')
  capture('pnpm', ['run', 'build'], { cwd: cliDir })
  const present = readdirSync(join(cliDir, 'templates')).sort()
  // blank, todo and agent are walked below by `init`; nodejs, notes and chat are the web templates `create-acrylblends` makes (walked at the end).
  const expected = [...Object.keys(TEMPLATES), 'nodejs', 'notes', 'chat'].sort()
  if (present.join(',') !== expected.join(',')) fail(`unexpected templates: ${present.join(', ')}`)

  // The plain templates: init makes the app in the frame unless --bare (a flag set with --desktop keeps the frame).
  const withBare = (flags) => (flags.includes('--desktop') ? flags : [...flags, '--bare'])
  for (const [template, flags] of Object.entries(TEMPLATES)) {
    const dir = join(scratch, template)
    const name = `verify-${template}`
    capture(process.execPath, [cli, 'init', dir, '--name', name, '--yes', ...withBare(flags)])
    if (!existsSync(join(dir, 'src', 'app.ts'))) fail(`${template}: init wrote no app`)

    const again = spawn(process.execPath, [cli, 'init', dir, '--yes', ...withBare(flags)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let refusal = ''
    again.stderr.on('data', (chunk) => (refusal += chunk))
    const code = await new Promise((done) => again.on('exit', done))
    if (code === 0 || !refusal.includes('refusing to write'))
      fail(`${template}: a second init did not refuse`)

    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const deps = Object.keys(manifest.dependencies ?? {})
    const allowed = new Set([
      '@deepseek-ai/cordis',
      '@deepseek-ai/schemastery',
      // `.tsx` pages are compiled at start by the app's own typescript (acrylblends/node-server/register), so a production install (`npm ci --omit=dev`) needs it.
      'typescript',
      '@webboxes/app-persistence',
      '@webboxes/blends-core',
      // The builder packs a plugin and plugin-share pulls and publishes one; both are development rows, and the app's lists are one list.
      '@webboxes/plugin-hub',
      // The state plugin follows keys in a page over a WebSocket (1.1.0); a production app has it.
      'ws',
      'yaml',
    ])
    if (!deps.includes('@deepseek-ai/cordis') || deps.some((name) => !allowed.has(name)))
      fail(
        `${template}: runtime dependencies are ${deps.join(', ')}; allowed: ${[...allowed].join(', ')}`,
      )
    log(`${template}: scaffolded, refusal ok, runtime dependencies ${deps.join(', ')}`)

    capture(npm, ['install', '--no-audit', '--no-fund'], { cwd: dir })
    capture(npm, ['run', 'check'], { cwd: dir })
    capture(npm, ['test'], { cwd: dir })
    capture(npm, ['run', 'lock'], { cwd: dir })
    const locked = JSON.parse(readFileSync(join(dir, 'blend.lock.json'), 'utf8'))
    if (
      locked.formatVersion !== 3 ||
      !/^[0-9a-f]{64}$/.test(locked.origin?.digest ?? '') ||
      !locked.modules?.some((module) => module.name === 'manifest' && module.origin === 'local')
    ) {
      fail(`${template}: npm run lock wrote ${JSON.stringify(locked).slice(0, 200)}`)
    }
    testsInCodexSandbox(dir, template)
    log(`${template}: installed, project tests pass`)

    const home = mkdtempSync(join(tmpdir(), `verify-home-${template}-`))
    const start = () =>
      spawn(npm, ['start'], {
        cwd: dir,
        env: { ...process.env, ACRYLBLENDS_HOME: home, ACRYLBLENDS_PORT: '0' },
        shell: process.platform === 'win32',
        // Its own process group, so stopCleanly can interrupt npm and everything it started together.
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    let child = start()
    try {
      let url = await waitForUrl(child)
      if (template === 'todo') {
        // The CRUD works over HTTP, and the list is still there after the app stops and starts again.
        const call = async (method, path, body) =>
          fetch(`${url}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          })
        const created = await call('POST', '/todo/api', { title: 'write the spec' })
        if (created.status !== 201) fail(`todo: POST /todo/api answered ${created.status}`)
        const second = await (await call('POST', '/todo/api', { title: 'ship it' })).json()
        if (second.id !== 2) fail(`todo: the second todo got id ${second.id}`)
        const done = await json(await call('PATCH', '/todo/api/1', { done: true }), 'todo: PATCH')
        if (done.done !== true) fail(`todo: PATCH answered ${JSON.stringify(done)}`)
        if ((await call('POST', '/todo/api', { title: '' })).status !== 400)
          fail('todo: an empty title was not refused with 400')
        if ((await call('DELETE', '/todo/api/9')).status !== 404)
          fail('todo: deleting an unknown id was not a 404')
        for (const origin of ['http://evil.example', 'null']) {
          const refused = await fetch(`${url}/todo/api`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin },
            body: JSON.stringify({ title: 'from another origin' }),
          })
          if (refused.status !== 403)
            fail(`todo: a change with Origin ${origin} answered ${refused.status}, not 403`)
        }
        const page = await (await call('GET', '/todo')).text()
        if (!/<title>Todo<\/title>/.test(page)) fail('todo: GET /todo is not the page')
        await stopCleanly(child)
        child = start()
        url = await waitForUrl(child)
        const kept = await json(await call('GET', '/todo/api'), 'todo: GET after a restart')
        if (
          kept.length !== 2 ||
          kept[0].title !== 'write the spec' ||
          kept[0].done !== true ||
          kept[1].title !== 'ship it'
        )
          fail(`todo: the list after a restart is ${JSON.stringify(kept)}`)
        if ((await call('DELETE', '/todo/api/1')).status !== 204)
          fail('todo: DELETE did not answer 204')
        const left = await json(await call('GET', '/todo/api'), 'todo: GET after a delete')
        if (left.length !== 1 || left[0].id !== 2)
          fail(`todo: after a delete the list is ${JSON.stringify(left)}`)
        log(
          'todo: CRUD works over HTTP, validation answers 400 and 404, the page is served, and the list is still there after a restart',
        )
      } else {
        const index = await json(await fetch(`${url}/`), `${template}: GET /`)
        if (index.app !== name || index.ok !== true)
          fail(`${template}: GET / answered ${JSON.stringify(index)}`)
        await json(await fetch(`${url}/health`), `${template}: GET /health`)
      }
      if (template === 'agent') {
        const ask = async (question) =>
          (
            await json(
              await fetch(`${url}/ask`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ question }),
              }),
              `agent: POST /ask "${question}"`,
            )
          ).output
        const hello = async () => {
          const response = await fetch(`${url}/hello`)
          return response.status === 200 ? (await response.json()).text : response.status
        }
        const expect = (actual, expected, what) => {
          if (actual !== expected)
            fail(
              `agent: ${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
            )
        }
        expect(await ask('add 2 3'), 'The answer is 5.', 'tool call')
        // The builder loop, against the app a user runs: the agent extends it while it serves.
        expect(await ask('create route hello /hello Hello'), 'hello: installed, active.', 'create')
        expect(await hello(), 'Hello', 'GET /hello after create')
        expect(await ask('update route hello /hello Bonjour'), 'hello: updated, active.', 'update')
        expect(await hello(), 'Bonjour', 'GET /hello after update')
        const refused = await ask('break plugin hello')
        if (!/Previous version restored: true/.test(refused))
          fail(`agent: broken update: ${refused}`)
        expect(await hello(), 'Bonjour', 'GET /hello after a broken update')
        await ask('update route hello /hello Bonjour')
        log(
          'agent: built, updated and protected a plugin live (create, update, broken update kept the old one)',
        )
        // The agent's code is the app's code: it type-checks with the app, and starts again after a restart.
        capture(npm, ['run', 'check'], { cwd: dir })
        await stopCleanly(child)
        child = start()
        url = await waitForUrl(child)
        expect(await hello(), 'Bonjour', 'GET /hello after a restart')
        const records = await json(await fetch(`${url}/tasks`), 'agent: GET /tasks')
        const runs = records.filter((record) => record.kind === 'agent-run')
        if (runs.length < 5 || records.some((record) => record.status === 'running')) {
          fail(
            `agent: task records after a restart: ${JSON.stringify(records.map((record) => [record.kind, record.status]))}`,
          )
        }
        // One place to observe: the state cells stream the install as it happens, and hold the run as a task.
        const stream = await fetch(`${url}/api/state/extensions/events`, {
          signal: AbortSignal.timeout(20_000),
        })
        const reader = stream.body.getReader()
        const watching = (async () => {
          let text = ''
          for (;;) {
            const { value, done } = await reader.read()
            if (done) return text
            text += new TextDecoder().decode(value)
            if (/"name":"observed"[^\n]*"state":"active"/.test(text)) return text
          }
        })()
        expect(
          await ask('create route observed /observed Seen'),
          'observed: installed, active.',
          'create (observed)',
        )
        const streamed = await watching
        await reader.cancel().catch(() => undefined)
        if (!/"name":"observed"[^\n]*"state":"active"/.test(streamed))
          fail(
            `GET /api/state/extensions/events did not report the install: ${streamed.slice(0, 300)}`,
          )
        const tasksCell = await json(
          await fetch(`${url}/api/state/tasks`),
          'agent: GET /api/state/tasks',
        )
        if (!tasksCell.value.some((record) => record.kind === 'agent-run'))
          fail(
            `agent: the tasks cell holds no agent run: ${JSON.stringify(tasksCell).slice(0, 300)}`,
          )
        await ask('remove plugin observed')
        log('agent: the state cells streamed the install as it happened and hold the run as a task')
        // Untrusted code: the agent writes a tool, it runs in the sandbox, and a tool that reaches outside its folder is refused.
        expect(await ask('create tool triple 3'), 'triple: installed, active.', 'create tool')
        expect(await ask('run tool triple 14'), '{"n":42}', 'run tool')
        const spy = await ask('spy tool snoop')
        if (!/^Refused: its check failed: denied:/.test(spy))
          fail(`agent: the sandbox did not refuse the spy tool: ${spy}`)
        log(
          'agent: built a sandboxed tool and ran it; the sandbox refused a tool that read outside its folder',
        )
        // Internal to external: the agent packages what it built; a second app takes the package in and serves it.
        const packaged = await ask('package plugin hello')
        if (!packaged.startsWith('hello: packaged in ')) fail(`agent: package plugin: ${packaged}`)
        const other = join(scratch, 'other')
        capture(process.execPath, [
          cli,
          'init',
          other,
          '--bare',
          '--name',
          'verify-other',
          '--yes',
          '--agent',
        ])
        capture(process.execPath, [
          cli,
          'add',
          join(dir, 'plugin-packages', 'hello'),
          '--dir',
          other,
        ])
        capture(npm, ['install', '--no-audit', '--no-fund'], { cwd: other })
        const otherHome = mkdtempSync(join(tmpdir(), 'verify-home-other-'))
        const otherChild = spawn(npm, ['start'], {
          cwd: other,
          env: { ...process.env, ACRYLBLENDS_HOME: otherHome, ACRYLBLENDS_PORT: '0' },
          shell: process.platform === 'win32',
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        try {
          const otherUrl = await waitForUrl(otherChild)
          const served = await json(await fetch(`${otherUrl}/hello`), 'other app: GET /hello')
          if (served.text !== 'Bonjour')
            fail(`other app: GET /hello answered ${JSON.stringify(served)}`)
        } finally {
          await stopCleanly(otherChild)
          rmSync(otherHome, { recursive: true, force: true })
        }
        log('agent: packaged its plugin; a second app added the package and serves it')
        expect(await ask('remove plugin hello'), 'hello: done.', 'remove')
        expect(await hello(), 404, 'GET /hello after remove')
        log('agent: the plugin type-checks with the app, survives a restart, and is removed live')
      }
      log(`${template}: served ${url}`)
    } finally {
      await stopCleanly(child)
    }
    // ACRYLBLENDS_HOME pinned the data elsewhere, so the project folder must not have grown its own data folder.
    // (The project's tests keep their throwaway homes in .acrylblends/test, so only the app's own data counts.)
    const grown = existsSync(join(dir, '.acrylblends'))
      ? readdirSync(join(dir, '.acrylblends')).filter((entry) => entry !== 'test')
      : []
    if (grown.length > 0)
      fail(
        `${template}: wrote .acrylblends/${grown.join(', ')} into the project despite ACRYLBLENDS_HOME`,
      )
    rmSync(home, { recursive: true, force: true })
    log(`${template}: stopped cleanly; data stayed in the pinned home`)
  }
  // npm run save in a real app: a first save commits; a file that holds a secret is refused and nothing is staged.
  const saved = join(scratch, 'blank')
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.email', 'verify@example.com'],
    ['config', 'user.name', 'Verify'],
  ]) {
    capture('git', args, { cwd: saved })
  }
  const first = capture(npm, ['run', '--silent', 'save', '--', 'first save'], { cwd: saved })
  if (!/^saved [0-9a-f]{12}/m.test(first)) fail(`npm run save: ${first}`)
  writeFileSync(join(saved, 'leak.ts'), 'export const key = "AKIAABCDEFGHIJKLMNOP"\n')
  const leak = spawnSync(npm, ['run', '--silent', 'save', '--', 'leak'], {
    cwd: saved,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (leak.status === 0 || !/AWS access key/.test(leak.stderr))
    fail(`npm run save did not refuse a secret: ${leak.stdout}${leak.stderr}`)
  if (capture('git', ['diff', '--cached', '--name-only'], { cwd: saved }).trim() !== '')
    fail('npm run save left files staged after refusing')
  // The short-literal rule of @webboxes/app-persistence 0.1.1: a quoted literal assigned to a credential-named key is refused, a read from the environment is not.
  rmSync(join(saved, 'leak.ts'))
  writeFileSync(join(saved, 'creds.ts'), "export const config = { password: 'x-secret' }\n")
  const literal = spawnSync(npm, ['run', '--silent', 'save', '--', 'literal'], {
    cwd: saved,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (literal.status === 0 || !/assigned secret/.test(literal.stderr))
    fail(`npm run save did not refuse password: 'x-secret': ${literal.stdout}${literal.stderr}`)
  writeFileSync(
    join(saved, 'creds.ts'),
    'export const config = { password: process.env.APP_PASSWORD }\n',
  )
  const env = capture(npm, ['run', '--silent', 'save', '--', 'from the environment'], {
    cwd: saved,
  })
  if (!/^saved [0-9a-f]{12}/m.test(env))
    fail(`npm run save refused a read from the environment: ${env}`)
  log(
    'save: committed the app, refused a secret key and a short literal password with nothing left staged, and accepted a read from the environment',
  )
  // A Blend over a Blueprint, in a real app: it boots from its parent, an upgrade is planned and applied with the real npm scripts,
  // and an upgrade that would break the Blend is refused with the file untouched.
  const blended = join(scratch, 'blended')
  capture(process.execPath, [
    cli,
    'init',
    blended,
    '--bare',
    '--name',
    'verify-blend',
    '--yes',
    '--template',
    'blank',
  ])
  const blueprintId = 'acrylblends.verify-blend'
  const blueprintText = readFileSync(join(blended, 'blend.yaml'), 'utf8')
  mkdirSync(join(blended, 'blueprints'))
  writeFileSync(join(blended, 'blueprints', `${blueprintId}.yaml`), blueprintText)
  const blendText = `apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata: { id: me.verify-blend, name: verify-blend, version: 0.1.0 }
spec:
  runtime: cordis
  lineage: { blueprint: ${blueprintId}, blueprintVersion: 0.1.0 } # moves on upgrade
  overrides:
    - id: server
      config: { hostname: 127.0.0.1 }
`
  writeFileSync(join(blended, 'blend.yaml'), blendText)
  capture(npm, ['install', '--no-audit', '--no-fund'], { cwd: blended })
  capture(npm, ['test'], { cwd: blended })
  const blendHome = mkdtempSync(join(tmpdir(), 'verify-home-blend-'))
  const blendChild = spawn(npm, ['start'], {
    cwd: blended,
    env: { ...process.env, ACRYLBLENDS_HOME: blendHome, ACRYLBLENDS_PORT: '0' },
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    const blendUrl = await waitForUrl(blendChild)
    const index = await json(await fetch(`${blendUrl}/`), 'blend: GET /')
    if (index.app !== 'verify-blend') fail(`blend: GET / answered ${JSON.stringify(index)}`)
  } finally {
    await stopCleanly(blendChild)
    rmSync(blendHome, { recursive: true, force: true })
  }
  writeFileSync(
    join(blended, 'v0.2.yaml'),
    blueprintText.replace('version: 0.1.0', 'version: 0.2.0'),
  )
  const withoutServer = blueprintText
    .replace('version: 0.1.0', 'version: 0.3.0')
    .replace(
      / {4}- id: server\n {6}name: acryl-node-server\n {6}config:\n {8}hostname: "\{\{parameters\.hostname\}\}"\n/,
      '',
    )
    // The server row was the only user of the hostname parameter, and an unused parameter makes a Blueprint invalid.
    .replace(/ {2}parameters:\n(?: {4}#[^\n]*\n)? {4}hostname:[^\n]*\n/, '')
  if (withoutServer.includes('id: server')) fail('blend: could not build the unsafe Blueprint')
  writeFileSync(join(blended, 'v0.3.yaml'), withoutServer)
  const oldBlueprint = join('blueprints', `${blueprintId}.yaml`)
  const unsafe = spawnSync(
    npm,
    ['run', '--silent', 'upgrade', '--', '--from', oldBlueprint, '--to', 'v0.3.yaml', '--apply'],
    { cwd: blended, encoding: 'utf8', shell: process.platform === 'win32' },
  )
  if (
    unsafe.status === 0 ||
    !/override targets row id 'server'/.test(unsafe.stdout) ||
    !/NOT safe/.test(unsafe.stdout)
  )
    fail(`blend: an unsafe upgrade was not refused: ${unsafe.stdout}${unsafe.stderr}`)
  if (readFileSync(join(blended, 'blend.yaml'), 'utf8') !== blendText)
    fail('blend: a refused upgrade changed blend.yaml')
  const safe = capture(
    npm,
    ['run', '--silent', 'upgrade', '--', '--from', oldBlueprint, '--to', 'v0.2.yaml', '--apply'],
    { cwd: blended },
  )
  if (!/safe to apply/.test(safe) || !/applied: lineage is now/.test(safe))
    fail(`blend: upgrade output: ${safe}`)
  const upgraded = readFileSync(join(blended, 'blend.yaml'), 'utf8')
  if (upgraded !== blendText.replace('blueprintVersion: 0.1.0', 'blueprintVersion: 0.2.0'))
    fail(`blend: the upgrade changed more than the lineage version:\n${upgraded}`)
  capture(npm, ['run', 'lock'], { cwd: blended })
  const locked = JSON.parse(readFileSync(join(blended, 'blend.lock.json'), 'utf8'))
  if (
    locked.lineage?.blueprintVersion !== '0.2.0' ||
    !/^[0-9a-f]{64}$/.test(locked.lineage?.digest ?? '')
  )
    fail(`blend: the lock does not record the Blueprint: ${JSON.stringify(locked.lineage)}`)
  capture(npm, ['test'], { cwd: blended })
  log(
    'blend: booted from its Blueprint, refused an upgrade that removes an overridden row, applied a safe one (only the lineage moved), and the lock records the Blueprint',
  )
  // `acrylblends add` in a real app: the plugin, what it requires and its npm packages arrive, and the app still type-checks.
  const grown = join(scratch, 'grown')
  capture(process.execPath, [
    cli,
    'init',
    grown,
    '--bare',
    '--name',
    'verify-grown',
    '--yes',
    '--template',
    'blank',
  ])
  capture(process.execPath, [cli, 'add', 'settings', '--dir', grown])
  const grownDeps = Object.keys(
    JSON.parse(readFileSync(join(grown, 'package.json'), 'utf8')).dependencies,
  )
  for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', 'yaml']) {
    if (!grownDeps.includes(name)) fail(`add settings: ${name} was not added to package.json`)
  }
  if (!existsSync(join(grown, 'plugins', 'settings', 'index.ts')))
    fail('add settings: the plugin was not copied')
  capture(npm, ['install', '--no-audit', '--no-fund'], { cwd: grown })
  capture(npm, ['run', 'check'], { cwd: grown })
  log('add settings: copied, dependencies added, installed, type-checks')
  // `add db`: the port and the SQLite provider arrive with their npm packages; the provider migrates and serves `db` to a plugin that injects it.
  const withDb = join(scratch, 'with-db')
  capture(process.execPath, [
    cli,
    'init',
    withDb,
    '--bare',
    '--name',
    'verify-db',
    '--yes',
    '--template',
    'blank',
  ])
  capture(process.execPath, [cli, 'add', 'db', '--dir', withDb])
  for (const name of ['acryl-db', 'acryl-db-sqlite'])
    if (!existsSync(join(withDb, 'plugins', name, 'src', 'index.ts')))
      fail(`add db: ${name} was not copied`)
  capture(npm, ['install', '--no-audit', '--no-fund'], { cwd: withDb })
  capture(npm, ['run', 'check'], { cwd: withDb })
  mkdirSync(join(withDb, 'migrations'), { recursive: true })
  writeFileSync(
    join(withDb, 'migrations', '001-things.sql'),
    'CREATE TABLE things (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\n',
  )
  writeFileSync(
    join(withDb, 'db-probe.ts'),
    [
      "import { Context } from '@deepseek-ai/cordis'",
      "import { join } from 'node:path'",
      "import * as sqlite from './plugins/acryl-db-sqlite/src/index.ts'",
      "import type {} from './plugins/acryl-db/src/cordis.ts'",
      'const root = new Context()',
      "root.plugin(sqlite, { path: join(process.cwd(), 'probe.sqlite'), migrations: join(process.cwd(), 'migrations') })",
      'let seen = 0',
      "root.plugin({ name: 'consumer', inject: ['db'], apply: async (ctx) => {",
      "  await ctx.db.run('INSERT INTO things (name) VALUES (?)', 'one')",
      "  seen = (await ctx.db.all('SELECT * FROM things')).length",
      '} })',
      'await new Promise((resolve) => setTimeout(resolve, 500))',
      'await root.fiber.dispose()',
      'process.exit(seen === 1 ? 0 : 1)',
      '',
    ].join('\n'),
  )
  capture(process.execPath, ['--experimental-strip-types', '--no-warnings', 'db-probe.ts'], {
    cwd: withDb,
  })
  // The dependency rule: the app as `add db` leaves it passes; a driver planted in a plugin is named by file and line.
  capture(process.execPath, [cli, 'check-deps'], { cwd: withDb })
  mkdirSync(join(withDb, 'plugins', 'things'), { recursive: true })
  writeFileSync(
    join(withDb, 'plugins', 'things', 'index.ts'),
    "export const inject = ['db']\nimport { DatabaseSync } from 'node:sqlite'\nexport { DatabaseSync }\n",
  )
  const planted = spawnSync(process.execPath, [cli, 'check-deps'], {
    cwd: withDb,
    encoding: 'utf8',
  })
  if (planted.status !== 1 || !planted.stderr.includes('plugins/things/index.ts:2:'))
    fail(`add db: check-deps did not name the planted import: ${planted.status} ${planted.stderr}`)
  rmSync(join(withDb, 'plugins', 'things'), { recursive: true, force: true })
  log(
    'add db: the port and the SQLite provider copied, installed, type-check, and a plugin that injects db reads and writes through numbered migrations',
  )
  // `add kv`: the port and the JSON-file provider arrive with their npm packages; the provider writes the file and serves `kv` to a plugin that injects it.
  const withKv = join(scratch, 'with-kv')
  capture(process.execPath, [
    cli,
    'init',
    withKv,
    '--bare',
    '--name',
    'verify-kv',
    '--yes',
    '--template',
    'blank',
  ])
  capture(process.execPath, [cli, 'add', 'kv', '--dir', withKv])
  for (const name of ['acryl-kv', 'acryl-kv-json'])
    if (!existsSync(join(withKv, 'plugins', name, 'src', 'index.ts')))
      fail(`add kv: ${name} was not copied`)
  capture(npm, ['install', '--no-audit', '--no-fund'], { cwd: withKv })
  capture(npm, ['run', 'check'], { cwd: withKv })
  writeFileSync(
    join(withKv, 'kv-probe.ts'),
    [
      "import { Context } from '@deepseek-ai/cordis'",
      "import { join } from 'node:path'",
      "import * as kvJson from './plugins/acryl-kv-json/src/index.ts'",
      "import type {} from './plugins/acryl-kv/src/cordis.ts'",
      'const root = new Context()',
      "root.plugin(kvJson, { path: join(process.cwd(), 'probe-kv.json') })",
      'let seen = 0',
      "root.plugin({ name: 'consumer', inject: ['kv'], apply: async (ctx) => {",
      "  await ctx.kv.set('theme', 'dark')",
      "  seen = await ctx.kv.update<number>('visits', (n) => (n ?? 0) + 1)",
      '} })',
      'await new Promise((resolve) => setTimeout(resolve, 500))',
      'await root.fiber.dispose()',
      'process.exit(seen === 1 ? 0 : 1)',
      '',
    ].join('\n'),
  )
  capture(process.execPath, ['--experimental-strip-types', '--no-warnings', 'kv-probe.ts'], {
    cwd: withKv,
  })
  if (!JSON.parse(readFileSync(join(withKv, 'probe-kv.json'), 'utf8')).entries.theme)
    fail('add kv: the provider did not write the file')
  log(
    'add kv: the port and the JSON-file provider copied, installed, type-check, and a plugin that injects kv reads and writes the file',
  )
  // The desktop shell (spec 018): `init --desktop` adds electron as a development dependency and a script, the app's own code never imports electron, the whole app type-checks
  // against electron's types, and the app's server starts and stops with no Electron involved (the project's own tests). The window itself is verify-desktop.mjs.
  const desktop = join(scratch, 'desktop')
  // The shell on the framework alone: the frame a desktop app installs by default is the frame gates' (verify-ide-template, verify-desktop-door).
  capture(
    process.execPath,
    [cli, 'init', desktop, '--name', 'verify-desktop', '--yes', '--template', 'todo', '--desktop'],
    { env: { ...process.env, ACRYLBLENDS_FRAME_PACKAGES: 'none' } },
  )
  const desktopPackage = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'))
  if (
    desktopPackage.devDependencies?.electron === undefined ||
    desktopPackage.dependencies?.electron !== undefined
  )
    fail('desktop: electron must be a development dependency only')
  if (!/node plugins\/desktop\/launch\.ts/.test(desktopPackage.scripts?.desktop ?? ''))
    fail('desktop: the desktop script is missing')
  if (desktopPackage.acrylblends?.desktopPath !== '/todo')
    fail('desktop: the todo window must open on /todo')
  const appSource = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? e.name === 'plugins'
          ? []
          : appSource(join(dir, e.name))
        : [join(dir, e.name)],
    )
  for (const file of appSource(join(desktop, 'src')))
    if (/from 'electron'/.test(readFileSync(file, 'utf8')))
      fail(`desktop: ${file} imports electron; only plugins/desktop may`)
  capture(npm, ['install', '--no-audit', '--no-fund'], {
    cwd: desktop,
    env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
  })
  // Electron 44 has no install script, so a plain install leaves the binary to the first `electron` run (which downloads it): nothing heavy is fetched at install, and the
  // package ships the commands that do the lazy download.
  const electronPackage = JSON.parse(
    readFileSync(join(desktop, 'node_modules', 'electron', 'package.json'), 'utf8'),
  )
  if (
    electronPackage.scripts?.postinstall !== undefined ||
    existsSync(join(desktop, 'node_modules', 'electron', 'dist'))
  )
    fail(
      'desktop: electron now installs its binary at npm install; the desktop docs and verify-desktop must change',
    )
  if (
    electronPackage.bin?.electron === undefined ||
    electronPackage.bin?.['install-electron'] === undefined
  )
    fail('desktop: electron no longer ships the electron and install-electron commands')
  capture(npm, ['run', 'check'], { cwd: desktop })
  capture(npm, ['test'], { cwd: desktop })
  log(
    'desktop: init --desktop added electron as a development dependency, only the plugin imports it, the app type-checks and its tests (the server starts and stops without Electron) pass',
  )
  // The `notes` template of create-acrylblends: a Cordis app made from the packed framework, whose own tests and type-check pass, and which takes the desktop shell
  // with one command. The window itself and the HTTP walk are the manual gates (verify-desktop.mjs, notes-probe.mjs).
  const packed = join(scratch, 'packed')
  mkdirSync(packed)
  capture('pnpm', ['pack', '--pack-destination', packed], { cwd: cliDir })
  const frameworkTarball = join(
    packed,
    readdirSync(packed).find((f) => /^acrylblends-.*\.tgz$/.test(f)) ?? '',
  )
  const clientFile = { nodejs: 'counter.tsx', notes: 'counter.tsx', chat: 'chat.tsx' }
  for (const kind of ['nodejs', 'notes', 'chat']) {
    const notes = join(scratch, kind)
    capture(
      process.execPath,
      [
        join(root, 'packages', 'create', 'bin', 'create-acrylblends.js'),
        notes,
        '--template',
        kind,
        // Only the files: this checkout's packed framework is installed next, not the release on npm.
        '--bare',
        '--no-install',
        '--no-start',
        '-y',
      ],
      { cwd: scratch },
    )
    capture(npm, ['install', frameworkTarball, '--no-audit', '--no-fund'], { cwd: notes })
    capture(npm, ['run', 'check'], { cwd: notes })
    capture(npm, ['test'], { cwd: notes })
    testsInCodexSandbox(notes, kind)
    capture(
      process.execPath,
      [join(notes, 'node_modules', 'acrylblends', 'bin', 'acrylblends.js'), 'add', 'desktop'],
      {
        cwd: notes,
      },
    )
    capture(npm, ['install', '--no-audit', '--no-fund'], {
      cwd: notes,
      env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
    })
    if (
      !existsSync(join(notes, 'plugins', 'desktop', 'main.ts')) ||
      !existsSync(join(notes, 'blend.yaml')) ||
      !existsSync(join(notes, 'plugins', 'library.json'))
    )
      fail(`${kind}: this is not a Cordis app with the desktop shell (blend.yaml, plugins/)`)
    capture(npm, ['run', 'check'], { cwd: notes })
    capture(npm, ['test'], { cwd: notes })
    // Production: the client folder is compiled once (`npm run build`); then only dist/client is served, with no compiler involved.
    capture(npm, ['run', 'build'], { cwd: notes })
    if (
      !existsSync(join(notes, 'dist', 'client', clientFile[kind])) ||
      !existsSync(join(notes, 'dist', 'client', '@acrylblends', 'jsx-dom.js'))
    )
      fail(`${kind}: npm run build did not write dist/client`)
    const production = capture(
      process.execPath,
      [
        '--import',
        './plugins/acryl-node-server/src/register.ts',
        '--input-type=module',
        '-e',
        `import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { mkdtempSync } from 'node:fs'; import { createApp } from './src/app.ts'; import { pinnedInstance, withPort } from './plugins/instance/index.ts'; const home = mkdtempSync(join(tmpdir(), 'prod-')); const app = await createApp(withPort(pinnedInstance(home, { root: process.cwd() }), 0), { database: join(home, 'x.sqlite') }); const r = await fetch(app.url + '/client/${clientFile[kind]}'); console.log(r.status, r.headers.get('content-type')); await app.stop(); process.exit(0)`,
      ],
      // The chat template is closed in production unless it is made public on purpose; this check is about the compiled client being served, so it names the chat.
      {
        cwd: notes,
        env: { ...process.env, NODE_ENV: 'production', ACRYL_PRODUCTION_KEEP: 'chat' },
      },
    )
    // The probe prints its answer last: the app's plugins may log as they start (extensions says what it found).
    const served = production.trim().split('\n').at(-1) ?? ''
    if (!/^200 .*javascript/.test(served))
      fail(`${kind}: production serving of dist/client answered ${production}`)
    // The door: the running app writes `.acryl/bin/acryl` and answers `brief`; for notes a real browser is opened and the signed-in page is read through `look`.
    {
      const port = 20000 + Math.floor(Math.random() * 20000)
      const server = spawn(npm, ['start'], {
        cwd: notes,
        env: { ...process.env, PORT: String(port) },
        stdio: 'ignore',
        // Its own process group, so stopCleanly stops npm and node together (npm alone does not pass the signal on to node on Linux).
        detached: process.platform !== 'win32',
      })
      try {
        const up = await waitForOk(`http://127.0.0.1:${port}/`)
        if (!up) fail(`${kind}: npm start did not serve for the door check`)
        // Readiness: the app's door writes its connection file and the folder shim once its carrier has bound. Wait for both (bounded), then ask
        // once: a blind retry would hide a door that never comes up.
        const doorReady = await (async () => {
          const deadline = Date.now() + 30_000
          const doorFile = join(notes, '.acryl', 'door.json')
          const doorShim = join(notes, '.acryl', 'bin', 'acryl')
          while (Date.now() < deadline) {
            if (existsSync(doorFile) && existsSync(doorShim)) return true
            await new Promise((resume) => setTimeout(resume, 100))
          }
          return false
        })()
        if (!doorReady) fail(`${kind}: the door did not report ready within 30s`)
        const brief = spawnSync(join(notes, '.acryl', 'bin', 'acryl'), ['brief'], {
          cwd: notes,
          encoding: 'utf8',
        })
        if (brief.status !== 0 || !/Verbs:/.test(brief.stdout))
          fail(`${kind}: .acryl/bin/acryl brief failed: ${brief.stdout}${brief.stderr}`)
        // The plugin verbs work in every web template: `brief` does not say they are unavailable, `plugin list` answers, and a plugin added live serves its route and is gone after `plugin remove`.
        if (/Live plugins: unavailable/.test(brief.stdout))
          fail(`${kind}: brief says the live plugin verbs are unavailable: ${brief.stdout}`)
        const doorJson = (...args) => {
          const r = spawnSync(join(notes, '.acryl', 'bin', 'acryl'), [...args, '--json'], {
            cwd: notes,
            encoding: 'utf8',
          })
          try {
            return JSON.parse(r.stdout)
          } catch {
            return fail(
              `${kind}: .acryl/bin/acryl ${args.join(' ')} answered ${r.stdout}${r.stderr}`,
            )
          }
        }
        if (!Array.isArray(doorJson('plugin', 'list')))
          fail(`${kind}: plugin list did not answer a list`)
        mkdirSync(join(notes, 'plugins', 'probe'), { recursive: true })
        writeFileSync(
          join(notes, 'plugins', 'probe', 'index.ts'),
          "import type { Context } from '@deepseek-ai/cordis'\nimport { Acryl } from 'acrylblends'\nexport const name = 'probe'\nexport const inject = ['router']\nexport function apply(ctx: Context) {\n  ctx.router.route('/', new Acryl().get('/probe-route', (c) => c.json({ probe: true })))\n}\n",
        )
        const added = doorJson('plugin', 'add', 'plugins/probe')
        if (!added.ok || added.state !== 'active')
          fail(`${kind}: plugin add plugins/probe: ${JSON.stringify(added)}`)
        const served = await fetch(`http://127.0.0.1:${port}/probe-route`)
        if (served.status !== 200)
          fail(`${kind}: the plugin added live does not serve its route (${served.status})`)
        if (!doorJson('plugin', 'remove', 'probe').ok) fail(`${kind}: plugin remove probe failed`)
        if ((await fetch(`http://127.0.0.1:${port}/probe-route`)).status !== 404)
          fail(`${kind}: the route of a removed plugin still answers`)
        rmSync(join(notes, 'plugins', 'probe'), { recursive: true, force: true })
        log(`${kind}: the door lists plugins, adds one live and removes it`)
        const ignored = spawnSync('git', ['init', '-q'], { cwd: notes })
        const staged = spawnSync('git', ['add', '-A', '--dry-run'], {
          cwd: notes,
          encoding: 'utf8',
        })
        if (ignored.status !== 0 || /\.acryl\//.test(staged.stdout))
          fail(`${kind}: git add -A would stage .acryl/: ${staged.stdout}`)
        rmSync(join(notes, '.git'), { recursive: true, force: true })
      } finally {
        // One process at a time serves a folder's door: the next start waits until this one is gone.
        await stopCleanly(server)
      }
      if (kind === 'notes') {
        const door = await probeDoor(notes, process.env, { tags: false })
        if (!door.ok) fail(`notes: the door step failed:\n${door.steps.join('\n')}`)
        if (door.skipped) log(door.steps.at(-1))
      }
    }
    // The dependency rule: a driver imported in a route file is named by file and line, and the template's own check passes without it.
    writeFileSync(
      join(notes, 'src', 'planted.ts'),
      "import { DatabaseSync } from 'node:sqlite'\nexport { DatabaseSync }\n",
    )
    const planted = spawnSync(npm, ['run', '--silent', 'check'], { cwd: notes, encoding: 'utf8' })
    rmSync(join(notes, 'src', 'planted.ts'))
    if (planted.status === 0 || !planted.stderr.includes('src/planted.ts:1:'))
      fail(`${kind}: the dependency rule did not name the planted import: ${planted.stderr}`)
    capture(npm, ['run', 'check'], { cwd: notes })
    log(
      `${kind} template: created, installed from the packed framework, type-checks, every route tested, and takes the desktop shell`,
    )
  }
  log('OK')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
