#!/usr/bin/env node
// One template, scaffolded the way a person gets it, booted inside the ACRYL frame, and driven in real Chrome:
//
//   node --import ./scripts/workspace-source.mjs scripts/verify-ide-template.mjs blank
//
// 1. `acrylblends init` into an empty folder, with ACRYLBLENDS_FRAME_PACKAGES pointing at this checkout's built ide packages as `file:` specs
//    (the bridge while the frame's client packages are unpublished), and a second init that must refuse and change nothing.
// 2. `npm install` with no registry copy of the frame packages; `npm run profile` creates the app's own DSH profile from nothing.
// 3. `npm run dev` boots the frame: every overlay row must be active (no pending, failed or "did not activate" entry), the page must render the
//    ACRYL Blends frame, the app must answer at /app, the door's page script must be on the app's page once and a door call must answer, and the
//    app's own page must fill the canvas beside the chat (mockup scenario 1: first run).
// 4. In headless Chrome, the frame's surfaces are checked against the mockup's development scenarios: first run (the app in the canvas, no DSH
//    onboarding over it), the left panel's branches and versions, the chat tab with History and the + menu, Files and Git, a terminal tab, Preview,
//    and Settings with its sections and the plugin navigator. The agent template also runs the app's own panel and its PTY routes and sends a chat
//    message through a local model; no account is driven (starting Claude is the driver gate's trust-prompt case).
// 5. It all stops and is removed; --keep leaves the scratch folder for a look.
//
// The template's page and the text it must show come from PAGES below; a template without an entry fails rather than skipping the canvas check.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packFolder } from '@webboxes/plugin-hub'
import { devtools, startChrome, stopChrome } from './lib/door-probe.mjs'
import { frameSpecsEnv } from './lib/ide-specs.mjs'
import { doorSpawn, npmSpawn } from './lib/platform.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
const template = process.argv[2] ?? 'blank'
const keep = process.argv.includes('--keep')
/** A gate may check an app it built itself (the upgrade gate): --existing <dir> skips scaffolding and checks that app in place. */
const existing =
  process.argv.indexOf('--existing') === -1
    ? undefined
    : process.argv[process.argv.indexOf('--existing') + 1]
/** Settings is another worker's surface while its registration lands; the rest of the gate still runs and the step says it was skipped. */
const skipSettings = process.env.GATE_SKIP_SETTINGS === '1'
const log = (message) => console.log(`verify-ide-template(${template}): ${message}`)
const fail = (message) => {
  throw new Error(`verify-ide-template(${template}): ${message}`)
}
/** Every file under `folder` whose bytes contain `needle`, optionally skipping paths the filter refuses. */
function filesContaining(folder, needle, include = () => true) {
  const found = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      let info
      try {
        info = statSync(path)
      } catch {
        continue
      }
      if (info.isDirectory()) {
        if (!include(`${path}${sep}`)) continue
        walk(path)
      } else if (info.size < 1024 * 1024 && include(path) && readFileSync(path).includes(needle))
        found.push(path)
    }
  }
  walk(folder)
  return found
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * Every process on the machine as pid, parent pid and name, from the platform's own tool; empty when the tool cannot answer. A gate that stops a host has
 * to know what the host started, because killing the host does not kill its grandchildren - the PTY's shell and its conhost outlive it on Windows, and the
 * shell's working folder is the app inside the gate's scratch, which then cannot be removed (EPERM after the gate printed OK, run 41560156835, 2026-11-03).
 */
function processSnapshot() {
  const run =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress',
          ],
          { encoding: 'utf8', windowsHide: true },
        )
      : spawnSync('ps', ['-eo', 'pid=,ppid=,comm='], { encoding: 'utf8' })
  if (run.status !== 0 || typeof run.stdout !== 'string' || run.stdout.trim() === '') return []
  try {
    if (process.platform === 'win32') {
      const parsed = JSON.parse(run.stdout)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      return list.map((entry) => ({
        pid: Number(entry.ProcessId),
        ppid: Number(entry.ParentProcessId),
        name: String(entry.Name ?? '?'),
      }))
    }
    return run.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => {
        const [pid, ppid, ...rest] = line.split(/\s+/u)
        return { pid: Number(pid), ppid: Number(ppid), name: rest.join(' ') || '?' }
      })
  } catch {
    return []
  }
}

/** The processes below `rootPid` in one snapshot: children, grandchildren, and so on. */
function processTree(rootPid) {
  const snapshot = processSnapshot()
  const found = []
  const queue = [rootPid]
  while (queue.length > 0) {
    const parent = queue.pop()
    for (const entry of snapshot) {
      if (entry.ppid !== parent) continue
      found.push(entry)
      queue.push(entry.pid)
    }
  }
  return found
}

const processNames = (entries) =>
  entries.length === 0 ? 'none' : entries.map((entry) => `${entry.name} (${entry.pid})`).join(', ')

/**
 * Stop a child and everything it started, and wait for all of it to be gone. The child is a process group on POSIX (spawned detached), and Windows gets
 * `taskkill /T`, which ends the tree; either way the wait is on the processes the snapshot saw, not only on the direct child, because a tree kill is
 * asynchronous and a surviving shell holds the scratch. Returns whatever outlived the kill, so the caller can name it.
 */
async function stopTree(child) {
  if (child === undefined || child === null) return []
  const watched = processTree(child.pid)
  const kill = (signal) => {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    else {
      try {
        process.kill(-child.pid, signal)
      } catch {
        child.kill(signal)
      }
    }
  }
  const exited = async () =>
    child.exitCode !== null || child.signalCode !== null ? true : undefined
  if ((await exited()) !== true) {
    kill('SIGTERM')
    if ((await until(exited, 15_000)) !== true) {
      kill('SIGKILL')
      await until(exited, 5_000)
    }
  }
  let survivors = []
  for (const bound of [15_000, 5_000]) {
    const gone = await until(async () => {
      const alive = new Set(processSnapshot().map((entry) => entry.pid))
      survivors = watched.filter((entry) => alive.has(entry.pid))
      return survivors.length === 0 ? true : undefined
    }, bound)
    if (gone === true) break
    // They are this gate's and they hold the scratch: end them by pid, then look again.
    for (const entry of survivors) {
      try {
        process.kill(entry.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
  }
  return survivors
}

async function until(fn, ms, every = 300) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await fn().catch(() => undefined)
    if (value) return value
    await sleep(every)
  }
}

/**
 * Where each template's own page lives behind the frame prefix, the text that proves it rendered, and (when the template has one) the JSON route that
 * proves its API answers there too. `blank`'s root is its JSON API; its page is /about. The agent template's root answers JSON unless the request takes a
 * page; its /settings page is the one that always renders. `notes` has no unauthenticated JSON route at the prefix, so its page is the proof.
 */
const PAGES = {
  // The blank app's root answers a page to a browser (the first tile) and JSON to an API client, like the agent template.
  blank: { path: '/app/about', text: 'About', api: { path: '/app' } },
  agent: { path: '/app/settings', text: 'Settings', panel: true, api: { path: '/app' } },
  todo: { path: '/app', text: 'Todo', api: { path: '/app/api', list: true } },
  notes: { path: '/app/login', text: 'Log in' },
  chat: { path: '/app', text: 'Chat', api: { path: '/app/health' } },
  nodejs: { path: '/app/about', text: 'About', api: { path: '/app/health' } },
}

const page = PAGES[template]
if (page === undefined) fail(`no page known for template "${template}"`)
if (!existsSync(join(root, 'packages', 'cli', 'dist', 'index.js')))
  fail('the CLI is not built (run pnpm run build)')

/** The key the chat check enters through the frame, and what the local model answers. */
const GATE_KEY = 'sk-acryl-gate-1234567890'
const GATE_MESSAGE = 'Hello from the gate'

/**
 * A local Anthropic-Messages endpoint: it records every request (headers and body) and streams a fixed reply, so the gate proves the key entered
 * through the card is the one the model request carries, without a real provider.
 */
function startMockLlm() {
  const requests = []
  const mock = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      requests.push({ url: request.url, headers: request.headers, body })
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      const send = (event, data) => {
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
      send('message_start', {
        type: 'message_start',
        message: {
          id: 'msg_gate',
          type: 'message',
          role: 'assistant',
          model: 'deepseek-chat',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      })
      send('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      })
      send('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'pong from the mock' },
      })
      // ACRYL_GATE_STREAM_MS holds the answer open, so a run is still streaming when the next step presses something (the Settings-during-a-run
      // reproduction). Zero by default: the gate's own runs stay as fast as before.
      const streamDelayMs = Number(process.env.ACRYL_GATE_STREAM_MS ?? 0)
      const finish = () => {
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 4 },
        })
        send('message_stop', { type: 'message_stop' })
        response.end()
      }
      if (Number.isFinite(streamDelayMs) && streamDelayMs > 0) setTimeout(finish, streamDelayMs)
      else finish()
    })
  })
  return new Promise((done) => {
    mock.listen(0, '127.0.0.1', () => {
      done({
        url: `http://127.0.0.1:${String(mock.address().port)}`,
        requests,
        close: () =>
          new Promise((closed) => {
            // A keep-alive socket from the driver can outlive the last answer; closing only the listener would wait for it forever, and the gate
            // would print OK and never exit.
            mock.closeAllConnections()
            mock.close(() => {
              closed()
            })
          }),
      })
    })
  })
}

const DSH_VERSION = process.env.IDE_PROFILE_DSH_VERSION ?? '0.2.0-rc.2'

