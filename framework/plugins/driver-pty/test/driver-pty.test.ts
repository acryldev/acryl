import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as router from '../../acryl-router/src/index.ts'
import * as state from '../../acryl-state/src/index.ts'
import { agent, memory, model, tools } from '../../agent/index.ts'
import * as panel from '../../agent-panel/index.ts'
import { builder } from '../../builder/index.ts'
import { extensions } from '../../extensions/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import * as driverPty from '../index.ts'
import { loadNodePty, type PtyProcess, type PtySpawn } from '../spawn.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

const OWN = { 'sec-fetch-site': 'same-origin' }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A PTY process that is only an object: `typed` is what was written, `emit` makes it print, `end` makes it exit. */
function fakeSpawn() {
  const made: Array<{
    typed: string[]
    size: [number, number]
    killed: number
    emit(text: string): void
    end(code: number): void
  }> = []
  const spawn: PtySpawn = (_file, _args, options) => {
    let onData: (chunk: string) => void = () => {}
    let onExit: (exit: { exitCode: number }) => void = () => {}
    const entry = {
      typed: [] as string[],
      size: [options.cols, options.rows] as [number, number],
      killed: 0,
      emit: (text: string) => onData(text),
      end: (code: number) => onExit({ exitCode: code }),
    }
    made.push(entry)
    const proc: PtyProcess = {
      pid: 2 ** 22 + made.length, // no such process: the group is "gone" for the kill logic
      onData: (listener) => {
        onData = listener
      },
      onExit: (listener) => {
        onExit = listener
      },
      write: (data) => void entry.typed.push(data),
      resize: (cols, rows) => {
        entry.size = [cols, rows]
      },
      kill: () => {
        entry.killed += 1
        onExit({ exitCode: 0 })
      },
    }
    return proc
  }
  return { spawn, made }
}

/** An app with the panel and the PTY driver mounted, the way blend.yaml does it: one after another. */
async function boot(config: driverPty.DriverPtyConfig, mountPanel = true) {
  const saved = { NODE_ENV: process.env.NODE_ENV, ACRYL_DOOR: process.env.ACRYL_DOOR }
  process.env.NODE_ENV = 'test'
  delete process.env.ACRYL_DOOR
  const root = mkdtempSync(join(tmpdir(), 'pty-root-'))
  const app = new Context()
  const fibers: Array<ReturnType<Context['plugin']>> = []
  const mount = async (fiber: ReturnType<Context['plugin']>) => {
    fibers.push(fiber)
    await fiber.await()
    return fiber
  }
  await mount(app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })))
  await mount(app.plugin(router))
  await mount(app.plugin(state))
  await mount(
    app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
  )
  for (const plugin of [model, tools, memory, agent]) await mount(app.plugin(plugin))
  await mount(app.plugin(builder, {}))
  if (mountPanel)
    await mount(
      app.plugin(panel, {
        drivers: [],
        ...(config.mount === undefined ? {} : { mount: config.mount }),
      }),
    )
  const pty = await mount(app.plugin(driverPty, config))
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(root, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const base = config.mount ?? ''
  const token = mountPanel
    ? (
        (await (
          await app.router.request(`${base}/api/agent-panel/session`, { headers: OWN })
        ).json()) as {
          token: string
        }
      ).token
    : ''
  const headers = { 'content-type': 'application/json', ...OWN, 'x-agent-panel-token': token }
  const post = (path: string, body: unknown = {}, extra: Record<string, string> = headers) =>
    app.router.request(`${base}/api/driver-pty${path}`, {
      method: 'POST',
      headers: extra,
      body: JSON.stringify(body),
    })
  return { app, root, pty, headers, post, fibers }
}

interface SseEvent {
  event: string
  id?: string
  data: unknown
}
/** Reads server-sent events as they arrive; `until` says when to stop and cancel the stream. */
async function readEvents(response: Response, until: (events: SseEvent[]) => boolean) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const events: SseEvent[] = []
  let buffer = ''
  const deadline = Date.now() + 15_000
  while (!until(events) && Date.now() < deadline) {
    // A stream that says nothing must not hold the test past its deadline.
    const next = await Promise.race([
      reader.read(),
      new Promise<undefined>((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
    ])
    if (next === undefined) break
    const { value, done } = next
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      events.push({
        event: /^event: (.*)$/mu.exec(block)?.[1] ?? 'message',
        ...(/^id: (.*)$/mu.exec(block) ? { id: /^id: (.*)$/mu.exec(block)![1] } : {}),
        data: JSON.parse(/^data: (.*)$/mu.exec(block)?.[1] ?? 'null'),
      })
    }
  }
  await reader.cancel().catch(() => {})
  return events
}
const text = (events: SseEvent[]) =>
  events
    .filter((e) => e.event === 'data')
    .map((e) => e.data)
    .join('')

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('the panel lists the PTY drivers next to the chat ones, by kind', async () => {
  const { app } = await boot({ spawn: fakeSpawn().spawn, programs: { claude: [] } })
  const session = (await (
    await app.router.request('/api/agent-panel/session', { headers: OWN })
  ).json()) as { drivers: Array<{ name: string; kind: string }> }
  assert.deepEqual(session.drivers, [
    { name: 'agent', kind: 'chat' },
    {
      name: 'pty:claude',
      kind: 'terminal',
      view: { module: '/api/driver-pty/client/terminal.ts', prefix: '/api/driver-pty' },
    },
  ])
})

