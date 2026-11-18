import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as router from '../../acryl-router/src/index.ts'
import * as state from '../../acryl-state/src/index.ts'
import { agent, memory, model, scripted, tools } from '../../agent/index.ts'
import { builder } from '../../builder/index.ts'
import { extensions } from '../../extensions/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import * as panel from '../index.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step()
})

const OWN = { 'sec-fetch-site': 'same-origin' }

/** An app with the agent family, the panel mounted BEFORE a page of the app's own. `panel` and `pagePrefix` mirror the frame host: the app mounted at a prefix. */
async function boot(
  env: Record<string, string | undefined> = {},
  options: { panel?: panel.PanelConfig; pagePrefix?: string } = {},
) {
  const saved = { NODE_ENV: process.env.NODE_ENV, ACRYL_DOOR: process.env.ACRYL_DOOR }
  process.env.NODE_ENV = env.NODE_ENV ?? 'test'
  if (env.ACRYL_DOOR === undefined) delete process.env.ACRYL_DOOR
  else process.env.ACRYL_DOOR = env.ACRYL_DOOR
  const root = mkdtempSync(join(tmpdir(), 'panel-root-'))
  const app = new Context()
  const fibers: Array<ReturnType<Context['plugin']>> = []
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(root, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  // One after another, as `blend.yaml` does (compose): the panel's middleware is mounted before the page it wraps.
  const mount = async (fiber: ReturnType<Context['plugin']>) => {
    fibers.push(fiber)
    await fiber.await()
  }
  for (const start of [
    () => app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })),
    () => app.plugin(router),
    () => app.plugin(state),
    () => app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
    () => app.plugin(model),
    () => app.plugin(tools),
    () => app.plugin(memory),
    () => app.plugin(agent),
    () => app.plugin(builder, {}),
    () => app.plugin(panel, { drivers: [], ...options.panel }),
    () =>
      app.plugin({
        name: 'page',
        inject: ['router'],
        apply(ctx: Context) {
          ctx.router.route(
            options.pagePrefix ?? '/',
            new router.Acryl()
              .get('/', (c) => c.html('<!doctype html><html><body><h1>Home</h1></body></html>'))
              .get('/data', (c) => c.json({ ok: true })),
          )
        },
      }),
  ])
    await mount(start())
  return { app, root }
}

/** The events of a finished server-sent stream. */
async function eventsOf(
  response: Response,
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => ({
      event: /^event: (.*)$/mu.exec(block)?.[1] ?? 'message',
      data: JSON.parse(/^data: (.*)$/mu.exec(block)?.[1] ?? '{}') as Record<string, unknown>,
    }))
}

test('the script tag is added to HTML pages and to nothing else', async () => {
  const { app } = await boot()
  const page = await (await app.router.request('/')).text()
  assert.match(
    page,
    /<script type="module" src="\/api\/agent-panel\/panel\.js"><\/script><\/body>/u,
  )
  assert.equal(await (await app.router.request('/data')).text(), '{"ok":true}')
})

test("a hosted app keeps the panel under its mount: the root's /api path is not the panel's, and the page carries the mounted tag", async () => {
  const { app } = await boot({}, { panel: { mount: '/app' }, pagePrefix: '/app' })
  const page = await (await app.router.request('/app')).text()
  assert.match(
    page,
    /<script type="module" src="\/app\/api\/agent-panel\/panel\.js"><\/script><\/body>/u,
  )
  assert.equal((await app.router.request('/api/agent-panel/session', { headers: OWN })).status, 404)
  const session = await app.router.request('/app/api/agent-panel/session', { headers: OWN })
  assert.equal(session.status, 200)
  const loader = await (await app.router.request('/app/api/agent-panel/panel.js')).text()
  assert.match(loader, /start\("\/app\/api\/agent-panel"\)/u)
  const main = await app.router.request('/app/api/agent-panel/client/main.ts')
  assert.equal(main.status, 200)
  assert.match(main.headers.get('content-type') ?? '', /javascript/u)
})

test('the mount must be empty or an absolute path without a trailing slash', async () => {
  for (const mount of ['app', '/app/', 'https://example.com'])
    await assert.rejects(
      async () => boot({}, { panel: { mount } }),
      /absolute path such as "\/app"/u,
    )
})