const scratch = mkdtempSync(join(tmpdir(), `ide-template-${template}-`))
const app = existing === undefined ? join(scratch, `${template}-app`) : resolve(existing)
let server
let mock
/** The gate's own failure, kept so cleanup trouble is reported beside it instead of replacing it in the runner's log. */
let failure
/** Cleanup trouble of its own, thrown only when the gate itself passed. */
let cleanupError
try {
  const env = {
    ...process.env,
    ACRYLBLENDS_FRAME_PACKAGES: frameSpecsEnv(root, { dshVersion: DSH_VERSION }),
  }
  if (existing === undefined) {
    const init = spawnSync(
      process.execPath,
      [cli, 'init', app, '--name', `${template}-app`, '--template', template, '--yes', '--no-next'],
      { encoding: 'utf8', env },
    )
    if (init.status !== 0)
      fail(`init failed (exit ${String(init.status)}):\n${init.stdout}${init.stderr}`)
    const overlay = readFileSync(join(app, 'cordis.patch.yml'), 'utf8')
    // The page's root is the Blends frame (`acryl-blends-frame`), not the IDE's workbench (`acryl-workspace`): the frame lists the branches, versions
    // and the app; the workbench comes in as the frame's dependency, not as a row of its own.
    for (const row of [
      '- id: app-routes',
      'name: ./src/frame.ts',
      'name: ./plugins/acryl-door/src/index.ts',
      'name: acryl-app-shell',
      'name: acryl-blends-frame',
    ])
      if (!overlay.includes(row)) fail(`the generated overlay is missing ${JSON.stringify(row)}`)
    const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    const dev = String(manifest.scripts?.dev ?? '')
    if (dev !== 'node --import ./plugins/acryl-node-server/src/register.ts scripts/ide-host.mjs')
      fail(`the app's dev script does not boot the host launcher: ${dev}`)
    if (!existsSync(join(app, 'scripts', 'ide-host.mjs')))
      fail('the generated launcher scripts/ide-host.mjs is missing')
    const again = spawnSync(
      process.execPath,
      [cli, 'init', app, '--name', `${template}-app`, '--template', template, '--yes', '--no-next'],
      { encoding: 'utf8', env },
    )
    if (again.status === 0) fail('a second init did not refuse')
    log('scaffolded through the CLI with the frame specs; a second init refused')
  } else {
    for (const file of ['cordis.patch.yml', 'scripts/ide-host.mjs', 'frame/app-plugins.mjs'])
      if (!existsSync(join(app, file))) fail(`the app given to --existing has no ${file}`)
    log(`checking the app at ${app} (--existing)`)
  }

  if (template === 'blank' || template === 'agent') {
    // The collective app (spec 049 T024): the group's plugins come in with one list, and the showcase page shows them.
    const add = spawnSync(process.execPath, [cli, 'add', 'showcase'], {
      cwd: app,
      encoding: 'utf8',
      env,
    })
    if (add.status !== 0)
      fail(`add showcase failed (exit ${String(add.status)}):\n${add.stdout}${add.stderr}`)
    if (
      !/- id: plugin-share\r?\n\s+name: plugin-share\r?\n\s+- id: showcase\r?\n/u.test(
        readFileSync(join(app, 'blend.yaml'), 'utf8'),
      )
    )
      fail('add did not mount the showcase row right after plugin-share in blend.yaml')
    log('the showcase is added, after plugin-share')
  }

  if (page.panel === true) {
    // The PTY driver is the second app row that serves its own routes: it must live under the app's mount too, and the terminal gate runs `node`
    // itself, so the assertion does not depend on which coding agents are installed on the machine.
    const add = spawnSync(process.execPath, [cli, 'add', 'driver-pty'], {
      cwd: app,
      encoding: 'utf8',
      env,
    })
    if (add.status !== 0)
      fail(`add driver-pty failed (exit ${String(add.status)}):\n${add.stdout}${add.stderr}`)
    const blendFile = join(app, 'blend.yaml')
    const blend = readFileSync(blendFile, 'utf8')
    const configured = blend.replace(
      '    - id: driver-pty\n      name: driver-pty\n',
      '    - id: driver-pty\n      name: driver-pty\n      config:\n        programs:\n          node: []\n',
    )
    if (configured === blend) fail('add did not mount the driver-pty row in blend.yaml')
    writeFileSync(blendFile, configured)
    log('the panel and the PTY driver are added, with node as the terminal program')
  }

  const npm = npmSpawn()
  const install = spawnSync(npm.command, ['install', '--no-audit', '--no-fund'], {
    cwd: app,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'error' },
    ...npm.options,
  })
  if (install.status !== 0)
    fail(`npm install failed:
${install.stdout}${install.stderr}`)
  log('installed the framework, the DSH driver and the frame packages')

  const bootEnv = {
    ...process.env,
    ACRYLBLENDS_HOME: join(app, '.acrylblends'),
    // DSH's own home is the app's home too; the launcher sets it in-process, and the environment covers the modules that read it at import.
    DSH_HOME: join(app, '.acrylblends'),
    // Any free port: the gate may share the machine with a person's frame or another worker's run.
    ACRYLBLENDS_PORT: '0',
  }
  // The chat's model is a local Anthropic-Messages mock: the gate proves the key entered through the card is used, without a real provider.
  mock = await startMockLlm()
  bootEnv.DEEPSEEK_BASE_URL = mock.url
  // The composition gate first: every row active, none pending, no DSH web row, a provider removed/restored and two reloads clean.
  const composition = spawnSync(
    process.execPath,
    ['--import', './plugins/acryl-node-server/src/register.ts', 'scripts/ide-host.mjs', '--check'],
    { cwd: app, encoding: 'utf8', env: bootEnv },
  )
  if (composition.status !== 0)
    fail(`the composition check failed:
${composition.stdout}${composition.stderr}`)
  if (!/every row active \(\d+ rows\), no DSH web row mounted/u.test(composition.stdout))
    fail(`the composition check did not report every row active with no DSH web row:
${composition.stdout}`)
  if (
    !/PENDING on provider removal, active on restore, two reloads clean/u.test(composition.stdout)
  )
    fail(`the composition lifecycle check did not pass:
${composition.stdout}`)
  log(
    'composition: every row active, no DSH web row, PENDING on provider removal and active on restore, two reloads clean',
  )

  // The launcher the app's `dev` script names, run with this Node. Through npm on Windows the child would sit under cmd.exe, and stopping the gate would
  // leave it running; this is the same command the script asserts above.
  let output = ''
  let serverUrl
  const startServer = async () => {
    const from = output.length
    server = spawn(
      process.execPath,
      ['--import', './plugins/acryl-node-server/src/register.ts', 'scripts/ide-host.mjs'],
      {
        cwd: app,
        env: bootEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Its own process group on POSIX, so a stop reaches the PTYs the host starts as well as the host (see stopTree). Windows uses taskkill /T.
        detached: process.platform !== 'win32',
      },
    )
    server.stdout.on('data', (chunk) => (output += chunk))
    server.stderr.on('data', (chunk) => (output += chunk))
    const found = await until(
      async () => /(http:\/\/127\.0\.0\.1:\d+\/?\?token=\S*)/u.exec(output.slice(from))?.[1],
      180_000,
    )
    if (!found) fail(`the app did not print a tokenized URL:\n${output}`)
    serverUrl = found
    return found
  }
  const stopServer = async () => {
    if (server === null || server === undefined) return
    // The whole tree, waited for, not only the host: the PTY's shell outlives a killed host on Windows and goes on holding the app folder.
    const started = processTree(server.pid)
    const survivors = await stopTree(server)
    if (survivors.length > 0)
      fail(
        `the host stopped, but processes it started are still running: ${processNames(survivors)} (at the stop: ${processNames(started)})`,
      )
    const port = new URL(serverUrl).port
    // Windows has no lsof: the processes watched above are the check that matters there, and the helper must not crash on a missing tool.
    const holder = () => {
      const found = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
        encoding: 'utf8',
      })
      return typeof found.stdout === 'string' ? found.stdout.trim() : ''
    }
    if (holder() !== '') process.kill(Number(holder()), 'SIGKILL')
    const freed = await until(async () => (holder() === '' ? true : undefined), 15_000)
    if (freed !== true) fail(`port ${port} stayed held after stopping the host`)
  }

  const url = await startServer()
  log(`the frame boots on our host at ${url}`)

  const origin = new URL(url).origin

  const jar = join(scratch, 'cookies.txt')
  const fetchPage = (target, into) =>
    spawnSync('curl', ['-sL', '-b', jar, '-c', jar, '-o', into, '-w', '%{http_code}', target], {
      encoding: 'utf8',
    })
  const pageHtml = join(scratch, 'page.html')
  const status = await until(async () => {
    const curl = fetchPage(url, pageHtml)
    const code = Number(curl.stdout)
    return code > 0 && code < 400 ? code : undefined
  }, 30_000)
  if (status === undefined)
    fail(`the page did not answer at ${url}; server said:\n${output.slice(-2500)}`)
  // The page is ours: our title and the client-module boot wire (rendered as the webServer index-injection rows).
  if (!readFileSync(pageHtml, 'utf8').includes('__DSH_BOOT__'))
    fail('the page does not carry the client-module boot wire')
  const html = readFileSync(pageHtml, 'utf8')
  // Every script the page copies from the frontend is closed. An unclosed entry script turns the tags after it (the stylesheet links) into its text:
  // DSH's component stylesheet never loads, and the frame draws its dialogs and buttons with browser defaults. The string check fails here, before a
  // browser can hide the cause.
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=[^>]*>/gu)) {
    const after = html.slice(match.index + match[0].length)
    if (!after.trimStart().startsWith('</script>'))
      fail(
        `the page's script tag ${match[0]} is not closed; the tags after it would be swallowed as its text`,
      )
  }
  if (!html.includes('acryl-blends-frame/client.js'))
    fail(`the page does not load the frame's client; server said:\n${output.slice(-2500)}`)
  // The door drives the app's page, never the frame around it (its row is generated with `hostIndex: false`), so the frame's own page must not carry
  // the script; the app's page carries it once (checked below). A copy here would make an agent's navigate leave the frame.
  const tags = html.split('/api/acryl-door/page.js').length - 1
  if (tags !== 0)
    fail(`the frame page carries the door script ${String(tags)} times, expected none`)
  log("the page loads the frame's client and leaves the app's page to the door")

  // The app answers at its prefix: its API route when the template has one (blank's and the agent's root, todo's list, the chat's and nodejs' health
  // route). Retried, because the app's rows mount a moment after the launcher prints its URL.
  if (page.api !== undefined) {
    const apiFile = join(scratch, 'app-api.json')
    const appApi = await until(async () => {
      const code = Number(
        spawnSync(
          'curl',
          ['-sL', '-o', apiFile, '-w', '%{http_code}', `${origin}${page.api.path}`],
          {
            encoding: 'utf8',
          },
        ).stdout,
      )
      if (code !== 200) return undefined
      const parsed = JSON.parse(readFileSync(apiFile, 'utf8'))
      if (page.api.list === true) return Array.isArray(parsed) ? parsed : undefined
      return parsed?.ok === true ? parsed : undefined
    }, 30_000)
    if (appApi === undefined)
      fail(`the app did not answer at ${page.api.path}; server said:\n${output.slice(-2500)}`)
    log(`the app answers at ${page.api.path}: ${JSON.stringify(appApi).slice(0, 200)}`)
  }

  const brief = await until(async () => {
    const shim = doorSpawn(app)
    const door = spawnSync(shim.command, ['brief', '--json'], {
      cwd: app,
      encoding: 'utf8',
      ...shim.options,
    })
    return door.status === 0 ? door : undefined
  }, 30_000)
  if (brief === undefined) fail('a door call did not answer within 30s')
  log('a door call answers')

  // One framework copy: the frame packages' middleware runs on the router of the host that serves it. With two copies (the frame linked from the
  // checkout, the framework from npm) a known private path asked with another method found no match result and answered 500 instead of 405.
  const wrongMethod = spawnSync(
    'curl',
    ['-s', '-o', '/dev/null', '-D', '-', '-X', 'POST', `${origin}/api/acryl-support/diagnostics`],
    { encoding: 'utf8' },
  ).stdout
  if (!/^HTTP\/[\d.]+ 405\b/mu.test(wrongMethod) || !/^allow: .*\bGET\b/imu.test(wrongMethod))
    fail(
      `POST to a GET-only private route did not answer 405 with its Allow:\n${wrongMethod}\nserver said:\n${output.slice(-2500)}`,
    )
  log('a private route asked with another method answers 405 with its Allow')

  // The app's own page answers directly, so a tile failure is never the app's own route.
  const directFile = join(scratch, 'direct.html')
  const direct = await until(async () => {
    const code = Number(
      spawnSync('curl', ['-sL', '-o', directFile, '-w', '%{http_code}', `${origin}${page.path}`], {
        encoding: 'utf8',
      }).stdout,
    )
    if (code !== 200) return undefined
    return readFileSync(directFile, 'utf8').includes(page.text) ? true : undefined
  }, 30_000)
  if (direct !== true)
    fail(
      `the app's page at ${page.path} did not show "${page.text}"; server said:\n${output.slice(-2500)}`,
    )
  // The page an agent drives inside the canvas carries the door's one script tag; an extra copy would drive the page twice.
  const appTags = readFileSync(directFile, 'utf8').split('/api/acryl-door/page.js').length - 1
  if (appTags !== 1)
    fail(`the app's page carries the door script ${String(appTags)} times, expected once`)
  log(`the app's page answers at ${page.path} and carries the door script once`)

  // The frame's look, for the workshop's agent template: three day-one states at one fixed viewport, captured here and compared with the committed
  // baseline at 2%. The compare runs only on Linux CI, where the runner's fonts are fixed; macOS and Windows keep the structural assertions (a cross-OS
  // pixel gate would fail on font rendering, not on the product). FRAME_VISUAL_CAPTURE names a folder to write the states into instead: the baseline is
  // regenerated that way on the Linux runner and approved before it is committed.
  if (template === 'agent') {
    const views = 'frame,settings-models,right-panel-open'
    const viewsFile = join(root, 'scripts', 'frame-views-frame.json')
    const captureTo = process.env.FRAME_VISUAL_CAPTURE
    if (captureTo !== undefined && captureTo !== '') {
      const shot = spawnSync(
        process.execPath,
        [
          join(root, 'scripts', 'frame-compare.mjs'),
          'capture',
          serverUrl,
          captureTo,
          '--views',
          views,
          '--views-file',
          viewsFile,
        ],
        { encoding: 'utf8' },
      )
      if (shot.status !== 0)
        fail(
          `the frame's visual states did not capture (exit ${String(shot.status)}):\n${shot.stdout ?? ''}${shot.stderr ?? ''}`,
        )
      log(`the frame's visual states are captured in ${captureTo}`)
    }
    if (process.env.FRAME_VISUAL === '1' && process.platform === 'linux') {
      const baseline = join(root, 'scripts', 'frame-reference-frame')
      if (!existsSync(baseline))
        fail(
          'the frame visual baseline is missing (scripts/frame-reference-frame); capture it on this runner first',
        )
      const looks = spawnSync(
        process.execPath,
        [
          join(root, 'scripts', 'frame-compare.mjs'),
          'check',
          baseline,
          serverUrl,
          join(scratch, 'frame-visual'),
          '--views',
          views,
          '--views-file',
          viewsFile,
        ],
        { encoding: 'utf8' },
      )
      if (looks.status !== 0)
        fail(
          `the frame does not match its visual baseline (exit ${String(looks.status)}):\n${looks.stdout ?? ''}${looks.stderr ?? ''}`,
        )
      log('the frame matches its visual baseline at 1440x900 within 2%')
    }
  }

  // The session banner check needs the same host back on the same origin: the page's cookie is gone, the connection cannot recover, and the frame
  // must say so instead of spinning.
  const restartSamePort = async () => {
    const held = new URL(serverUrl).port
    await stopServer()
    bootEnv.ACRYLBLENDS_PORT = held
    return await startServer()
  }
  await checkTileInBrowser(url, origin, jar, page, output, mock, restartSamePort)
  if (template !== 'todo') await checkFramedPull(app, origin, jar)
  if (template === 'blank' || template === 'agent') await checkCollectiveApp(app, origin, jar)
  // The frame's stable launch token end to end (119): verify-frame-token boots this app twice on its own port and asserts the same address after the
  // restart, that the address admits the page (303 and the cookie) and that the cookie admits the frame's WebSocket.
  await stopServer()
  const frameToken = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'verify-frame-token.mjs'), app],
    {
      encoding: 'utf8',
      env: { ...process.env, ...bootEnv, ACRYLBLENDS_PORT: '' },
      // The step boots two apps and has its own watchdog; a child that still hangs must fail this gate with a name instead of holding the job until
      // its timeout (the Ubuntu runner once sat here for over forty minutes, 2026-11-02).
      timeout: 720_000,
    },
  )
  if (frameToken.status !== 0)
    fail(
      `verify-frame-token failed (exit ${String(frameToken.status)}${frameToken.error === undefined ? '' : `: ${frameToken.error.message}`}):\n${frameToken.stdout ?? ''}${frameToken.stderr ?? ''}`,
    )
  log('verify-frame-token: the same address after a restart admits the page and its WebSocket')
  // The owner's rule: the key lives only in DSH's own store, never in the page or the app folder.
  const keyFiles = filesContaining(bootEnv.ACRYLBLENDS_HOME, GATE_KEY)
  if (keyFiles.length === 0) fail('the host did not store the key in its own home')
  const appFiles = filesContaining(
    app,
    GATE_KEY,
    (file) => !file.includes(`${sep}.acrylblends${sep}`),
  )
  if (appFiles.length > 0) fail(`the key reached the app folder: ${appFiles.join(', ')}`)
  // The profile slice's ownership rule: the manifest, the settings document and the composition bundle are files of the profile; the key belongs in none.
  const profileFiles = [
    'package.json',
    'settings.patch.yml',
    join('node_modules', 'acrylblends-frame', 'package.json'),
    join('node_modules', 'acrylblends-frame', 'cordis.patch.yml'),
  ]
  for (const file of profileFiles) {
    const path = join(bootEnv.ACRYLBLENDS_HOME, file)
    if (!existsSync(path)) fail(`the host profile has no ${file}`)
    if (readFileSync(path, 'utf8').includes(GATE_KEY))
      fail(`the key reached the profile file ${file}`)
  }
  log(
    `the key is in the host's own store (${keyFiles.map((file) => relative(bootEnv.ACRYLBLENDS_HOME, file)).join(', ')}) and in no profile file, patch file or app file`,
  )
  log('OK')
} catch (error) {
  failure = error
} finally {
  if (mock !== undefined) await mock.close()
  // What the host started, named before it is stopped: a survivor is what holds the scratch folder open on Windows.
  const started = server === null || server === undefined ? [] : processTree(server.pid)
  if (started.length > 0)
    log(`the host started ${String(started.length)} process(es): ${processNames(started)}`)
  const survivors = await stopTree(server)
  if (keep) console.error(`verify-ide-template: kept ${scratch}`)
  else {
    // Windows releases a process's handles asynchronously after it ends: the bounded retries cover that delay. A folder that is still held fails with the
    // processes that outlived the host named, instead of a bare EPERM with nothing to look for.
    try {
      rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    } catch (error) {
      const detail = `the scratch ${scratch} could not be removed (${error instanceof Error ? error.message : String(error)}); processes that outlived the host: ${processNames(survivors)}; the gate's own children now: ${processNames(processTree(process.pid))}`
      // Decided after the block, never thrown from it: a throw here would replace the gate's own failure in the runner's log.
      if (failure === undefined)
        cleanupError = new Error(`verify-ide-template(${template}): ${detail}`)
      else console.error(`verify-ide-template(${template}): ${detail}`)
    }
  }
}
if (failure !== undefined) throw failure
if (cleanupError !== undefined) throw cleanupError

