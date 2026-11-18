// The door step of the Part 2 product test: the finished app is started, a real (headless) Chrome loads its page, and the feature is read off that page through the
// folder's own command, `.acryl/bin/acryl look`, the way an agent checks its work. The door never types a password, so the probe signs a user up over HTTP and gives the
// browser that session's cookie over the DevTools protocol. Returns { ok, steps } and never throws.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromeCandidates } from './platform.mjs'
import { freePort } from './port.mjs'
import { startGroup, stopGroup } from './proc.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms, every = 400) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(every)
  }
}

/** A Chrome or Chromium on this machine, or undefined. */
export function findChrome() {
  return chromeCandidates().find((path) => existsSync(path))
}

/** Evaluate calls over the DevTools protocol of the one page of `port`, or of `tab` (an entry of the browser's `/json` list) when one is given. */
export async function devtools(port, tab) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  // The tab, not one of the browser's own pages (headless Chrome lists its omnibox popup and built-in extension pages as `page` targets too).
  const page =
    tab === undefined
      ? targets.find((t) => t.type === 'page' && /^(about:blank|https?:)/u.test(t.url))
      : targets.find((t) => t.id === tab.id)
  if (page === undefined) throw new Error('the browser has no page yet')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('the DevTools connection failed')))
  })
  let id = 0
  // Events (messages without an id) are kept for diagnostics: a failure can print what the page itself reported (uncaught exceptions, console errors).
  const events = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id === undefined) events.push(message)
  })
  // A call that never gets its answer (the browser died, the connection closed) rejects instead of leaving the script waiting with nothing pending.
  const send = (method, params = {}, ms = 30_000) =>
    new Promise((resolve, reject) => {
      const mine = ++id
      const done = (finish) => (value) => {
        clearTimeout(timer)
        ws.removeEventListener('message', on)
        ws.removeEventListener('close', onClose)
        finish(value)
      }
      const on = (event) => {
        const message = JSON.parse(event.data)
        if (message.id === mine) done(resolve)(message)
      }
      const onClose = () =>
        done(reject)(new Error(`the browser closed the connection during ${method}`))
      const timer = setTimeout(
        () => done(reject)(new Error(`${method} got no answer in ${ms} ms`)),
        ms,
      )
      ws.addEventListener('message', on)
      ws.addEventListener('close', onClose)
      ws.send(JSON.stringify({ id: mine, method, params }))
    })
  return { send, close: () => ws.close(), events: () => events.slice() }
}

/**
 * The port Chrome chose, read from the `DevToolsActivePort` file it writes into its own profile when started with `--remote-debugging-port=0` (the file's
 * first line is the port). Undefined while the file is absent or is not a port yet. Reading this instead of guessing a port is what keeps a gate from
 * spinning on a port another process happens to hold.
 */
export function devToolsActivePort(profile) {
  try {
    const [first] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')
    const port = Number.parseInt(first ?? '', 10)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * Kill a launched Chrome and everything it started. On Windows a killed browser can leave renderer and crashpad processes behind that hold the profile
 * and its port, so the whole tree goes with `taskkill /T /F`; elsewhere the process group (the child is spawned detached) gets SIGKILL. Waits for the
 * leader to exit, bounded.
 */
export async function stopChrome(child) {
  if (child === undefined) return
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {}
      }
    }
  }
  if (child.exitCode !== null || child.signalCode !== null) return
  await Promise.race([new Promise((done) => child.once('exit', done)), sleep(5_000)])
}

/**
 * Start a headless Chrome on `profile` and wait, bounded, for its own DevTools endpoint.
 *
 * The port is Chrome's (`--remote-debugging-port=0`, read from the profile's DevToolsActivePort file), never a guess, so a port another process holds can
 * never stall the gate. Chrome's stderr and its `--enable-logging=stderr` output are kept and returned in the error, so a browser that will not start says
 * why (Defender, a first-run dialog, a profile lock) instead of only that it did not. On failure the whole tree is killed, the profile state is named
 * (exit code, DevToolsActivePort present or missing and its content), and the error carries the browser's last output.
 */