test("only the app's own page gets a session, and the token is needed to ask", async () => {
  const { app } = await boot()
  assert.equal((await app.router.request('/api/agent-panel/session')).status, 403)
  assert.equal(
    (
      await app.router.request('/api/agent-panel/session', {
        headers: { 'sec-fetch-site': 'cross-site' },
      })
    ).status,
    403,
  )
  const session = (await (
    await app.router.request('/api/agent-panel/session', { headers: OWN })
  ).json()) as { token: string; drivers: Array<{ name: string; kind: string }> }
  assert.deepEqual(session.drivers, [{ name: 'agent', kind: 'chat' }])
  assert.match(session.token, /^[\w-]{32}$/u)
  const ask = (headers: Record<string, string>, body: unknown) =>
    app.router.request('/api/agent-panel/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  assert.equal((await ask({}, { message: 'hi' })).status, 403)
  assert.equal((await ask(OWN, { message: 'hi' })).status, 403)
  assert.equal(
    (await ask({ ...OWN, 'x-agent-panel-token': 'wrong' }, { message: 'hi' })).status,
    403,
  )
  const good = { ...OWN, 'x-agent-panel-token': session.token }
  assert.equal((await ask(good, { message: '' })).status, 400)
  assert.equal((await ask(good, { message: 'hi', driver: 'claude' })).status, 400)
})

test('a message makes the agent build a feature live: tool events, a change event, and the page of the running app serves it', async () => {
  const { app, root } = await boot()
  const session = (await (
    await app.router.request('/api/agent-panel/session', { headers: OWN })
  ).json()) as { token: string }
  assert.equal((await app.router.request('/hello')).status, 404)
  const response = await app.router.request('/api/agent-panel/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...OWN, 'x-agent-panel-token': session.token },
    body: JSON.stringify({ message: 'create route hello /hello Hello' }),
  })
  assert.equal(response.status, 200)
  const events = await eventsOf(response)
  const names = events.map((e) => e.event)
  assert.ok(names.includes('tool'), names.join())
  assert.ok(names.includes('change'), names.join())
  assert.deepEqual(events.find((e) => e.event === 'change')?.data, {
    extension: 'hello',
    action: 'installed',
  })
  assert.equal(names.at(-1), 'done')
  assert.equal(events.at(-1)?.data.changed, true)
  assert.match(
    String(events.find((e) => e.event === 'text')?.data.text),
    /hello: installed, active/u,
  )
  // No restart: the same app answers the new route now.
  assert.deepEqual(await (await app.router.request('/hello')).json(), { text: 'Hello' })
  // Every ask is in the audit log, without its text.
  const audit = readFileSync(join(root, '.acryl', 'audit', 'agent-panel.jsonl'), 'utf8')
  assert.match(audit, /"ask":"start","driver":"agent"/u)
  assert.match(audit, /"ask":"end","driver":"agent","changed":true/u)
  assert.doesNotMatch(audit, /create route hello/u)
})

test("the panel's browser code is served and compiled for the browser", async () => {
  const { app } = await boot()
  const loader = await app.router.request('/api/agent-panel/panel.js')
  assert.equal(loader.status, 200)
  assert.match(await loader.text(), /agent-panel\/client\/main\.ts/u)
  const main = await app.router.request('/api/agent-panel/client/main.ts')
  assert.equal(main.status, 200)
  assert.match(main.headers.get('content-type') ?? '', /javascript/u)
  assert.doesNotMatch(await main.text(), /: Session|interface /u)
})

test('it is a development tool: with NODE_ENV=production or ACRYL_DOOR=off it adds nothing', async () => {
  for (const env of [{ NODE_ENV: 'production' }, { ACRYL_DOOR: 'off' }]) {
    const { app, root } = await boot(env)
    assert.doesNotMatch(await (await app.router.request('/')).text(), /agent-panel/u)
    assert.equal(
      (await app.router.request('/api/agent-panel/session', { headers: OWN })).status,
      404,
    )
    assert.equal(existsSync(join(root, '.acryl')), false)
    await cleanup.pop()?.()
  }
})

test('another plugin adds a chat driver to the registry; the panel lists it, runs it, and drops it when the plugin goes', async () => {
  const { app } = await boot()
  const session = async () =>
    (await (await app.router.request('/api/agent-panel/session', { headers: OWN })).json()) as {
      token: string
      drivers: Array<{ name: string; kind: string }>
    }
  const fiber = app.plugin({
    name: 'echo-driver',
    inject: ['drivers'],
    apply(ctx: Context) {
      ctx.effect(() =>
        ctx.drivers.register({
          kind: 'chat',
          name: 'echo',
          async *start({ message }) {
            yield { event: 'text', data: { text: `echo: ${message}` } }
          },
        }),
      )
    },
  })
  await fiber.await()
  const listed = await session()
  assert.deepEqual(
    listed.drivers.map((d) => d.name),
    ['agent', 'echo'],
  )
  const response = await app.router.request('/api/agent-panel/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...OWN, 'x-agent-panel-token': listed.token },
    body: JSON.stringify({ message: 'hi', driver: 'echo' }),
  })
  const events = await eventsOf(response)
  assert.deepEqual(
    events.map((e) => [e.event, e.data.text ?? e.data.changed]),
    [
      ['text', 'echo: hi'],
      ['done', false],
    ],
  )
  await fiber.dispose()
  assert.deepEqual(
    (await session()).drivers.map((d) => d.name),
    ['agent'],
  )
})