test('a hosted app keeps the terminal under its mount: the routes answer at /app/api/driver-pty and the session names the view there', async () => {
  const fake = fakeSpawn()
  const { app, post, headers } = await boot({
    spawn: fake.spawn,
    programs: { node: [] },
    mount: '/app',
  })
  // Nothing of the terminal answers at the root, where the host's own /api routes live.
  assert.equal(
    (
      await app.router.request('/api/driver-pty/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ driver: 'pty:node' }),
      })
    ).status,
    404,
  )
  const session = (await (
    await app.router.request('/app/api/agent-panel/session', { headers: OWN })
  ).json()) as { drivers: Array<{ name: string; kind: string }> }
  assert.deepEqual(session.drivers, [
    { name: 'agent', kind: 'chat' },
    {
      name: 'pty:node',
      kind: 'terminal',
      view: { module: '/app/api/driver-pty/client/terminal.ts', prefix: '/app/api/driver-pty' },
    },
  ])
  const started = await post('/sessions', { driver: 'pty:node', cols: 80, rows: 24 })
  assert.equal(started.status, 200)
  const { id } = (await started.json()) as { id: string }
  assert.equal(fake.made.length, 1)
  const stopped = await app.router.request(`/app/api/driver-pty/${id}/stop`, {
    method: 'POST',
    headers,
    body: '{}',
  })
  assert.equal(stopped.status, 200)
  // The session is over: input to it is refused.
  assert.equal((await post(`/${id}/input`, { data: 'x' })).status, 404)
  const view = await app.router.request('/app/api/driver-pty/client/terminal.ts')
  assert.equal(view.status, 200)
  assert.match(view.headers.get('content-type') ?? '', /javascript/u)
})

test('a session: output streams with ids, input and resize reach the process, the exit ends the stream', async () => {
  const fake = fakeSpawn()
  const { post, app, headers } = await boot({ spawn: fake.spawn, programs: { claude: ['--x'] } })
  const started = await post('/sessions', { driver: 'pty:claude', cols: 100, rows: 30 })
  assert.equal(started.status, 200)
  const { id } = (await started.json()) as { id: string }
  assert.deepEqual(fake.made[0]?.size, [100, 30])
  // A second terminal while one is open is refused.
  assert.equal((await post('/sessions', { driver: 'pty:claude' })).status, 409)

  fake.made[0]!.emit('hello ')
  const output = await app.router.request(`/api/driver-pty/${id}/output`, { headers })
  const reading = readEvents(output, (events) => events.some((e) => e.event === 'exit'))
  await sleep(30)
  fake.made[0]!.emit('world')
  assert.equal((await post(`/${id}/input`, { data: 'ls\r' })).status, 200)
  assert.equal((await post(`/${id}/resize`, { cols: 120, rows: 40 })).status, 200)
  fake.made[0]!.end(3)
  const events = await reading
  assert.equal(text(events), 'hello world')
  assert.deepEqual(
    events.filter((e) => e.event === 'data').map((e) => e.id),
    ['1', '2'],
  )
  assert.deepEqual(events.at(-1), { event: 'exit', data: { code: 3 } })
  assert.deepEqual(fake.made[0]?.typed, ['ls\r'])
  assert.deepEqual(fake.made[0]?.size, [120, 40])
  // The session is over: a new one may start, and the old one is gone for input.
  assert.equal((await post(`/${id}/input`, { data: 'x' })).status, 404)
  assert.equal((await post('/sessions', { driver: 'pty:claude' })).status, 200)
})