/** The cookies curl was given by the token URL, in the shape the DevTools protocol sets on a browser. */
function cookiesOf(jar) {
  const cookies = []
  for (const line of readFileSync(jar, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    const httpOnly = line.startsWith('#HttpOnly_')
    const body = httpOnly ? line.slice('#HttpOnly_'.length) : line
    if (body.startsWith('#')) continue
    const [domain, , path, secure, , name, value] = body.split('\t')
    if (name === undefined || value === undefined) continue
    cookies.push({ name, value, domain, path, secure: secure === 'TRUE', httpOnly })
  }
  return cookies
}

/** React ignores a plain `input.value = ...`; the native setter plus an input event is what typing does. A function declaration: the gate's top-level try runs before the consts below it. */
function setInputValue(selector, value) {
  return `(() => {
  const input = document.querySelector(${JSON.stringify(selector)})
  if (input === null) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`
}

/** The frame's reload view: its seq moves on each time the frame loads the app's code again (spec 049 T022). Read as the page reads it. */
function frameReloadSeq(origin, jar) {
  const read = spawnSync(
    'curl',
    [
      '-s',
      '-b',
      jar,
      '-H',
      'Sec-Fetch-Site: same-origin',
      '-H',
      `Origin: ${origin}`,
      `${origin}/api/acryl-blends-frame/app`,
    ],
    { encoding: 'utf8' },
  )
  const view = JSON.parse(read.stdout || '{}')
  if (!Number.isInteger(view.seq)) fail(`the frame's reload view is not readable: ${read.stdout}`)
  return view.seq
}

/**
 * The pull line a person copies, in the app as the frame runs it: the door row is the host's and the app's rows are in their own realm, so the line reaches
 * plugin-share only if the overlay lets it, and the plugin's own check finds its route only under the canvas prefix. A wrong digest fails and installs nothing.
 */
async function checkFramedPull(app, origin, jar) {
  const name = 'gate-pull'
  // What the host reported for a door verb that threw: the door answers only "the verb could not be run", the cause is in the app's error log.
  const reported = () => {
    const logs = join(app, '.acrylblends', 'logs')
    const lines = existsSync(logs)
      ? readdirSync(logs)
          .filter((file) => file.endsWith('.error.log'))
          .flatMap((file) => readFileSync(join(logs, file), 'utf8').split(/\r?\n/u))
          .filter((entry) => entry.includes('acryl-door: failed'))
      : []
    return lines.length === 0 ? '' : `\nthe host reported:\n${lines.slice(-5).join('\n')}`
  }
  const tarball = releaseServing(app, name, '/gate-pull')
  const npm = npmSpawn()
  const door = (...args) =>
    spawnSync(npm.command, ['run', '--silent', 'acryl', '--', 'plugin', ...args], {
      cwd: app,
      encoding: 'utf8',
      ...npm.options,
    })
  const line = (input) => door('pull', input)
  const answers = async (path) => (await fetch(`${origin}/app${path}`)).text()
  const reloadSeq = () => frameReloadSeq(origin, jar)
  const before = reloadSeq()

  // A pull that fails: a wrong digest is refused and leaves nothing.
  const refused = line(`${tarball}@sha256:${'0'.repeat(64)}`)
  if (refused.status !== 1 || !refused.stderr.includes('different bytes'))
    fail(`a wrong digest was not refused in the frame:\n${refused.stdout}${refused.stderr}`)
  if (existsSync(join(app, 'plugins', name))) fail('a refused pull left its folder in the app')
  // Pulls in a row, no retry: from a local file (which blend.yaml does not remember), from GitHub, and a local one again.
  const pulled = line(tarball)
  if (pulled.status !== 0)
    fail(`the pull line failed in the frame:\n${pulled.stdout}${pulled.stderr}${reported()}`)
  if (!(await answers('/gate-pull')).includes('gate-pull'))
    fail('the pulled plugin does not answer at /app/gate-pull')
  // A release on GitHub, pulled by its https address: remembered in blend.yaml, as a github: pull is. The address, not github:, keeps the gate off
  // api.github.com's anonymous rate limit on shared CI runners; github: sources are covered by plugin-share's tests.
  const POMODORO =
    'https://github.com/inboxxobni/acrylblends-pomodoro/releases/download/v0.1.0/acrylblends-pomodoro-0.1.0.tgz'
  // Offline, a local run skips this one pull and says so; CI never does: a runner that cannot reach github.com fails here.
  const online = await fetch('https://github.com/', {
    method: 'HEAD',
    signal: AbortSignal.timeout(15_000),
  }).then(
    () => true,
    () => false,
  )
  if (!online && process.env.CI)
    fail('CI cannot reach github.com, so the pull of a GitHub release was not checked')
  if (online) {
    const fromGitHub = line(POMODORO)
    if (fromGitHub.status !== 0)
      fail(
        `a pull from GitHub failed in the frame:\n${fromGitHub.stdout}${fromGitHub.stderr}${reported()}`,
      )
    if (!(await answers('/pomodoro')).includes('minutes'))
      fail('the plugin pulled from GitHub does not answer at /app/pomodoro')
  } else
    log(
      'SKIPPED: GitHub pull, no network - the pull of a GitHub release by its address and its author in the list were not checked',
    )
  const second = line(releaseServing(app, 'gate-two', '/gate-two'))
  if (second.status !== 0)
    fail(
      `a pull right after another failed in the frame:\n${second.stdout}${second.stderr}${reported()}`,
    )
  if (
    !(await answers('/gate-pull')).includes('gate-pull') ||
    !(await answers('/gate-two')).includes('gate-two')
  )
    fail('after pulls in a row the pulled plugins do not all answer')
  // The door lists and removes plugins in the frame too, through plugin-share (spec 049 T021): the frame's host reaches no extensions of its own.
  const listed = door('list', '--json')
  const plugins = listed.status === 0 ? JSON.parse(listed.stdout) : []
  const names = plugins.map((plugin) => plugin.name)
  if (
    !names.includes(name) ||
    !names.includes('gate-two') ||
    (online && !names.includes('acrylblends-pomodoro'))
  )
    fail(
      `plugin list in the frame does not name the pulls:\n${listed.stdout}${listed.stderr}${reported()}`,
    )
  if (online) {
    const pomodoro = plugins.find((plugin) => plugin.name === 'acrylblends-pomodoro')
    if (pomodoro?.pulledFrom !== POMODORO || pomodoro.author !== 'inboxxobni')
      fail(`plugin list does not say where the GitHub pull came from: ${JSON.stringify(pomodoro)}`)
  }
  const removed = door('remove', 'gate-two')
  if (removed.status !== 0)
    fail(`plugin remove failed in the frame:\n${removed.stdout}${removed.stderr}`)
  const afterRemove = await answers('/gate-two')
  if (afterRemove.includes('"from":"gate-two"'))
    fail(
      `after plugin remove /app/gate-two still answers the removed plugin (${afterRemove}); the remove said:\n${removed.stdout}${removed.stderr}${reported()}`,
    )
  if (existsSync(join(app, 'plugins', 'gate-two')))
    fail('plugin remove left the folder of an untouched pull')
  // A second person's plugin on the same route, another pull that fails: refused with the first one's name, and the route still answers the first (T025).
  const clash = line(releaseServing(app, 'gate-clash', '/gate-pull'))
  if (clash.status !== 1 || !clash.stderr.includes('GET /gate-pull is already served by gate-pull'))
    fail(
      `a plugin whose route is taken was not refused in the frame:\n${clash.stdout}${clash.stderr}`,
    )
  if (existsSync(join(app, 'plugins', 'gate-clash')))
    fail('a refused pull left its folder in the app')
  if (!(await answers('/gate-pull')).includes('gate-pull'))
    fail('after the refused clash /app/gate-pull does not answer the first plugin')
  // Past the watcher's debounce: none of that loaded the app's code again.
  await new Promise((done) => setTimeout(done, 1500))
  const after = reloadSeq()
  if (after !== before)
    fail(
      `the frame loaded the app again during the pulls (reload seq ${String(before)} -> ${String(after)})`,
    )
  // An agent editing a pulled plugin: that is a change of the app's code, so the frame loads it again and the edit answers.
  const source = join(app, 'plugins', name, 'index.ts')
  writeFileSync(
    source,
    readFileSync(source, 'utf8').replace(
      "c.json({ from: 'gate-pull' })",
      "c.json({ from: 'gate-pull', edited: true })",
    ),
  )
  const edited = await until(
    async () =>
      (await answers('/gate-pull').catch(() => '')).includes('"edited":true') ? true : undefined,
    60_000,
  )
  if (edited !== true) fail('an edit to a pulled plugin was not loaded again')
  if (reloadSeq() === after)
    fail('an edit to a pulled plugin answered without the frame loading the app again')
  log(
    'the pull line works in the frame: pulls from a local file and from GitHub, and two that fail, load nothing again; list names where each pull came from, remove takes an untouched pull; a taken route is refused naming its plugin; an edit to a pulled plugin loads the app again',
  )
}

/** A tool plugin's release: `tool.json` with examples the install runs in the sandbox, and the tool's `run`. */
function releaseTool(app, name) {
  const source = join(app, '..', `${name}-source`)
  mkdirSync(source, { recursive: true })
  writeFileSync(
    join(source, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      keywords: ['cordis-plugin', 'acrylblends'],
    }),
  )
  writeFileSync(
    join(source, 'tool.json'),
    JSON.stringify({
      description: 'Counts the words of a text.',
      examples: [{ input: { text: 'one app' }, output: { words: 2 } }],
    }),
  )
  writeFileSync(
    join(source, 'index.ts'),
    'export function run(input: { text: string }) {\n  return { words: input.text.trim().split(/\\s+/u).length }\n}\n',
  )
  const tarball = join(app, '..', `${name}-1.0.0.tgz`)
  writeFileSync(tarball, packFolder(source).tarball)
  return tarball
}