test('a plugin that injects drivers is pending while no panel is mounted, and starts when the panel arrives', async () => {
  const app = new Context()
  let registered = false
  const fiber = app.plugin({
    name: 'late-driver',
    inject: ['drivers'],
    apply(ctx: Context) {
      ctx.effect(() => {
        registered = true
        return () => {}
      })
    },
  })
  await fiber.await().catch(() => {})
  assert.equal(registered, false)
  const { createDrivers } = await import('../drivers.ts')
  app.provide('drivers', createDrivers())
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(registered, true)
  await fiber.dispose()
})

test('pi is offered when it has a DeepSeek key, from the environment or from its own stored login', async () => {
  const { piHasDeepseekKey } = await import('../headless.ts')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const home = mkdtempSync(join(tmpdir(), 'pi-home-'))
  cleanup.push(() => rmSync(home, { recursive: true, force: true }))
  assert.equal(piHasDeepseekKey({}, home), false, 'no key and no login')
  assert.equal(
    piHasDeepseekKey({ DEEPSEEK_API_KEY: 'k' }, home),
    true,
    'the key in the environment',
  )
  mkdirSync(join(home, '.pi', 'agent'), { recursive: true })
  writeFileSync(join(home, '.pi', 'agent', 'auth.json'), JSON.stringify({ openai: { key: 'x' } }))
  assert.equal(piHasDeepseekKey({}, home), false, 'a login for another provider does not count')
  writeFileSync(
    join(home, '.pi', 'agent', 'auth.json'),
    JSON.stringify({ deepseek: { type: 'api_key', key: 'k' } }),
  )
  assert.equal(piHasDeepseekKey({}, home), true, 'the DeepSeek key pi stored')
  writeFileSync(join(home, '.pi', 'agent', 'auth.json'), 'not json')
  assert.equal(piHasDeepseekKey({}, home), false, 'an unreadable file is no login')
})

test('a run belongs to the app: it goes on when the page that asked goes away, a page that loads next replays and follows it, and only Stop cancels it', async () => {
  const { app } = await boot()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let cancelled = false
  const fiber = app.plugin({
    name: 'slow-driver',
    inject: ['drivers'],
    apply(ctx: Context) {
      ctx.effect(() =>
        ctx.drivers.register({
          kind: 'chat',
          name: 'slow',
          async *start({ message, signal }) {
            signal.addEventListener('abort', () => {
              cancelled = true
            })
            yield { event: 'text', data: { text: `start: ${message}` } }
            await Promise.race([
              gate,
              new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve())),
            ])
            yield { event: 'text', data: { text: 'finish' } }
          },
        }),
      )
    },
  })
  await fiber.await()
  const { token } = (await (
    await app.router.request('/api/agent-panel/session', { headers: OWN })
  ).json()) as { token: string }
  const headers = { 'content-type': 'application/json', ...OWN, 'x-agent-panel-token': token }
  assert.equal(
    (await app.router.request('/api/agent-panel/run', { headers })).headers
      .get('content-type')
      ?.includes('json'),
    true,
    'no run yet',
  )

  // The page that asked reads the first event and goes away.
  const asked = await app.router.request('/api/agent-panel/ask', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'build', driver: 'slow' }),
  })
  const reader = asked.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.match(first, /start: build/)
  await reader.cancel()
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(cancelled, false, 'the run went on')
  assert.equal(
    (
      await app.router.request('/api/agent-panel/ask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'again', driver: 'slow' }),
      })
    ).status,
    409,
    'one run at a time',
  )

  // The next page: the question, the events so far, and the rest.
  const followed = app.router.request('/api/agent-panel/run', { headers })
  const events = eventsOf(await followed)
  release()
  const seen = await events
  assert.deepEqual(
    seen.map((e) => [e.event, e.data.message ?? e.data.text ?? e.data.changed]),
    [
      ['run', 'build'],
      ['text', 'start: build'],
      ['text', 'finish'],
      ['done', false],
    ],
  )
  assert.equal(seen[0]!.data.ended, false)
  // After it ended, a page that loads gets it again, marked ended, and it does not restart.
  const later = await eventsOf(await app.router.request('/api/agent-panel/run', { headers }))
  assert.equal(later[0]!.data.ended, true)
  assert.deepEqual(
    later.slice(1).map((e) => e.event),
    ['text', 'text', 'done'],
  )

  // Stop cancels.
  const second = await app.router.request('/api/agent-panel/ask', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'stop me', driver: 'slow' }),
  })
  const secondReader = second.body!.getReader()
  await secondReader.read()
  assert.equal(
    (await app.router.request('/api/agent-panel/stop', { method: 'POST', headers })).status,
    200,
  )
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(cancelled, true, 'Stop cancelled the run')
  await secondReader.cancel()
  assert.equal(
    (
      await app.router.request('/api/agent-panel/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
    ).status,
    403,
  )
})