test('a reconnect replays from Last-Event-ID; one older than the buffer starts over', async () => {
  const fake = fakeSpawn()
  const { post, app, headers } = await boot({ spawn: fake.spawn, programs: { claude: [] } })
  const { id } = (await (await post('/sessions', { driver: 'pty:claude' })).json()) as {
    id: string
  }
  fake.made[0]!.emit('one ')
  fake.made[0]!.emit('two ')
  fake.made[0]!.emit('three')
  fake.made[0]!.end(0)
  const again = await readEvents(
    await app.router.request(`/api/driver-pty/${id}/output`, {
      headers: { ...headers, 'last-event-id': '1' },
    }),
    (events) => events.some((e) => e.event === 'exit'),
  )
  assert.equal(text(again), 'two three')

  // More than the 64 KB floor: the first chunks fall out of the buffer.
  const second = await post('/sessions', { driver: 'pty:claude' })
  const { id: id2 } = (await second.json()) as { id: string }
  const big = 'x'.repeat(40_000)
  for (let i = 0; i < 4; i++) fake.made[1]!.emit(big)
  fake.made[1]!.end(0)
  const replay = await readEvents(
    await app.router.request(`/api/driver-pty/${id2}/output`, {
      headers: { ...headers, 'last-event-id': '1' },
    }),
    (events) => events.some((e) => e.event === 'exit'),
  )
  assert.equal(replay[0]?.event, 'reset')
  assert.ok(text(replay).length >= 64 * 1024)
})

test('only the own page with the panel token may use it', async () => {
  const fake = fakeSpawn()
  const { post, headers, app } = await boot({ spawn: fake.spawn, programs: { claude: [] } })
  assert.equal(
    (await post('/sessions', { driver: 'pty:claude' }, { 'content-type': 'application/json' }))
      .status,
    403,
  )
  assert.equal(
    (
      await post(
        '/sessions',
        { driver: 'pty:claude' },
        { ...headers, 'sec-fetch-site': 'cross-site' },
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await post(
        '/sessions',
        { driver: 'pty:claude' },
        { ...headers, 'x-agent-panel-token': 'wrong' },
      )
    ).status,
    403,
  )
  assert.equal((await post('/sessions', { driver: 'agent' })).status, 400)
  assert.equal(fake.made.length, 0)
  const { id } = (await (await post('/sessions', { driver: 'pty:claude' })).json()) as {
    id: string
  }
  assert.equal(
    (await app.router.request(`/api/driver-pty/${id}/output`, { headers: OWN })).status,
    403,
  )
})

test('without a panel the plugin is pending and offers nothing; when the panel arrives it starts', async () => {
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  cleanup.push(() => {
    process.env.NODE_ENV = saved
  })
  const root = mkdtempSync(join(tmpdir(), 'pty-root-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const app = new Context()
  await app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })).await()
  await app.plugin(router).await()
  const fiber = app.plugin(driverPty, { spawn: fakeSpawn().spawn, programs: { claude: [] } })
  await fiber.await().catch(() => {})
  assert.equal(
    (app as unknown as { drivers?: unknown }).drivers,
    undefined,
    'no registry without the panel',
  )
  const { createDrivers } = await import('../../agent-panel/drivers.ts')
  const registry = createDrivers()
  app.provide('drivers', registry)
  await sleep(50)
  assert.deepEqual(
    registry.list().map((d) => d.name),
    ['pty:claude'],
  )
  await fiber.dispose()
  assert.deepEqual(registry.list(), [], 'the drivers leave with the plugin')
})

test('unloading the plugin with a session open ends the session: the stream ends, the routes leave, the audit has both lines', async () => {
  const fake = fakeSpawn()
  const { post, app, headers, pty, root } = await boot({
    spawn: fake.spawn,
    programs: { claude: [] },
  })
  const { id } = (await (await post('/sessions', { driver: 'pty:claude' })).json()) as {
    id: string
  }
  const reading = readEvents(
    await app.router.request(`/api/driver-pty/${id}/output`, { headers }),
    (events) => events.some((e) => e.event === 'exit'),
  )
  await sleep(30)
  await pty.dispose()
  // The stream ends (unloading also takes the plugin's routes and their open requests down; the page sees the stream close).
  await reading
  assert.equal(
    (await app.router.request(`/api/driver-pty/${id}/output`, { headers })).status,
    404,
    'the routes left with the plugin',
  )
  const audit = readFileSync(join(root, '.acryl', 'audit', 'driver-pty.jsonl'), 'utf8')
  assert.match(audit, /"session":"start"/u)
  assert.match(audit, /"session":"end"/u)
  assert.doesNotMatch(audit, /ls\r/u)
})

/** The real terminal: on a developer machine a sandbox may forbid PTYs and the test says so; on CI a load failure fails with its reason. */
async function realSpawn(t: { skip(reason: string): void }): Promise<PtySpawn | undefined> {
  try {
    return await loadNodePty()
  } catch (error) {
    if (process.env.CI) throw error
    t.skip(error instanceof Error ? error.message : String(error))
    return undefined
  }
}