export async function startChrome(profile, { args = [], timeoutMs = 60_000 } = {}) {
  const chrome = findChrome()
  if (chrome === undefined)
    throw new Error('no Chrome or Chromium on this machine (set CHROME_BIN)')
  const child = spawn(
    chrome,
    [...chromeFlags(profile, 0), '--hide-scrollbars', '--enable-logging=stderr', ...args],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  )
  let output = ''
  const collect = (chunk) => {
    output = (output + chunk.toString()).slice(-8000)
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  const deadline = Date.now() + timeoutMs
  let port
  while (port === undefined && Date.now() < deadline && child.exitCode === null) {
    port = devToolsActivePort(profile)
    if (port === undefined) await sleep(100)
  }
  let ready = false
  while (port !== undefined && !ready && Date.now() < deadline) {
    ready = await fetch(`http://127.0.0.1:${String(port)}/json/version`).then(
      (reply) => reply.ok,
      () => false,
    )
    if (!ready && child.exitCode !== null) break
    if (!ready) await sleep(100)
  }
  if (!ready) {
    const portFile = join(profile, 'DevToolsActivePort')
    const state = existsSync(portFile)
      ? `present ${JSON.stringify(readFileSync(portFile, 'utf8').slice(0, 120))}`
      : 'missing'
    await stopChrome(child)
    // The CI frame job uploads this file on failure, so a browser that will not start keeps its evidence even when the step's console is trimmed.
    const log = join(tmpdir(), 'acryl-chrome-launch.log')
    const detail = `${new Date().toISOString()} chrome=${chrome} profile=${profile} exit=${String(child.exitCode)} DevToolsActivePort=${state} port=${String(port ?? 'none')}\n${output}\n`
    try {
      appendFileSync(log, detail)
    } catch {
      // A read-only temp folder only costs the artifact; the message below still carries the output.
    }
    throw new Error(
      `headless Chrome did not open its DevTools endpoint within ${String(timeoutMs)} ms (exit ${String(child.exitCode)}; DevToolsActivePort ${state}; ${port === undefined ? 'no port' : `port ${String(port)} did not answer /json/version`}; log ${log}):\n${output}`,
    )
  }
  return { child, port, output: () => output, stop: () => stopChrome(child) }
}

/** The flags a headless Chrome needs; on a CI runner (a container, a sandboxed user namespace) its own sandbox cannot start. */
export const chromeFlags = (profile, devPort) => [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${devPort}`,
  'about:blank',
]

/**
 * @param app the app folder (a created app, finished by the agent)
 * @param env the environment to start it in
 * @param expect text the feature must show on /notes (present) and on /notes?tag=alpha (`only`: shown, and `without`: not shown)
 */
export async function probeDoor(app, env, { tags = false } = {}) {
  const steps = []
  const step = (name, ok, detail = '') => {
    steps.push(`${ok ? 'ok' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`)
    if (process.env.CI) console.log(`door-probe: ${ok ? 'ok' : 'FAIL'} ${name}`)
    return ok
  }
  const chrome = findChrome()
  if (!chrome) {
    steps.push('skipped the door step: no Chrome or Chromium on this machine (set CHROME_BIN)')
    return { ok: true, steps, skipped: true }
  }
  const port = await freePort()
  const devPort = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'door-probe-'))
  const server = startGroup('npm', ['start'], {
    cwd: app,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  const base = `http://127.0.0.1:${port}`
  let browser
  try {
    if (
      !step(
        'npm start serves the port',
        (await until(() => fetch(`${base}/login`).then((r) => r.status === 200), 30_000)) === true,
        output.slice(0, 1500),
      )
    )
      return { ok: false, steps }
    const command = join(app, '.acryl', 'bin', 'acryl')
    if (!step('the running app wrote .acryl/bin/acryl', existsSync(command)))
      return { ok: false, steps }
    // A user with two notes, over HTTP (the door never types a password).
    const email = `door${Date.now()}@example.com`
    const post = (path, data, cookie = '') =>
      fetch(`${base}${path}`, {
        method: 'POST',
        redirect: 'manual',
        body: new URLSearchParams(data),
        headers: { origin: base, ...(cookie ? { cookie } : {}) },
      })
    const signup = await post('/signup', { email, password: 'correct horse battery' })
    const cookie = (signup.headers.get('set-cookie') ?? '').split(';')[0]
    if (!step('a user signs up (cookie set)', cookie !== '')) return { ok: false, steps }
    await post(
      '/notes',
      { title: 'Door tagged note', body: 'about tags', ...(tags ? { tags: 'alpha, beta' } : {}) },
      cookie,
    )
    await post(
      '/notes',
      { title: 'Door plain note', body: 'no tags here', ...(tags ? { tags: 'gamma' } : {}) },
      cookie,
    )

    // A cold headless Chrome on a busy runner can be slow or fail to start once: try twice, 30 s each.
    let cdp
    for (let attempt = 0; attempt < 2 && cdp === undefined; attempt++) {
      browser = spawn(chrome, chromeFlags(profile, devPort), { stdio: 'ignore' })
      cdp = await until(() => devtools(devPort), 30_000)
      if (cdp === undefined) browser.kill('SIGKILL')
    }
    if (!step('headless Chrome opens', cdp !== undefined)) return { ok: false, steps }
    await cdp.send('Network.enable')
    await cdp.send('Network.setCookie', {
      name: 'sid',
      value: cookie.slice(4),
      url: base,
      httpOnly: true,
    })
    const go = async (path) => {
      await cdp.send('Page.enable')
      await cdp.send('Page.navigate', { url: `${base}${path}` })
    }
    const look = () => {
      const r = spawnSync(command, ['look'], { cwd: app, encoding: 'utf8', env })
      return r.status === 0 ? r.stdout : ''
    }
    await go('/notes')
    const seen = await until(
      async () => {
        const text = look()
        return text.includes('Door tagged note') ? text : undefined
      },
      30_000,
      800,
    )
    if (
      !step(
        '`.acryl/bin/acryl look` shows the signed-in page of the running app',
        seen !== undefined,
      )
    )
      return { ok: false, steps }
    step(
      'look shows both notes',
      seen.includes('Door tagged note') && seen.includes('Door plain note'),
    )
    if (tags) {
      step("look shows a note's tags (alpha, beta)", /alpha/.test(seen) && /beta/.test(seen))
      await go('/notes?tag=alpha')
      const filtered = await until(
        async () => {
          const text = look()
          return /Page:/.test(text) &&
            text.includes('Door tagged note') &&
            !text.includes('Door plain note')
            ? text
            : undefined
        },
        20_000,
        800,
      )
      step('look on ?tag=alpha shows only the tagged note', filtered !== undefined)
    }
    cdp.close()
    // The door's state is the app's own and is never committed.
    const ignored = spawnSync('git', ['check-ignore', '-q', '.acryl/door.json'], { cwd: app })
    step('git ignores .acryl/door.json', ignored.status === 0 || !existsSync(join(app, '.git')))
  } catch (error) {
    step('the door step ran', false, error.message)
  } finally {
    browser?.kill('SIGKILL')
    await stopGroup(server)
    await sleep(300)
    rmSync(profile, { recursive: true, force: true })
  }
  return { ok: steps.every((line) => !line.startsWith('FAIL')), steps }
}