test("as the Assistant every visitor is their own: their own cookie, token, run, Stop and replay, and only the app's agent", async () => {
  const { app } = await boot({}, { panel: { assistant: true } })
  // A tool that holds a run until it is released or stopped, so two runs can go at once.
  const released = new Set<string>()
  const stopped = new Set<string>()
  app.tools.register('hold', {
    description: 'holds the run',
    run: async (input, options) => {
      const who = String((input as { who?: string }).who)
      while (!released.has(who)) {
        if (options?.signal?.aborted) {
          stopped.add(who)
          throw options.signal.reason
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return `released ${who}`
    },
  })
  scripted(app.model)?.teach(({ question, step, toolResult }) =>
    step === 0
      ? { tool: 'hold', input: { who: question } }
      : { text: `answer to ${question}: ${String(toolResult)}` },
  )
  // A plugin's driver is never offered to a visitor, and its endpoints refuse them.
  app.drivers.register({
    kind: 'chat',
    name: 'coder',
    async *start() {
      yield { event: 'text', data: { text: 'coding' } }
    },
  })

  const visit = async () => {
    const response = await app.router.request('/api/agent-panel/session', { headers: OWN })
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const session = (await response.json()) as { token: string; drivers: Array<{ name: string }> }
    const headers = {
      'content-type': 'application/json',
      ...OWN,
      cookie,
      'x-agent-panel-token': session.token,
    }
    return { cookie, token: session.token, drivers: session.drivers, headers }
  }
  const a = await visit()
  const b = await visit()
  assert.match(a.cookie, /^acryl-visitor=[\w-]+$/u)
  assert.notEqual(a.cookie, b.cookie)
  assert.notEqual(a.token, b.token)
  assert.deepEqual(
    a.drivers.map((driver) => driver.name),
    ['agent'],
  )
  assert.equal(app.drivers.authorized(new Headers(a.headers)), false)
  const ask = (who: typeof a, message: string, driver = 'agent') =>
    app.router.request('/api/agent-panel/ask', {
      method: 'POST',
      headers: who.headers,
      body: JSON.stringify({ message, driver }),
    })
  assert.equal((await ask(a, 'code something', 'coder')).status, 400)

  // A asks; B asks while A's run goes, and is not refused for it.
  const askedA = await ask(a, 'A')
  assert.equal(askedA.status, 200)
  const askedB = await ask(b, 'B')
  assert.equal(askedB.status, 200)
  // A token works with its own cookie only.
  assert.equal(
    (
      await app.router.request('/api/agent-panel/run', {
        headers: { ...b.headers, 'x-agent-panel-token': a.token },
      })
    ).status,
    403,
  )
  // B's Stop stops B's run, not A's.
  assert.equal(
    (await app.router.request('/api/agent-panel/stop', { method: 'POST', headers: b.headers }))
      .status,
    200,
  )
  const eventsB = await eventsOf(askedB)
  // The run ends cancelled at once; the held tool sees its signal at its next check.
  for (let tries = 0; tries < 100 && !stopped.has('B'); tries++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(stopped.has('B'), true)
  assert.equal(stopped.has('A'), false)
  assert.equal(
    eventsB.some((e) => String(e.data.text ?? '').includes('answer to')),
    false,
  )
  released.add('A')
  const eventsA = await eventsOf(askedA)
  assert.equal(
    eventsA.some((e) => e.data.text === 'answer to A: released A'),
    true,
  )
  // Each replay is the visitor's own latest run.
  const replayA = await eventsOf(
    await app.router.request('/api/agent-panel/run', { headers: a.headers }),
  )
  const replayB = await eventsOf(
    await app.router.request('/api/agent-panel/run', { headers: b.headers }),
  )
  assert.equal(replayA[0]?.data.message, 'A')
  assert.equal(replayB[0]?.data.message, 'B')
})