/** A plugin release that puts a widget on the home page, with a check that finds it there. */
function releaseWidget(app, name) {
  const source = join(app, '..', `${name}-source`)
  mkdirSync(source, { recursive: true })
  writeFileSync(
    join(source, 'package.json'),
    JSON.stringify({
      name,
      version: '2.1.0',
      type: 'module',
      keywords: ['cordis-plugin', 'acrylblends'],
    }),
  )
  writeFileSync(
    join(source, 'index.ts'),
    `export const name = '${name}'
export const inject = ['home']
export function apply(ctx) {
  ctx.effect(() => ctx.home.widget({ id: '${name}', title: 'From ${name}', render: () => '<p>${name} says hello</p>' }))
}
export async function check(ctx) {
  if (!ctx.home.widgets().some((widget) => widget.id === '${name}')) throw new Error('the widget is not on the home page')
}
`,
  )
  const tarball = join(app, '..', `${name}-2.1.0.tgz`)
  writeFileSync(tarball, packFolder(source).tarball)
  return tarball
}

/**
 * The collective app (spec 049 T024): a group's list pulled in one command into the app as the frame runs it. Each source is pulled on its own, so a
 * route clash and a wrong digest are refused by name while the others come in; the showcase lists every plugin with where it came from, its links open,
 * and an open showcase page follows a removal live. The frame loads nothing again throughout, so the canvas never shows a reload or a 404.
 */