/** A Node program that echoes what it is typed, prints its window size, and prints the size again on resize. */
const ECHO = [
  // Read stdin the way an agent CLI does (raw mode). Node learns of a ConPTY resize through its console input handling: on Windows a child that never
  // reads stdin keeps its start size (docs/plans/ide-host-inversion.md section 20). The POSIX path is unchanged; SIGWINCH reaches Node there.
  'if (process.platform === "win32") { process.stdin.setRawMode(true); process.stdin.resume() }',
  'process.stdout.write("size " + process.stdout.columns + "x" + process.stdout.rows + "\\n")',
  'process.stdout.on("resize", () => process.stdout.write("size " + process.stdout.columns + "x" + process.stdout.rows + "\\n"))',
  'process.stdin.on("data", (d) => process.stdout.write("typed " + JSON.stringify(String(d)) + "\\n"))',
].join(';')

/** The new size reached the terminal. Node on Windows does not raise `resize` for a ConPTY, so there the console's own resize report (`ESC [ 8 ; rows ; cols t`) is the evidence. */
const resized = (printed: string): boolean =>
  /size 110x35/u.test(printed) ||
  (process.platform === 'win32' && printed.includes('\u001b[8;35;110t'))

test('a real PTY: the program sees its size, a resize, and what is typed', async (t) => {
  const spawn = await realSpawn(t)
  if (!spawn) return
  // The driver runs `echo` as a program name; the fake spawn runs node with the script instead.
  const real = await boot({
    spawn: (_file, _args, options) => spawn(process.execPath, ['-e', ECHO], options),
    programs: { echo: [] },
  })
  const started = await real.post('/sessions', { driver: 'pty:echo', cols: 90, rows: 20 })
  const { id } = (await started.json()) as { id: string }
  // Each step waits for the one before it: the resize only after the program has printed its first size (a program that starts slowly, as on a Windows runner, would otherwise
  // start already at the new size), and the typing only after the new size reached the terminal.
  let step = 0
  const reading = readEvents(
    await real.app.router.request(`/api/driver-pty/${id}/output`, { headers: real.headers }),
    (events) => {
      const printed = text(events)
      if (step === 0 && /size \d+x\d+/u.test(printed)) {
        step = 1
        void real.post(`/${id}/resize`, { cols: 110, rows: 35 })
      } else if (step === 1 && resized(printed)) {
        step = 2
        void real.post(`/${id}/input`, { data: 'hi\r' })
      }
      return /typed "hi/u.test(printed) && resized(printed)
    },
  )
  const events = await Promise.race([reading, sleep(20_000).then(() => undefined)])
  if (events === undefined) {
    // A Windows build that still delivers no console resize to the child: the platform's own evidence is in section 20. Never a silent pass.
    if (process.platform === 'win32') {
      t.skip(
        'this Windows build delivers no console resize to the child; docs/plans/ide-host-inversion.md section 20',
      )
      return
    }
    assert.fail('the resize and the typed line did not arrive')
  }
  const shown = JSON.stringify(text(events))
  assert.match(text(events), /size 90x20/u, shown)
  assert.ok(resized(text(events)), shown)
  assert.match(text(events), /typed "hi/u, shown)
})

/** The program starts a child of its own, prints both pids and idles: ending the session must end both. */
const PARENT = [
  'const { spawn } = require("node:child_process")',
  'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })',
  'process.stdout.write("pids " + process.pid + " " + child.pid + "\\n")',
  'setInterval(() => {}, 1000)',
].join(';')

test('reloading the plugin with a real session open leaves no process behind', async (t) => {
  const spawn = await realSpawn(t)
  if (!spawn) return
  const { post, app, headers, pty } = await boot({
    spawn: (_f, _a, o) => spawn(process.execPath, ['-e', PARENT], o),
    programs: { tree: [] },
  })
  const { id } = (await (await post('/sessions', { driver: 'pty:tree' })).json()) as { id: string }
  const events = await readEvents(
    await app.router.request(`/api/driver-pty/${id}/output`, { headers }),
    (seen) => /pids \d+ \d+/u.test(text(seen)),
  )
  const [, parent, child] = /pids (\d+) (\d+)/u.exec(text(events)) ?? []
  assert.ok(parent && child, text(events))
  assert.equal(alive(Number(parent)), true)
  assert.equal(alive(Number(child)), true)
  await pty.dispose()
  assert.equal(alive(Number(parent)), false, 'the program is gone')
  assert.equal(alive(Number(child)), false, 'its child is gone')
})

test('a terminal that cannot start answers 500 with a plain reason and leaves no session behind', async () => {
  const { post } = await boot({
    spawn: () => {
      throw new Error('the native PTY refused this program')
    },
    programs: { node: [] },
  })
  const started = await post('/sessions', { driver: 'pty:node', cols: 80, rows: 24 })
  assert.equal(started.status, 500)
  assert.match(JSON.stringify(await started.json()), /could not start/u)
  // Nothing is held: a second start reaches the spawn again, it is not a 409 for a terminal that never existed.
  assert.equal((await post('/sessions', { driver: 'pty:node' })).status, 500)
})