async function checkCollectiveApp(app, origin, jar) {
  // The agent template runs the app's agent tools, so its group list carries a tool too; blank has the widgets and no tools.
  const withTool = template === 'agent'
  const npm = npmSpawn()
  const door = (...args) =>
    spawnSync(npm.command, ['run', '--silent', 'acryl', '--', 'plugin', ...args], {
      cwd: app,
      encoding: 'utf8',
      ...npm.options,
    })
  // As a browser asks: blank's root answers JSON to an API client and its page, with the widgets, to a browser.
  const answer = async (path) => {
    const response = await fetch(`${origin}/app${path}`, { headers: { accept: 'text/html,*/*' } })
    return { status: response.status, text: await response.text() }
  }
  const before = frameReloadSeq(origin, jar)
  const route = releaseServing(app, 'group-route', '/group-route')
  const widget = releaseWidget(app, 'group-widget')
  const clash = releaseServing(app, 'group-clash', '/group-route')
  const late = releaseServing(app, 'group-late', '/group-late')
  const tool = withTool ? releaseTool(app, 'group-tool') : undefined
  const POMODORO =
    'https://github.com/inboxxobni/acrylblends-pomodoro/releases/download/v0.1.0/acrylblends-pomodoro-0.1.0.tgz'
  const online = existsSync(join(app, 'plugins', 'acrylblends-pomodoro'))
  // As a group keeps it: a comment, a line pasted as `plugin publish` prints it, a blank line, CRLF.
  writeFileSync(
    join(app, 'group.txt'),
    [
      '# our group, one plugin each',
      route,
      `npm run acryl -- plugin pull ${widget}`,
      '',
      `${clash}   # ana's: takes /group-route too`,
      `${late}@sha256:${'0'.repeat(64)}`,
      ...(tool === undefined ? [] : [tool]),
      ...(online ? [POMODORO] : []),
    ].join('\r\n'),
  )
  const pulled = door('pull', '--from', 'group.txt')
  const said = `${pulled.stdout}${pulled.stderr}`
  if (pulled.status !== 1)
    fail(
      `a list with two refused sources did not fail the command (exit ${String(pulled.status)}):\n${said}`,
    )
  const total = 4 + (online ? 1 : 0) + (tool === undefined ? 0 : 1)
  for (const expected of [
    `${String(total - 2)} of ${String(total)} from group.txt pulled; 2 refused, the others are in and running.`,
    `${route}: installed group-route`,
    `${widget}: installed group-widget`,
    `${clash}: refused: GET /group-route is already served by group-route`,
    'different bytes',
    ...(tool === undefined ? [] : [`${tool}: installed group-tool`]),
    ...(online ? [`${POMODORO}: unchanged acrylblends-pomodoro`] : []),
  ])
    if (!said.includes(expected))
      fail(`the list pull did not say ${JSON.stringify(expected)}:\n${said}`)
  for (const refused of ['group-clash', 'group-late'])
    if (existsSync(join(app, 'plugins', refused)))
      fail(`the refused ${refused} left its folder in the app`)
  if (!(await answer('/group-route')).text.includes('group-route'))
    fail('group-route does not answer at /app/group-route')
  const home = await answer('')
  if (!home.text.includes('group-widget says hello'))
    fail(`the home page does not show group-widget's widget:\n${home.text.slice(0, 600)}`)

  // The showcase: a card for each plugin with its author, release and links; every link opens.
  const listed = await answer('/showcase/plugins')
  if (listed.status !== 200) {
    const logs = join(app, '.acrylblends', 'logs')
    const errors = existsSync(logs)
      ? readdirSync(logs)
          .filter((file) => file.endsWith('.log'))
          .map((file) =>
            readFileSync(join(logs, file), 'utf8').split(/\r?\n/u).slice(-30).join('\n'),
          )
          .join('\n')
      : '(no logs)'
    fail(
      `the showcase's list answers ${String(listed.status)}: ${listed.text.slice(0, 300)}\nthe app's logs end with:\n${errors}`,
    )
  }
  const cards = JSON.parse(listed.text)
  const card = (name) => cards.find((entry) => entry.name === name)
  const expectCard = (name, fields) => {
    const found = card(name)
    for (const [key, value] of Object.entries(fields))
      if (JSON.stringify(found?.[key]) !== JSON.stringify(value))
        fail(
          `the showcase card of ${name} has ${key} ${JSON.stringify(found?.[key])}, expected ${JSON.stringify(value)}: ${JSON.stringify(found)}`,
        )
  }
  expectCard('group-route', {
    version: '1.0.0',
    state: 'active',
    pages: ['/group-route'],
    widget: false,
  })
  expectCard('group-widget', { version: '2.1.0', state: 'active', pages: [], widget: true })
  if (tool !== undefined)
    expectCard('group-tool', {
      version: '1.0.0',
      state: 'active',
      pages: [],
      widget: false,
      tool: 'group-tool',
    })
  if (online)
    expectCard('acrylblends-pomodoro', {
      author: 'inboxxobni',
      source: POMODORO,
      version: '0.1.0',
      state: 'active',
    })
  if (card('group-clash') !== undefined || card('group-late') !== undefined)
    fail(`the showcase shows a refused plugin: ${JSON.stringify(cards)}`)
  for (const entry of cards)
    for (const path of entry.pages) {
      const opened = await answer(path)
      if (opened.status !== 200)
        fail(
          `the showcase links ${entry.name}'s page ${path}, which answers ${String(opened.status)}`,
        )
    }

  // The page as a person has it open: it follows a removal live, without loading again.
  const profile = mkdtempSync(join(tmpdir(), 'ide-template-showcase-'))
  let launched
  try {
    launched = await startChrome(profile)
    const cdp = await devtools(launched.port)
    try {
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      const evaluate = async (expression) =>
        (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result?.result
          ?.value
      await cdp.send('Page.navigate', { url: `${origin}/app/showcase` })
      const shown = await until(
        async () =>
          (await evaluate(
            `document.getElementById('live')?.textContent === 'live' && [...document.querySelectorAll('[data-plugin]')].map((card) => card.dataset.plugin).join(',')`,
          )) || undefined,
        30_000,
      )
      if (
        typeof shown !== 'string' ||
        !shown.includes('group-route') ||
        !shown.includes('group-widget')
      )
        fail(`the showcase page did not show the cards live (it showed ${JSON.stringify(shown)})`)
      // The widget's link is the app's root as the browser asks it (the app does not serve /app/), and it shows the widget.
      const widgetLink = await evaluate(
        `document.querySelector('[data-plugin="group-widget"] .links a')?.href`,
      )
      if (widgetLink !== `${origin}/app`)
        fail(
          `the showcase links group-widget's home widget to ${String(widgetLink)}, expected ${origin}/app`,
        )
      const widgetPage = await fetch(widgetLink, { headers: { accept: 'text/html' } })
      if (
        widgetPage.status !== 200 ||
        !(await widgetPage.text()).includes('group-widget says hello')
      )
        fail(
          `the showcase's home widget link answers ${String(widgetPage.status)} without the widget`,
        )
      // The stream itself, read over HTTP: after the removal it sends cards without the plugin. The door may also reload the open page (it reloads
      // every app page after a plugin change), so the page is checked for the card being gone, whichever of the two brought it.
      const abort = new AbortController()
      const stream = await fetch(`${origin}/app/showcase/events`, { signal: abort.signal })
      const reader = stream.body.getReader()
      const decoder = new TextDecoder()
      let received = ''
      const nextCards = async () => {
        for (;;) {
          const end = received.indexOf('\n\n')
          if (end !== -1) {
            const block = received.slice(0, end)
            received = received.slice(end + 2)
            if (block.startsWith('event: cards')) return block
            continue
          }
          const { value, done } = await reader.read()
          if (done) return undefined
          received += decoder.decode(value, { stream: true })
        }
      }
      const first = await nextCards()
      if (!first?.includes('data-plugin="group-widget"'))
        fail(
          `the showcase stream's first cards do not show group-widget: ${String(first).slice(0, 300)}`,
        )
      await evaluate('window.__sameDocument = true')
      const removed = door('remove', 'group-widget')
      if (removed.status !== 0)
        fail(`plugin remove group-widget failed:\n${removed.stdout}${removed.stderr}`)
      const timer = setTimeout(() => abort.abort(), 15_000)
      const after = await nextCards().catch(() => undefined)
      clearTimeout(timer)
      abort.abort()
      if (
        after === undefined ||
        after.includes('data-plugin="group-widget"') ||
        !after.includes('data-plugin="group-route"')
      )
        fail(
          `the showcase stream did not send the cards without the removed plugin within 15 s: ${String(after).slice(0, 300)}`,
        )
      const followed = await until(
        async () =>
          (await evaluate(
            `document.getElementById('live')?.textContent === 'live' && !document.querySelector('[data-plugin="group-widget"]') && !!document.querySelector('[data-plugin="group-route"]')`,
          ))
            ? true
            : undefined,
        15_000,
      )
      if (followed !== true)
        fail('the open showcase page still shows the removed plugin after 15 s')
      log(
        `the open showcase page dropped the removed plugin ${(await evaluate('window.__sameDocument === true')) ? 'live, in the same page' : 'after the door reloaded it'}`,
      )
      const link = await evaluate(
        `document.querySelector('[data-plugin="group-route"] .links a')?.href`,
      )
      if (link !== `${origin}/app/group-route`)
        fail(
          `the showcase links group-route's page to ${String(link)}, expected ${origin}/app/group-route`,
        )
    } finally {
      cdp.close()
    }
  } finally {
    if (launched !== undefined) await stopChrome(launched.child)
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
  await new Promise((done) => setTimeout(done, 1500))
  const after = frameReloadSeq(origin, jar)
  if (after !== before)
    fail(
      `the frame loaded the app again during the group pull (reload seq ${String(before)} -> ${String(after)})`,
    )
  log(
    `the collective app: one list pulled ${String(total - 2)} plugins, refused a route clash and a wrong digest by name, the showcase lists each with its links, its stream sends a removal live and the open page drops the card; the frame loaded nothing again`,
  )
}

/** A plugin release serving GET `path`, with the check the builder writes, packed as `plugin publish` packs it. */
function releaseServing(app, name, path) {
  const source = join(app, '..', `${name}-source`)
  mkdirSync(source, { recursive: true })
  writeFileSync(
    join(source, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      keywords: ['cordis-plugin', 'acrylblends'],
    }),
  )
  writeFileSync(
    join(source, 'index.ts'),
    `import { Acryl } from 'acrylblends'
export const name = '${name}'
export const inject = ['router']
export function apply(ctx) {
  ctx.router.route('/', new Acryl().get('${path}', (c) => c.json({ from: '${name}' })))
}
export async function check(ctx) {
  const reply = await ctx.router.request('${path}')
  if (!reply.ok) throw new Error('GET ${path} answered ' + reply.status)
}
`,
  )
  const tarball = join(app, '..', `${name}-1.0.0.tgz`)
  writeFileSync(tarball, packFolder(source).tarball)
  return tarball
}

/**
 * The Blends frame in a real Chrome: the app fills the canvas beside the chat (same origin, so the gate reads what a person sees), and the frame's
 * surfaces are driven through the mockup's development scenarios: branches and versions, the chat tab with History and the + menu, Files and Git, a
 * terminal tab, Preview, and Settings with the plugin navigator. Settings > Models takes a key for a local mock model; no account is used.
 */
async function checkTileInBrowser(url, origin, jar, page, output, mock, restartHost) {
  const profile = mkdtempSync(join(tmpdir(), 'ide-template-tile-'))
  // When the tile's request dies (the iframe shows the browser's error page), its net log names why: ERR_CONNECTION_RESET, ERR_EMPTY_RESPONSE or
  // ERR_ABORTED. CI uploads the file as an artifact only when a gate fails, and the failure message carries its path.
  const netLog = join(tmpdir(), `acryl-frame-netlog-${template}.json`)
  let launched
  try {
    launched = await startChrome(profile, { args: [`--log-net-log=${netLog}`] }).catch((error) =>
      fail(
        `the tile check could not start headless Chrome: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
    const cdp = await devtools(launched.port)
    // What the page itself reported (uncaught exceptions, console errors, the tile iframe's included: it runs in the same target), printed on any
    // failure below - a panel or a tile that fails silently must say why, not only that its expected text was missing.
    const pageReported = () =>
      cdp
        .events()
        .flatMap((message) => {
          if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params?.exceptionDetails ?? {}
            const text = details.exception?.description ?? details.text ?? 'exception'
            return [
              `exception: ${String(text).split('\n')[0]} (${String(details.url ?? '')}:${String(details.lineNumber ?? 0)})`,
            ]
          }
          if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error')
            return [
              `console.error: ${(message.params.args ?? []).map((argument) => argument.value ?? argument.description ?? '').join(' ')}`,
            ]
          if (
            message.method === 'Log.entryAdded' &&
            (message.params?.entry?.level === 'error' || message.params?.entry?.level === 'warning')
          ) {
            const url = message.params.entry.url
            return [
              `${String(message.params.entry.level)}: ${String(message.params.entry.text ?? '')}${url === undefined || url === '' ? '' : ` (${String(url)})`}`,
            ]
          }
          return []
        })
        .slice(-12)
    try {
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      await cdp.send('Log.enable')
      await cdp.send('Network.enable')
      for (const cookie of cookiesOf(jar))
        await cdp.send('Network.setCookie', { ...cookie, url: `${origin}/` })
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      // Every time a browser tile's iframe is pointed at another address in place, and every tile frame made for an outside site, in every document
      // of the frame's page (installed before the page's own scripts, so a reload of the frame keeps it). A tile frame is made for one address:
      // re-pointing one let a new tab's outside default page commit late and pass for the app page's error page, and the tile "retried" by
      // replacing the live app page under a run (run 41559207908). Nothing in the gate asks for an outside site, so none may be loaded.
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `if (window.top === window) {
          window.__acrylTileRepointed = []
          window.__acrylTileOutside = []
          const outside = (frame) => {
            const src = frame.getAttribute('src')
            try { if (src !== null && new URL(src, location.href).origin !== location.origin) window.__acrylTileOutside.push({ at: Date.now(), src }) } catch {}
          }
          const isTile = (node) => node instanceof HTMLIFrameElement && node.classList.contains('acrylAppCanvasFrame')
          new MutationObserver((records) => {
            for (const record of records) {
              if (record.type === 'attributes' && isTile(record.target)) {
                window.__acrylTileRepointed.push({ at: Date.now(), from: record.oldValue, to: record.target.getAttribute('src') })
                outside(record.target)
              }
              for (const node of record.addedNodes) {
                if (isTile(node)) outside(node)
                else if (node.querySelectorAll !== undefined) for (const frame of node.querySelectorAll('iframe.acrylAppCanvasFrame')) outside(frame)
              }
            }
          }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'], attributeOldValue: true })
        }`,
      })
      await cdp.send('Page.navigate', { url })
      const evaluate = async (expression) =>
        (
          await cdp.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          })
        ).result?.result?.value
      // Every iframe load in the frame's page, kept so a panel failure can say whether the app's page was loaded again under the submit, and when. A
      // panel-initiated reload leaves its marker behind; a load the frame itself starts leaves none, and the two must not be confused (a page replaced
      // with an ask in flight loses that ask, and the dump has to name who replaced it).
      await evaluate(`(() => {
        window.__acrylTileLoads = []
        document.addEventListener('load', (event) => {
          const target = event.target
          if (!(target instanceof HTMLIFrameElement)) return
          let href = null
          let readable = false
          try { href = target.contentWindow?.location?.href ?? null; readable = target.contentDocument !== null } catch {}
          const loads = window.__acrylTileLoads
          loads.push({ at: Date.now(), src: target.getAttribute('src'), href, readable })
          if (loads.length > 20) loads.shift()
        }, true)
        return true
      })()`)
      const click = async (label) =>
        await evaluate(`(() => {
          const wanted = ${JSON.stringify(label)}
          const element = [...document.querySelectorAll('button,[role=button],[role=menuitem],a')]
            .find(candidate => candidate.getAttribute('aria-label') === wanted || candidate.textContent.trim() === wanted)
          if (element === undefined) return false
          element.click()
          return true
        })()`)
      const frame = await until(
        async () =>
          await evaluate(`(() => {
            const shell = document.querySelector('.acrylBlendsFrame')
            if (shell === null) return undefined
            const surfaces = {
              topbar: document.querySelector('.acrylBlendsBar') !== null,
              left: document.querySelector('.acrylBlendsLeft') !== null,
              right: document.querySelector('.acrylBlendsRight') !== null,
              canvas: document.querySelector('iframe.acrylAppCanvasFrame') !== null,
            }
            return Object.values(surfaces).every(Boolean) ? surfaces : undefined
          })()`),
        60_000,
      )
      if (frame === undefined) {
        const surfaces = await evaluate(`(() => {
          const shell = document.querySelector('.acrylBlendsFrame')
          if (shell === null) return null
          return {
            topbar: document.querySelector('.acrylBlendsBar') !== null,
            left: document.querySelector('.acrylBlendsLeft') !== null,
            right: document.querySelector('.acrylBlendsRight') !== null,
            canvas: document.querySelector('iframe.acrylAppCanvasFrame') !== null,
          }
        })()`)
        fail(
          `the ACRYL Blends frame did not render its surfaces: ${JSON.stringify(surfaces)}; server said:\n${output.slice(-2500)}`,
        )
      }
      log(
        'the page renders the ACRYL Blends frame: the top bar, the left panel, the canvas and the right panel',
      )
      // The frontend's component stylesheet is really in the document, not swallowed as the entry script's text. Without it every DSH dialog, button
      // and input falls back to browser defaults (the owner kit's flat grey buttons and the dialog without a surface or backdrop, 2026-11-02).
      const entry = await evaluate(`(() => {
        const script = document.querySelector('script[src*="/assets/index-"]')
        return {
          links: document.querySelectorAll('link[rel=stylesheet]').length,
          entryText: (script?.textContent ?? '').length,
        }
      })()`)
      if (entry.links === 0)
        fail(
          'the frame document has no stylesheet link: the entry script swallowed the frontend stylesheets',
        )
      if (entry.entryText !== 0)
        fail(
          `the entry script element holds ${String(entry.entryText)} characters of text: the page's tags after it were swallowed`,
        )
      log(
        'the frontend stylesheet is in the document and the entry script holds no swallowed markup',
      )
      // Mockup scenario 1 (first run): the app the person is building is already in the canvas beside the chat. DSH's blocking onboarding never
      // mounts inside the frame (the frame registers a no-op settings.onboarding step, src/client/index.ts NoOnboarding), so no dialog may cover the
      // app; the document has not scrolled either.
      const firstRunTile = await until(async () => {
        const snapshot = await evaluate(`(() => {
          const frame = document.querySelector('iframe.acrylAppCanvasFrame')
          const src = frame?.getAttribute('src') ?? ''
          const text = frame?.contentDocument?.body?.innerText ?? ''
          if (!src.includes('/app') || text.length === 0) return undefined
          const dialogs = [...document.querySelectorAll('[role=dialog]')]
            .filter(dialog => dialog.getClientRects().length > 0)
            .map(dialog => dialog.innerText.slice(0, 120))
          return { src, text: text.slice(0, 120), dialogs, scrollTop: Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop) }
        })()`)
        return snapshot
      }, 20_000)
      if (firstRunTile === undefined)
        fail(
          `the app did not open itself in the canvas on first run (no iframe at /app with content); body: ${JSON.stringify(await evaluate('document.body.innerText.slice(0, 500)'))}`,
        )
      if (firstRunTile.dialogs.some((text) => /Preview Notice|Add an API key/iu.test(text)))
        fail(
          `a DSH onboarding dialog covers the app on first run: ${JSON.stringify(firstRunTile.dialogs)}`,
        )
      if (firstRunTile.scrollTop !== 0)
        fail(
          `the page scrolled to ${String(firstRunTile.scrollTop)} on first run: ${JSON.stringify(firstRunTile)}`,
        )
      log(
        `the app opens itself in the canvas on first run ("${firstRunTile.text.trim().split('\n')[0]}"), with no DSH onboarding over it`,
      )

      // Mockup scenarios 1, 2 and 5: the left panel carries the branch and its versions; the right panel carries the chat tab, History and the + menu.
      const left = await until(async () => {
        const snapshot = await evaluate(`(() => {
          const side = document.querySelector('.acrylBlendsLeft')
          if (side === null) return { state: 'missing' }
          if (side.hidden) return { state: 'hidden' }
          return {
            state: 'shown',
            labels: [...side.querySelectorAll('.acrylBlendsLabel')].map(label => label.textContent.trim()),
            branches: side.querySelectorAll('.acrylBlendsBranchRow').length,
            versions: side.querySelectorAll('.acrylBlendsVersion').length,
          }
        })()`)
        // The versions list loads a moment after the branches (the Host reads the branch's log): wait for both before asserting them.
        if (
          snapshot?.state === 'shown' &&
          snapshot.labels.some((label) => /^Branches$/iu.test(label)) &&
          snapshot.branches >= 1 &&
          snapshot.labels.some((label) => /^Versions$/iu.test(label)) &&
          snapshot.versions >= 1
        )
          return snapshot
        if (snapshot?.state === 'hidden') await click('Left panel: branches and versions')
        return undefined
      }, 20_000)
      if (left === undefined)
        fail(
          `the left panel has no branches: ${JSON.stringify(await evaluate('document.body.innerText.slice(0, 500)'))}`,
        )
      if (!left.labels.some((label) => /^Versions$/iu.test(label)) || left.versions < 1)
        fail(`the left panel has no versions of the branch: ${JSON.stringify(left)}`)
      log(
        `the left panel shows ${String(left.branches)} branch(es) and ${String(left.versions)} version(s)`,
      )

      const right = await until(async () => {
        const snapshot = await evaluate(`(() => {
          const side = document.querySelector('.acrylBlendsRight')
          if (side === null) return { state: 'missing' }
          if (side.hidden) return { state: 'hidden' }
          return {
            state: 'shown',
            tabs: [...side.querySelectorAll('.acrylBlendsTab')].map(tab => tab.textContent.trim()),
            labels: [...side.querySelectorAll('button,[role=tab]')]
              .map(element => element.getAttribute('aria-label') ?? element.textContent.trim())
              .filter(Boolean),
            text: side.innerText.slice(0, 500),
          }
        })()`)
        if (snapshot?.state === 'shown' && snapshot.tabs.some((text) => /Chat/iu.test(text)))
          return snapshot
        if (snapshot?.state === 'hidden') await click('Right panel: agents')
        return undefined
      }, 20_000)
      if (right === undefined)
        fail(
          `the right panel has no chat tab: ${JSON.stringify(await evaluate('document.body.innerText.slice(0, 500)'))}`,
        )
      if (!right.labels.includes('Open an agent, a terminal, files or git'))
        fail(`the chat tab strip has no + menu: ${JSON.stringify(right)}`)
      if (!right.text.includes('History'))
        fail(`the chat has no History control: ${JSON.stringify(right)}`)
      log('the right panel holds the chat tab, History and the + menu')
      // Close any palette or menu left open (a command named Settings lives in the palette too), then press the frame's own Settings button.
      for (const type of ['keyDown', 'keyUp'])
        await cdp.send('Input.dispatchKeyEvent', {
          type,
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        })
      await sleep(300)
      // The frame's Settings gear (the top bar's launcher for DSH's own Settings modal) opens the dialog.
      const settingsOpen = await until(
        async () =>
          await evaluate(`(() => {
            if ([...document.querySelectorAll('[role=dialog]')].some((candidate) => candidate.querySelector('nav') !== null)) return true
            const gear = [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
              .find((candidate) => (candidate.getAttribute('aria-label') ?? '').trim() === 'Settings')
            gear?.click()
            return false
          })()`),
        20_000,
        500,
      )
      if (settingsOpen !== true) {
        const detail = await evaluate(`document.body.innerText.slice(0, 400)`)
        fail(`Settings did not open a dialog: ${JSON.stringify(detail)}`)
      }
      // The dialog remembers a section (a runner's agent home opened it on General); the Models page is chosen the way the product's own
      // openSettingsSection does it: a button in the dialog's nav, by its accessible name in either shipped language.
      const modelsSection = await until(
        async () =>
          await evaluate(`(() => {
            const item = [...document.querySelectorAll('[role=dialog] nav button')].find((candidate) => {
              const label = (candidate.getAttribute('aria-label') ?? '').trim()
              const text = (candidate.textContent ?? '').replace(/\\s+/g, ' ').trim()
              return ['Models', '模型'].includes(label === '' ? text : label)
            })
            if (item === undefined) return false
            item.click()
            return true
          })()`),
        10_000,
      )
      if (modelsSection !== true) {
        const dump = await evaluate(
          `JSON.stringify([...document.querySelectorAll('[role=dialog]')].map((dialog) => ({ label: dialog.getAttribute('aria-label'), html: dialog.outerHTML.slice(0, 1400) })))`,
        )
        fail(`the Settings dialog has no Models section: ${String(dump).slice(0, 4000)}`)
      }
      const models = await until(
        async () =>
          await evaluate(`(() => {
            const dialogs = [...document.querySelectorAll('[role=dialog]')]
            for (const dialog of dialogs) {
              const text = dialog.innerText
              if (text.includes('Loading the provider directory failed')) return { failed: text.slice(0, 400) }
              const input = dialog.querySelector('input[type=password]') ?? dialog.querySelector('input[aria-label="API key"]')
              if (input !== null) return { text: text.slice(0, 200) }
            }
            return undefined
          })()`),
        20_000,
      )
      if (models === undefined) {
        const detail = await evaluate(
          `document.querySelector('[role=dialog]')?.innerText.slice(0, 500) ?? document.body.innerText.slice(0, 500)`,
        )
        fail(`Settings > Models did not show the API key field: ${JSON.stringify(detail)}`)
      }
      if (models.failed !== undefined)
        fail(`Settings > Models failed: ${JSON.stringify(models.failed)}`)
      // The workshop guide tells attendees a Claude or ChatGPT subscription works through this page: the sign-in rows come from the harness
      // authorization catalog (llm-pi-ai's flows), so a frame composed without that row silently offers DeepSeek alone - the owner's item 9.
      // The rows, not the intro sentence: the sentence already says "Claude, ChatGPT or DeepSeek" whatever is listed.
      const signIn = await until(async () => {
        const rows = await evaluate(`(() => {
          const names = [...document.querySelectorAll('[role=dialog] .acrylSignInName strong')]
            .map((element) => element.textContent.trim())
          return { names }
        })()`)
        return rows?.names.includes('Claude') === true && rows?.names.includes('ChatGPT') === true
          ? rows
          : undefined
      }, 20_000)
      if (signIn === undefined)
        fail(
          'Settings > Models does not offer the Claude and ChatGPT sign-in rows the workshop guide names',
        )
      log('Settings > Models offers the Claude and ChatGPT sign-in rows the guide names')
      await evaluate(`(() => {
        const dialog = document.querySelector('[role=dialog]')
        const input = dialog.querySelector('input[type=password]') ?? dialog.querySelector('input[aria-label="API key"]')
        input?.focus()
        return true
      })()`)
      await cdp.send('Input.insertText', { text: GATE_KEY })
      await sleep(250)
      // The Models page saves a provider key with Apply (the first-run card used Save and continue); both are tried, the page one first.
      if ((await click('Apply')) !== true && (await click('Save and continue')) !== true) {
        const dump = await evaluate(
          `JSON.stringify([...document.querySelectorAll('[role=dialog]')].map((dialog) => ({ label: dialog.getAttribute('aria-label'), text: dialog.innerText.slice(0, 400), buttons: [...dialog.querySelectorAll('button')].map((button) => button.textContent.trim()) })))`,
        )
        fail(`Settings > Models has no save action: ${String(dump).slice(0, 2500)}`)
      }
      const saved = await until(
        async () =>
          await evaluate(`(() => {
            const dialog = document.querySelector('[role=dialog]')
            if (dialog === null) return true
            if (dialog.innerText.includes('Loading the provider directory failed')) return 'failed'
            return dialog.innerText.includes('Add an API key to get started') ? undefined : true
          })()`),
        20_000,
      )
      if (saved === 'failed') fail('Settings > Models failed while saving the key')
      if (saved !== true) fail('Settings > Models did not accept the key')
      for (const type of ['keyDown', 'keyUp'])
        await cdp.send('Input.dispatchKeyEvent', {
          type,
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        })
      await sleep(300)
      log(
        'Settings > Models loads, takes the DeepSeek key, and the first-run prompt leaves once it is saved',
      )
      const afterSettings = await evaluate(
        `Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop)`,
      )
      if (afterSettings !== 0)
        fail(`the page scrolled to ${String(afterSettings)} while Settings was open`)

      const pressEscape = async () => {
        for (const type of ['keyDown', 'keyUp'])
          await cdp.send('Input.dispatchKeyEvent', {
            type,
            key: 'Escape',
            code: 'Escape',
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
          })
        await sleep(300)
      }

      // Mockup scenario 4 (files, search, git): the + menu offers the frame's agents and tools; Files searches the app's own folder, and Git shows
      // the branch's changes and versions.
      const openPlus = () =>
        evaluate(`(() => {
          const plus = [...document.querySelectorAll('button')]
            .find((candidate) => (candidate.getAttribute('aria-label') ?? '') === 'Open an agent, a terminal, files or git')
          if (plus === undefined) return false
          plus.click()
          return true
        })()`)
      const pick = (label) =>
        evaluate(`(() => {
          const item = [...document.querySelectorAll('[role=menuitem]')].find((candidate) => candidate.textContent.trim().startsWith(${JSON.stringify(label)}))
          if (item === undefined) return false
          item.click()
          return true
        })()`)
      const tools = await until(async () => {
        if ((await openPlus()) !== true) return undefined
        const items = await evaluate(
          `[...document.querySelectorAll('[role=menuitem]')].map((item) => item.textContent.replace(/\\s+/g, ' ').trim())`,
        )
        return Array.isArray(items) && items.length > 0 ? items : undefined
      }, 15_000)
      if (tools === undefined) fail('the + menu did not open')
      for (const label of ['Chat', 'Claude Code', 'Codex', 'Pi', 'Terminal', 'Files', 'Git'])
        if (!tools.some((text) => text.startsWith(label)))
          fail(`the + menu has no ${label} item: ${JSON.stringify(tools)}`)
      log(`the + menu offers the agents and the tools: ${tools.join(' | ')}`)
      if ((await pick('Files')) !== true) fail('the + menu has no Files item')
      const files = await until(async () => {
        const snapshot = await evaluate(`(() => {
          const view = document.querySelector('.acrylBlendsFiles')
          if (view === null) return undefined
          return { search: view.querySelector('input[aria-label="Search files"]') !== null, text: view.innerText.slice(0, 300) }
        })()`)
        return snapshot?.search === true ? snapshot : undefined
      }, 20_000)
      if (files === undefined) fail('the Files tab did not open with its search')
      // The search reads the app's own folder: package.json is in every template.
      await evaluate(setInputValue('input[aria-label="Search files"]', 'package.json'))
      const found = await until(async () => {
        const names = await evaluate(
          `[...document.querySelectorAll('.acrylBlendsFiles .acrylBlendsFrow')].map((row) => row.textContent.trim())`,
        )
        return Array.isArray(names) && names.some((name) => name.includes('package.json'))
          ? names
          : undefined
      }, 15_000)
      if (found === undefined) fail('the Files search did not find package.json in the app')
      log(`the Files tab searches the app's own files (${found.slice(0, 3).join(', ')})`)
      if ((await openPlus()) !== true) fail('the + menu did not open again')
      if ((await pick('Git')) !== true) fail('the + menu has no Git item')
      const git = await until(async () => {
        // The whole view, not a slice: an app with many changed files puts History below the changes list.
        const text = await evaluate(
          `document.querySelector('.acrylBlendsGit')?.innerText ?? undefined`,
        )
        return typeof text === 'string' && /History/iu.test(text) ? text : undefined
      }, 20_000)
      if (git === undefined) {
        const detail = await evaluate(`(() => ({
          tabs: [...document.querySelectorAll('.acrylBlendsTab')].map((tab) => tab.textContent.trim()),
          right: document.querySelector('.acrylBlendsRight')?.innerText.slice(0, 500) ?? null,
          git: document.querySelector('.acrylBlendsGit')?.innerText.slice(0, 500) ?? null,
        }))()`)
        fail(`the Git tab did not open with its history: ${JSON.stringify(detail)}`)
      }
      log("the Git tab shows the app's changes and versions")

      // A terminal tab runs a real PTY in the right panel (mockup scenario 3's tool half; starting Claude itself is the trust-prompt case the driver
      // gate covers, and this gate never drives an account).
      if ((await openPlus()) !== true) fail('the + menu did not open for the terminal')
      if ((await pick('Terminal')) !== true) fail('the + menu has no Terminal item')
      const terminal = await until(async () => {
        const snapshot = await evaluate(`(() => {
          const screen = document.querySelector('.acrylBlendsTermScreen')
          return screen === null ? undefined : { tabs: [...document.querySelectorAll('.acrylBlendsTab')].map((tab) => tab.textContent.trim()) }
        })()`)
        return snapshot
      }, 20_000)
      if (terminal === undefined) fail('a terminal tab did not open its PTY view')
      log(`a terminal tab opened its PTY view (${terminal.tabs.join(' | ')})`)

      // Mockup scenario 5 (chat history): the chat's History lists the branch's chats, and the button closes it again.
      await evaluate(`(() => {
        const chat = [...document.querySelectorAll('.acrylBlendsTab')].find((tab) => /Chat/iu.test(tab.textContent))
        chat?.click()
        return true
      })()`)
      await sleep(500)
      await evaluate(`document.querySelector('.acrylBlendsHistoryButton')?.click()`)
      const history = await until(async () => {
        const text = await evaluate(
          `document.querySelector('.acrylBlendsHistory')?.innerText.slice(0, 300) ?? undefined`,
        )
        return typeof text === 'string' && /New chat|main/iu.test(text) ? text : undefined
      }, 15_000)
      if (history === undefined) fail("the chat History did not open with the branch's chats")
      log(
        `the chat History lists the branch's chats ("${history.split('\n').slice(0, 3).join(' · ')}")`,
      )
      await evaluate(`document.querySelector('.acrylBlendsHistoryButton')?.click()`)
      await pressEscape()

      // Mockup scenario 7 (preview as a user): the Build/Preview switch hides the whole frame on the same app, and the pill takes the builder back.
      await evaluate(`(() => {
        const preview = [...document.querySelectorAll('.acrylBlendsModes button')].find((button) => button.textContent.trim() === 'Preview')
        preview?.click()
        return preview !== undefined
      })()`)
      const preview = await until(async () => {
        const snapshot = await evaluate(`(() => {
          const shell = document.querySelector('.acrylBlendsFrame')
          if (shell?.getAttribute('data-mode') !== 'preview') return undefined
          return {
            left: document.querySelector('.acrylBlendsLeft')?.hidden === true,
            right: document.querySelector('.acrylBlendsRight')?.hidden === true,
            back: document.querySelector('.acrylBlendsBackbar button')?.textContent.trim() ?? null,
            app: (document.querySelector('iframe.acrylAppCanvasFrame')?.contentDocument?.body?.innerText ?? '').length > 0,
          }
        })()`)
        return snapshot?.left === true && snapshot?.right === true ? snapshot : undefined
      }, 20_000)
      if (preview === undefined) fail('Preview did not hide the frame around the app')
      if (preview.back !== 'Back to Build')
        fail(`Preview has no Back to Build control: ${JSON.stringify(preview)}`)
      if (preview.app !== true) fail('the app is not visible in Preview')
      log('Preview hides the frame and shows the app on the same canvas')
      await evaluate(`(() => {
        const back = [...document.querySelectorAll('.acrylBlendsBackbar button')].find((button) => button.textContent.trim() === 'Back to Build')
        back?.click()
        return back !== undefined
      })()`)
      await until(
        async () =>
          (await evaluate(
            `document.querySelector('.acrylBlendsFrame')?.getAttribute('data-mode') === 'build'`,
          )) === true,
        15_000,
      )

      // The agent template's own plugins run beside the host (the composition check above proves every row active), and the panel's routes belong under
      // the app's mount: /app/api/agent-panel, where the app is served, not the host's own /api. Open the panel in the iframe, let its session load, and
      // ask the app's own offline agent to add two numbers: the run starts and stops, and the answer lands in the panel's own log.
      if (page.panel === true) {
        const panel = await until(
          async () =>
            await evaluate(`(() => {
            const iframe = document.querySelector('iframe.acrylAppCanvasFrame')
            const host = iframe?.contentDocument?.querySelector('#agent-panel')
            const root = host?.shadowRoot
            const open = root?.querySelector('button.open')
            if (!open) return undefined
            // The panel marks itself ready once its form is wired; filing a submit before that is the half-wired state the gate saw once.
            if (host.dataset.ready !== '1') return undefined
            open.click()
            const select = root.querySelector('select')
            const drivers = [...select.options].map(option => option.value)
            if (!drivers.includes('agent')) return undefined
            select.value = 'agent'
            // A person's pick fires a change event; it is constructed in the iframe's realm so the panel's own listener
            // runs exactly as it does for a person. The gate never repairs the panel's DOM: if the panel does not switch
            // itself to the agent's form, that is the failure to report.
            const EventCtor = iframe.contentWindow?.Event ?? Event
            select.dispatchEvent(new EventCtor('change', { bubbles: true }))
            const logElement = root.querySelector('#log')
            const formElement = root.querySelector('form')
            const termElement = root.querySelector('#term')
            const section = root.querySelector('section')
            const shown =
              logElement?.hidden === false && formElement?.hidden === false && termElement?.hidden === true
            const textarea = root.querySelector('textarea')
            // Type the way a person does (the native setter plus an input event), not a bare value assignment the page's own listeners would never see.
            const message = 'add 2 3'
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
            if (setter !== undefined) setter.call(textarea, message)
            else textarea.value = message
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
            // Keep the very nodes this submit used: a failure then says whether they were still the panel's own (a remount or reload between typing and
            // submit leaves them disconnected, and a stale data-ready mark on a reused host would let the gate act before the new form is wired).
            window.__acrylPanelGate = { host, root, textarea, form: root.querySelector('form'), typedAt: Date.now(), iframe, view: iframe?.contentWindow, doc: iframe?.contentDocument ?? null, originAt: iframe?.contentWindow?.performance?.timeOrigin ?? null }
            root.querySelector('form').requestSubmit()
            return {
              drivers,
              select: select.value,
              shown,
              logHidden: logElement?.hidden ?? null,
              formHidden: formElement?.hidden ?? null,
              termHidden: termElement?.hidden ?? null,
              panelVisible: section === null ? null : getComputedStyle(section).display !== 'none',
              panelText: root.textContent?.slice(-300) ?? null,
              value: textarea.value,
              ready: host.dataset.ready ?? null,
              following: host.dataset.following ?? null,
              textareaConnected: textarea.isConnected,
              textareaIsCurrent: textarea === root.querySelector('textarea'),
              status: root.querySelector('#log')?.innerText?.slice(-300) ?? '',
              reload: iframe?.contentWindow?.sessionStorage?.getItem('agent-panel-reload') ?? null,
            }
          })()`),
          30_000,
        )
        if (panel === undefined) {
          const detail = await evaluate(`(() => {
            const iframe = document.querySelector('iframe.acrylAppCanvasFrame')
            const doc = iframe?.contentDocument
            const host = doc?.querySelector('#agent-panel')
            return {
              href: iframe?.contentWindow?.location?.href ?? null,
              title: doc?.title ?? null,
              scripts: [...(doc?.querySelectorAll('script[src]') ?? [])].map((script) => script.getAttribute('src')),
              host: host === null || host === undefined ? null : { ready: host.dataset.ready ?? null, hasShadow: host.shadowRoot !== null },
              text: doc?.body?.innerText?.slice(0, 300) ?? null,
            }
          })()`)
          fail(
            `the agent panel did not appear in the app's page, or its session did not load: ${JSON.stringify(detail)}; server said:\n${output.slice(-2500)}`,
          )
        }
        if (panel.shown !== true)
          fail(
            `the agent panel did not switch to the agent's form when its driver was picked (no DOM repair by the gate): ${JSON.stringify(panel)}`,
          )
        // The offline agent answers in well under a second on a quiet machine; a loaded macOS runner once took longer than the old 30 s bound
        // (run 41358355702) with the panel unchanged, so the wait is 60 s and a failure carries the panel's own log instead of only `undefined`.
        const answered = await until(
          async () =>
            await evaluate(`(() => {
            const iframe = document.querySelector('iframe.acrylAppCanvasFrame')
            const root = iframe?.contentDocument?.querySelector('#agent-panel')?.shadowRoot
            const logElement = root?.querySelector('#log')
            const log = logElement?.innerText ?? ''
            if (logElement?.hidden === true || !log.includes('The answer is 5.')) return undefined
            return {
              text: log.slice(-300),
              visible: true,
              send: root.querySelector('.send').disabled === false,
              stopped: root.querySelector('.stop').disabled === true,
            }
          })()`),
          60_000,
        )
        if (
          answered === undefined ||
          answered.visible !== true ||
          answered.send !== true ||
          answered.stopped !== true
        ) {
          const detail = await evaluate(`(() => {
            const iframe = document.querySelector('iframe.acrylAppCanvasFrame')
            const host = iframe?.contentDocument?.querySelector('#agent-panel')
            const root = host?.shadowRoot
            const gate = window.__acrylPanelGate
            return {
              log: root?.querySelector('#log')?.innerText?.slice(-600) ?? null,
              logText: root?.querySelector('#log')?.textContent?.slice(-600) ?? null,
              logHidden: root?.querySelector('#log')?.hidden ?? null,
              send: root === undefined || root === null ? null : root.querySelector('.send')?.disabled,
              stop: root === undefined || root === null ? null : root.querySelector('.stop')?.disabled,
              drivers: root === undefined || root === null ? null : [...(root.querySelector('select')?.options ?? [])].map(option => option.value),
              value: root?.querySelector('textarea')?.value ?? null,
              ready: host?.dataset.ready ?? null,
              following: host?.dataset.following ?? null,
              // The nodes the submit used, against the panel that is there now: a disconnected textarea or form (or a different host) means the panel was
              // remounted or the page reloaded between typing and submit; a current textarea with an empty log and no run means the form was not wired.
              typedAt: gate?.typedAt ?? null,
              typedTextareaConnected: gate === undefined ? null : gate.textarea.isConnected,
              typedTextareaIsCurrent: gate === undefined || root === undefined || root === null ? null : gate.textarea === root.querySelector('textarea'),
              typedFormConnected: gate === undefined ? null : gate.form.isConnected,
              typedHostIsCurrent: gate === undefined ? null : gate.host === host,
              // The document the submit was made in, against the one there now: a different origin time or document means the iframe navigated, and
              // the loads below name when it happened (the panel's own reload would also carry the marker read next).
              typedIframeIsCurrent: gate === undefined || iframe === undefined ? null : gate.iframe === iframe,
              typedDocIsCurrent: gate === undefined || iframe === undefined || iframe === null ? null : gate.doc === iframe.contentDocument,
              typedOriginAt: gate?.originAt ?? null,
              originAt: iframe?.contentWindow?.performance?.timeOrigin ?? null,
              href: iframe?.contentWindow?.location?.href ?? null,
              loads: window.__acrylTileLoads?.slice(-10) ?? null,
              repointed: window.__acrylTileRepointed ?? null,
              outside: window.__acrylTileOutside ?? null,
              // A panel-initiated page reload (a run that changed a plugin) is recorded before it happens; a failure dump says whether one was involved.
              reload: iframe?.contentWindow?.sessionStorage?.getItem('agent-panel-reload') ?? null,
            }
          })()`)
          // The CDP's own view of every frame navigation during this page: a subframe load the page script could not observe (or a top-level one) is
          // named here, with the URL it went to.
          const navigations = cdp
            .events()
            .filter((message) => message.method === 'Page.frameNavigated')
            .slice(-10)
            .map((message) => ({
              frame: message.params?.frame?.id ?? null,
              url: message.params?.frame?.url ?? null,
            }))
          fail(
            `the panel's run did not start and stop in the app's page: ${JSON.stringify(answered)}; at submit: ${JSON.stringify(panel)}; panel: ${JSON.stringify(detail)}; navigations: ${JSON.stringify(navigations)}`,
          )
        }
        log(
          "the panel opens in the app, asks the app's own agent, and shows the answer (run started and stopped)",
        )
        // The same admission as the app's own server, never a looser one: the mounted path refuses a cross-site request, and an ask without the token.
        const refused = (target, extra) =>
          spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', ...extra, target], {
            encoding: 'utf8',
          }).stdout
        const crossSite = refused(`${origin}/app/api/agent-panel/session`, [
          '-H',
          'Sec-Fetch-Site: cross-site',
        ])
        const noToken = refused(`${origin}/app/api/agent-panel/ask`, [
          '-H',
          'Sec-Fetch-Site: same-origin',
          '-X',
          'POST',
          '-d',
          '{"message":"add 2 3"}',
        ])
        if (crossSite !== '403' || noToken !== '403')
          fail(
            `the panel's admission is not the app's own: a cross-site session answered ${crossSite} and an ask without the token answered ${noToken}, both expected 403`,
          )
        log("the panel's endpoints keep the app's origin and token admission under the mount")

        // The PTY driver is the second app-owned row with routes of its own: a session starts and stops at /app/api/driver-pty, the panel's session
        // names the terminal view under the same mount, and the view module answers there. The same admission refuses a cross-site or untokened call.
        const pty = await evaluate(`(async () => {
          const session = await (await fetch('/app/api/agent-panel/session')).json()
          const driver = session.drivers.find(entry => entry.kind === 'terminal')
          if (driver === undefined) return { error: 'no terminal driver', drivers: session.drivers }
          const headers = { 'content-type': 'application/json', 'x-agent-panel-token': session.token }
          const view = await fetch(driver.view.module)
          const started = await fetch('/app/api/driver-pty/sessions', { method: 'POST', headers, body: JSON.stringify({ driver: driver.name, cols: 80, rows: 24 }) })
          const created = await started.json().catch(() => ({}))
          if (started.status !== 200 || typeof created.id !== 'string')
            return { error: 'start answered ' + started.status, body: created, view: view.status }
          const stopped = await fetch('/app/api/driver-pty/' + created.id + '/stop', { method: 'POST', headers, body: '{}' })
          return {
            driver: driver.name,
            view: driver.view,
            viewStatus: view.status,
            viewType: view.headers.get('content-type'),
            started: started.status,
            stopped: stopped.status,
          }
        })()`)
        if (
          pty === undefined ||
          pty.started !== 200 ||
          pty.stopped !== 200 ||
          pty.viewStatus !== 200
        )
          fail(
            `the PTY session did not start and stop at the app's mount: ${JSON.stringify(pty)} (server said:\n${output.slice(-1500)})`,
          )
        if (
          pty.view?.prefix !== '/app/api/driver-pty' ||
          !String(pty.view?.module ?? '').startsWith('/app/api/driver-pty/')
        )
          fail(`the terminal view is not under the app's mount: ${JSON.stringify(pty.view)}`)
        log(
          `the PTY starts and stops at /app/api/driver-pty (${pty.driver}); its view answers there`,
        )
        const crossSitePty = refused(`${origin}/app/api/driver-pty/sessions`, [
          '-H',
          'Sec-Fetch-Site: cross-site',
          '-H',
          'Content-Type: application/json',
          '-X',
          'POST',
          '-d',
          '{"driver":"pty:node"}',
        ])
        const noTokenPty = refused(`${origin}/app/api/driver-pty/sessions`, [
          '-H',
          'Sec-Fetch-Site: same-origin',
          '-H',
          'Content-Type: application/json',
          '-X',
          'POST',
          '-d',
          '{"driver":"pty:node"}',
        ])
        if (crossSitePty !== '403' || noTokenPty !== '403')
          fail(
            `the terminal's admission is not the panel's own: a cross-site session answered ${crossSitePty} and an untokened one answered ${noTokenPty}, both expected 403`,
          )
        log("the terminal's endpoints keep the app's origin and token admission under the mount")
      }

      // A settings change is picked up on the next page load, and the frame restores the branch's chat beside the app.
      await cdp.send('Page.navigate', { url: `${origin}/` })
      const reloaded = await until(
        async () =>
          (await evaluate(
            `document.querySelector('.acrylBlendsFrame') !== null && document.querySelector('iframe.acrylAppCanvasFrame') !== null`,
          )) === true,
        60_000,
      )
      if (reloaded !== true) fail('the frame did not come back after the settings reload')

      // The workshop runs on the agent template; the blank app has no chat worktree, so its chat send is not checked here.
      if (template === 'agent') {
        // A fresh chat from the frame's + menu: a session started after the key was saved shows no first-run card. The panel restores the branch's
        // chat on its own; only the menu is retried while the frame is still rendering.
        let chatOpened = false
        for (let attempt = 0; attempt < 3 && chatOpened !== true; attempt += 1) {
          await evaluate(`(() => {
            const plus = [...document.querySelectorAll('button')]
              .find((candidate) => (candidate.getAttribute('aria-label') ?? '') === 'Open an agent, a terminal, files or git')
            plus?.click()
            return true
          })()`)
          chatOpened = await until(
            async () =>
              await evaluate(`(() => {
                const item = [...document.querySelectorAll('[role=menuitem]')].find((candidate) => candidate.textContent.trim().startsWith('Chat'))
                if (item === undefined) return false
                item.click()
                return true
              })()`),
            3_000,
          )
          if (chatOpened !== true) await sleep(500)
        }
        if (chatOpened !== true) fail('the + menu has no Chat item')
        await until(
          async () =>
            (await evaluate(
              `[...document.querySelectorAll('.acrylBlendsTab')].some((tab) => /Chat/iu.test(tab.textContent))`,
            )) === true,
          20_000,
        )
        await sleep(800)
        if (
          (await evaluate(
            `document.querySelector('section[aria-label="Connect a model"]') !== null`,
          )) === true
        )
          fail('the chat still asks for a key after it was saved in Settings > Models')
        log('the chat does not ask for a key again after Settings > Models saved it')
        const composer = await until(
          async () =>
            await evaluate(
              `document.querySelector('[contenteditable=true][aria-label^="Describe"]') !== null`,
            ),
          20_000,
        )
        if (composer !== true) {
          const detail = await evaluate(`document.body.innerText.slice(0, 500)`)
          fail(`the chat has no composer after the settings reload: ${JSON.stringify(detail)}`)
        }
        // The composer takes the text through the focused contenteditable; a re-render can drop the focus before the insert, so the text is verified and the
        // insert repeated. The send control is then waited for, and a failure names the buttons that are there.
        let typed = false
        for (let attempt = 0; attempt < 3 && !typed; attempt += 1) {
          await evaluate(
            `document.querySelector('[contenteditable=true][aria-label^="Describe"]')?.focus()`,
          )
          await cdp.send('Input.insertText', { text: GATE_MESSAGE })
          await sleep(250)
          typed = await until(
            async () =>
              (await evaluate(
                `(document.querySelector('[contenteditable=true][aria-label^="Describe"]')?.textContent ?? '').includes(${JSON.stringify(GATE_MESSAGE)})`,
              )) === true,
            5_000,
          )
        }
        if (typed !== true) fail('the chat composer did not take the message text')
        const sendEnabled = await until(
          async () =>
            await evaluate(`(() => {
              const button = document.querySelector('button[aria-label="Send message"]')
              return button !== null && !button.disabled
            })()`),
          15_000,
        )
        if (sendEnabled !== true) {
          const detail = await evaluate(`JSON.stringify({
            text: document.body.innerText.slice(0, 400),
            buttons: [...document.querySelectorAll('button')].map((candidate) => candidate.getAttribute('aria-label') ?? candidate.textContent.trim()).filter(Boolean).slice(0, 40),
            composer: (document.querySelector('[contenteditable=true][aria-label^="Describe"]')?.textContent ?? '').slice(0, 120),
          })`)
          fail(`the chat has no send control: ${JSON.stringify(detail)}`)
        }
        await evaluate(
          `(() => { document.querySelector('button[aria-label="Send message"]')?.click(); return true })()`,
        )
        const used = await until(
          async () =>
            mock.requests.some((request) => request.headers['x-api-key'] === GATE_KEY) || undefined,
          30_000,
        )
        if (!used)
          fail(
            `the model request did not carry the entered key; requests: ${JSON.stringify(mock.requests.map((request) => ({ url: request.url, key: request.headers['x-api-key'] ?? null })))}`,
          )
        const inPage = await evaluate(
          `document.documentElement.outerHTML.includes(${JSON.stringify(GATE_KEY)}) || document.body.innerText.includes(${JSON.stringify(GATE_KEY)})`,
        )
        if (inPage === true) fail('the API key is still in the page after it was stored')
        log(
          'the chat sent a message with the key saved in Settings, and the local model answered; the page does not keep the key',
        )
      }

      if (skipSettings) log('Settings skipped (GATE_SKIP_SETTINGS=1)')
      else {
        // Settings last: it is the one surface another worker owns (the settings registration), so every independent assertion above runs first.
        // (c) Settings: General, Models, Plugins, Support, Shortcuts.
        // A person presses Settings once and waits for it; only a visible dialog whose nav carries a real section counts, so a stale or hidden dialog
        // cannot be mistaken for Settings. Pressing again before the dialog has rendered toggles the open panel closed again, which is how a slow runner
        // livelocked this step on 2026-11-02 (both triggers present, no dialog, no exception, forty presses in twenty seconds): each press here is
        // followed by a bounded wait for the render, and only then is the next press allowed.
        const settingsOpenExpression = `(() => {
          const sectionLabels = ['Models', '模型']
          const isSection = (button) => {
            const label = (button.getAttribute('aria-label') ?? '').trim()
            const text = (button.textContent ?? '').replace(/\\s+/g, ' ').trim()
            return sectionLabels.includes(label === '' ? text : label)
          }
          return [...document.querySelectorAll('[role=dialog]')].some((dialog) =>
            dialog.getClientRects().length > 0 &&
            dialog.querySelector('nav') !== null &&
            [...dialog.querySelectorAll('nav button')].some(isSection))
        })()`
        const pressSettingsExpression = `(() => {
          // The frame's top-bar gear is the one launcher (it fills DSH's settings.launcher); a second press of it toggles the dialog shut, so this
          // presses exactly one button.
          const gear = [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
            .find((button) => ['Settings', '设置'].includes(button.getAttribute('aria-label') ?? ''))
          gear?.click()
          return gear === undefined ? 0 : 1
        })()`
        let opened = false
        let presses = 0
        for (let attempt = 0; attempt < 6 && !opened; attempt += 1) {
          presses += 1
          if ((await evaluate(settingsOpenExpression)) === true) {
            opened = true
            break
          }
          await evaluate(pressSettingsExpression)
          opened =
            (await until(
              async () => ((await evaluate(settingsOpenExpression)) === true ? true : undefined),
              3_000,
              200,
            )) === true
        }
        if (opened !== true) {
          const detail = await evaluate(`(() => {
            const candidates = [...document.querySelectorAll('button,[role=button],[role=menuitem],a')]
              .filter((candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent.trim()) === 'Settings')
              .map((candidate) => ({
                tag: candidate.tagName,
                className: String(candidate.className).slice(0, 80),
                inTopbar: candidate.closest('.acrylBlendsBar') !== null,
                inDialog: candidate.closest('[role=dialog]') !== null,
                visible: candidate.getClientRects().length > 0,
                disabled: candidate.disabled === true,
                ariaDisabled: candidate.getAttribute('aria-disabled'),
                ariaExpanded: candidate.getAttribute('aria-expanded'),
                ariaHaspopup: candidate.getAttribute('aria-haspopup'),
              }))
            // The run state at the failure: a DSH chat that is still streaming shows its Stop control and no enabled Send.
            const controls = [...document.querySelectorAll('button')]
              .map((button) => button.getAttribute('aria-label') ?? button.textContent.trim())
              .filter((label) => /stop|send|cancel|interrupt/iu.test(label))
              .slice(0, 8)
            const dialogs = [...document.querySelectorAll('[role=dialog]')].map((dialog) => ({
              visible: dialog.getClientRects().length > 0,
              label: dialog.getAttribute('aria-label'),
              nav: dialog.querySelector('nav') !== null,
            }))
            return JSON.stringify({ presses: ${presses}, body: document.body.innerText.slice(-1200), candidates, controls, dialogs })
          })()`)
          fail(`Settings did not open: ${String(detail)}`)
        }
        // The record of the product answer: Settings must open while a chat run streams. The Success log says whether one was still going at the
        // moment the dialog was found, so a regression is visible even when this step passes.
        const runAtOpen = await evaluate(`(() => {
          const labels = [...document.querySelectorAll('button')].map((button) => button.getAttribute('aria-label') ?? button.textContent.trim())
          return labels.filter((label) => /stop|interrupt|cancel/iu.test(label)).slice(0, 5)
        })()`)
        log(`Settings opened; stop/interrupt controls at that moment: ${JSON.stringify(runAtOpen)}`)
        // The dialog is up; its sections register asynchronously, and on a slow runner a layout settle can close it again right after it opens (the blank
        // gate's Node 22 check, run 41491427783, found the dialog and then lost it during this wait). Keep reading the dialog itself; if it vanishes,
        // press Settings once more - a person does the same - and never press while it is up, so a late render cannot be toggled shut.
        const sections = ['General', 'Models', 'Plugins', 'Support', 'Shortcuts']
        let settings
        let sectionPresses = 0
        const sectionDeadline = Date.now() + 20_000
        while (Date.now() < sectionDeadline && settings === undefined) {
          const snapshot = await evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role=dialog]')]
              .find((candidate) => candidate.getClientRects().length > 0 && candidate.querySelector('nav') !== null)
            if (dialog === undefined) return { open: false }
            const labels = [...dialog.querySelectorAll('button,[role=tab],[role=menuitem],a')]
              .map((element) => element.getAttribute('aria-label') ?? element.textContent.trim())
              .filter(Boolean)
            return { open: true, text: dialog.innerText.slice(0, 4000), labels: labels.slice(0, 160) }
          })()`)
          if (snapshot?.open === true) {
            const text = `${snapshot.text}\n${snapshot.labels.join('\n')}`
            if (/Shortcuts/iu.test(text)) settings = { text, labels: snapshot.labels }
            else await sleep(300)
            continue
          }
          sectionPresses += 1
          await evaluate(pressSettingsExpression)
          await sleep(800)
        }
        if (settings === undefined) {
          const detail = await evaluate(`(() => {
            const dialogs = [...document.querySelectorAll('[role=dialog]')].map((dialog) => ({
              visible: dialog.getClientRects().length > 0,
              label: dialog.getAttribute('aria-label'),
              nav: dialog.querySelector('nav') !== null,
              text: dialog.innerText.slice(0, 300),
            }))
            const controls = [...document.querySelectorAll('button')]
              .map((button) => button.getAttribute('aria-label') ?? button.textContent.trim())
              .filter((label) => /stop|send|cancel|interrupt/iu.test(label))
              .slice(0, 8)
            return JSON.stringify({ presses: ${presses + sectionPresses}, dialogs, controls, body: document.body.innerText.slice(-1200) })
          })()`)
          fail(`Settings did not stay open with its sections: ${String(detail)}`)
        }
        const settingsText = `${settings.text}\n${settings.labels.join('\n')}`
        // DSH 0.2 labels the plugins section "Built-in plugins"; the section names match case-insensitively.
        const missing = sections.filter((section) => !new RegExp(section, 'iu').test(settingsText))
        if (missing.length > 0)
          fail(
            `Settings is missing ${missing.join(', ')}: ${JSON.stringify(settings).slice(0, 3000)}`,
          )
        log(`Settings has ${sections.join(', ')}`)
        // Mockup scenario 6 (Settings: plugins): the navigator of everything the app is made of, with its search and its rows. A slow runner can
        // lose the dialog between reading its sections and this step (the same settle that closed it under the sections wait), so the gear is pressed
        // again whenever no visible dialog is up; a press while it is open would toggle it shut, which is why it is only the closed case.
        const plugins = await until(async () => {
          const open = await evaluate(
            `[...document.querySelectorAll('[role=dialog]')].some((candidate) => candidate.getClientRects().length > 0 && candidate.querySelector('nav') !== null)`,
          )
          if (open !== true) {
            await evaluate(pressSettingsExpression)
            return undefined
          }
          const clicked = await evaluate(`(() => {
            const item = [...document.querySelectorAll('[role=dialog] nav button')]
              .find((button) => /Plugins|插件/u.test((button.getAttribute('aria-label') ?? '') + ' ' + button.textContent))
            item?.click()
            return item !== undefined
          })()`)
          if (clicked !== true) return undefined
          const snapshot = await evaluate(`(() => {
            const view = document.querySelector('.acrylBlendsPlugins')
            if (view === null) return undefined
            return { search: view.querySelector('input[aria-label="Search plugins"]') !== null, rows: view.querySelectorAll('.acrylBlendsPlug').length, text: view.innerText.slice(0, 300) }
          })()`)
          if (snapshot === undefined || snapshot.rows < 1) return undefined
          return snapshot
        }, 20_000)
        if (plugins === undefined) {
          const detail = await evaluate(
            `document.querySelector('.acrylBlendsPlugins')?.innerText.slice(0, 400) ?? document.querySelector('[role=dialog]')?.innerText.slice(-400) ?? null`,
          )
          fail(
            `Settings > Plugins did not open the plugin navigator with its rows: ${JSON.stringify(detail)}`,
          )
        }
        if (plugins.search !== true) fail('Settings > Plugins has no search')
        log(`Settings > Plugins lists ${String(plugins.rows)} plugins with its search`)
        await pressEscape()
      }
      // The browser's session is gone (its cookie is deleted, as Chrome loses it after a restart inside its flush window) and the host restarts
      // under the open page. The frame keeps the app on screen instead of going blank, and the frame's own API refuses the stale page; the page
      // does not scroll while it happens.
      const cookies = (await cdp.send('Network.getAllCookies')).result?.cookies ?? []
      for (const cookie of cookies)
        await cdp.send('Network.deleteCookies', {
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
        })
      const restartedUrl = await restartHost()
      if (restartedUrl === undefined) fail('the host did not restart for the session check')
      const stillShowing = await until(async () => {
        return await evaluate(`(() => {
          const frame = document.querySelector('.acrylBlendsFrame')
          const canvas = document.querySelector('iframe.acrylAppCanvasFrame')
          const text = canvas?.contentDocument?.body?.innerText ?? ''
          if (frame === null || canvas === null || text.length === 0) return undefined
          return {
            text: text.slice(0, 80),
            scrollTop: Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop),
          }
        })()`)
      }, 30_000)
      if (stillShowing === undefined) {
        const detail = await evaluate(`document.body.innerText.slice(0, 400)`)
        fail(
          `the frame or the app disappeared after the host restarted without the browser's session: ${JSON.stringify(detail)}; server said:\n${output.slice(-1500)}`,
        )
      }
      if (stillShowing.scrollTop !== 0)
        fail(
          `the page scrolled to ${String(stillShowing.scrollTop)} after the host restarted without the session`,
        )
      const staleApi = Number(
        spawnSync(
          'curl',
          ['-s', '-o', '/dev/null', '-w', '%{http_code}', `${origin}/api/acryl-blends-frame/state`],
          {
            encoding: 'utf8',
          },
        ).stdout,
      )
      if (staleApi !== 401 && staleApi !== 403 && staleApi !== 303)
        fail(`the frame's API admitted a page without a session (${String(staleApi)})`)
      log(
        "after the host restarted without the browser's session, the app stays on screen and the frame's API refuses the stale page",
      )
    } catch (error) {
      const reported = pageReported()
      if (reported.length > 0)
        console.error(
          `verify-ide-template(${template}): the page reported:\n${reported.join('\n')}`,
        )
      throw error
    } finally {
      cdp.close()
    }
  } finally {
    // The whole tree, not only the browser process: on Windows renderers and crashpad outlive a killed browser and hold the profile.
    await stopChrome(launched?.child)
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    } catch {
      // Windows can still hold a file of the closed browser for a moment. The folder sits in the temp directory, and a page that passed stays passed;
      // the run's own scratch is removed by the caller, which reports a failure of its own.
    }
  }
}
