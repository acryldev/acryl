import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type {} from '../plugins/acryl-db/src/cordis.ts'
import type { Db } from '../plugins/acryl-db/src/index.ts'
import * as router from '../plugins/acryl-router/src/index.ts'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { chatAccess } from '../src/access.ts'
import { createApp as boot } from '../src/app.ts'
import { createApp } from '../src/chat-app.ts'
import { type Llm, openAiCompatible } from '../src/llm.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'

/** Throwaway homes and databases live inside the project (`.acrylblends/` is ignored by git), because a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * A fresh database file in a throwaway home with the real migrations, opened by the app's own `db` row (the whole Cordis app boots, so the test exercises the same
 * composition as production). Every app is stopped, and its home removed, when the tests end.
 */
const stops: (() => Promise<void>)[] = []
after(() => Promise.all(stops.map((stop) => stop())))
async function booted(options: { prefix?: string } = {}) {
  const home = await mkdtemp(join(scratch, 'chat-test-'))
  const app = await boot(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    database: join(home, 'test.sqlite'),
    listen: false,
    ...options,
  })
  stops.push(async () => {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  })
  return app
}
async function memoryDb(): Promise<Db> {
  return (await booted()).root.db
}

/** A model that answers with fixed pieces and records what it was asked. */
function mock(pieces: string[]) {
  const asked: { role: string; content: string }[][] = []
  const llm: Llm = async function* (messages) {
    asked.push(messages)
    for (const piece of pieces) yield piece
  }
  return { llm, asked }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

/** Parse a Server-Sent Events body into [event, data] pairs. */
function events(text: string): [string, string][] {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? ''
      return [event, data]
    })
}

test('the answer streams as events: meta, one token per piece, done', async () => {
  const { llm } = mock(['Hel', 'lo ', 'there\nline'])
  const app = createApp(await memoryDb(), llm)
  const res = await app.request('/api/chat', post({ message: 'hi' }))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)
  const got = events(await res.text())
  assert.deepEqual(
    got.map(([e]) => e),
    ['meta', 'token', 'token', 'token', 'done'],
  )
  assert.equal(
    got
      .filter(([e]) => e === 'token')
      .map(([, d]) => JSON.parse(d) as string)
      .join(''),
    'Hello there\nline',
  )
})

test('history is stored, sent back to the model, and listed', async () => {
  const { llm, asked } = mock(['ok'])
  const app = createApp(await memoryDb(), llm)
  const first = events(
    await (await app.request('/api/chat', post({ message: 'first question' }))).text(),
  )
  const id = (JSON.parse(first[0]![1]) as { conversation: number }).conversation
  await (await app.request('/api/chat', post({ message: 'second', conversation: id }))).text()
  assert.deepEqual(
    asked[1]?.map((m) => m.content),
    ['first question', 'ok', 'second'],
  )
  const one = (await (await app.request(`/api/conversations/${id}`)).json()) as {
    messages: { role: string }[]
  }
  assert.deepEqual(
    one.messages.map((m) => m.role),
    ['user', 'assistant', 'user', 'assistant'],
  )
  const list = (await (await app.request('/api/conversations')).json()) as {
    conversations: { title: string }[]
  }
  assert.equal(list.conversations[0]?.title, 'first question')
  const page = await (await app.request(`/?c=${id}`)).text()
  assert.match(page, /first question/)
  assert.match(page, /src="\/client\/chat\.tsx"/)
})

test('a bad message answers 400 with a message, an unknown conversation 404, and nothing reaches the model', async () => {
  const { llm, asked } = mock(['x'])
  const app = createApp(await memoryDb(), llm)
  const empty = await app.request('/api/chat', post({ message: '  ' }))
  assert.equal(empty.status, 400)
  assert.match(JSON.stringify(await empty.json()), /Write a message/)
  assert.equal(
    (await app.request('/api/chat', post({ message: 'hi', conversation: 99 }))).status,
    404,
  )
  assert.equal(asked.length, 0)
})

test('a conversation can be deleted', async () => {
  const app = createApp(await memoryDb(), mock(['a']).llm)
  const first = events(await (await app.request('/api/chat', post({ message: 'hi' }))).text())
  const id = (JSON.parse(first[0]![1]) as { conversation: number }).conversation
  assert.equal((await app.request(`/api/conversations/${id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await app.request(`/api/conversations/${id}`)).status, 404)
  assert.equal((await app.request(`/api/conversations/${id}`, { method: 'DELETE' })).status, 404)
})

test('a failing model sends an error event with a plain message and no detail', async () => {
  const llm: Llm = async function* () {
    yield 'partial '
    throw new Error('upstream secret detail')
  }
  const app = createApp(await memoryDb(), llm)
  const text = await (await app.request('/api/chat', post({ message: 'hi' }))).text()
  assert.doesNotMatch(text, /secret detail/)
  const last = events(text).at(-1)
  assert.equal(last?.[0], 'error')
  assert.match(last?.[1] ?? '', /could not answer/)
})

test('a model without its key tells the page which variable to set', async () => {
  const saved = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    const app = createApp(await memoryDb(), openAiCompatible)
    const last = events(await (await app.request('/api/chat', post({ message: 'hi' }))).text()).at(
      -1,
    )
    assert.equal(last?.[0], 'error')
    assert.match(last?.[1] ?? '', /DEEPSEEK_API_KEY is not set/)
  } finally {
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved
  }
})

test('when the client goes away the model call is aborted and what arrived is kept', async () => {
  let sawAbort: (value: boolean) => void = () => {}
  const aborted = new Promise<boolean>((resolve) => {
    sawAbort = resolve
  })
  const llm: Llm = async function* (_messages, signal) {
    yield 'first '
    // The signal may already be aborted by the time the model is asked for more: an abort event that has fired does not fire again.
    if (!signal.aborted)
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    sawAbort(signal.aborted)
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    yield 'never sent'
  }
  const db = await memoryDb()
  const app = createApp(db, llm)
  const controller = new AbortController()
  const res = await app.request('/api/chat', {
    ...post({ message: 'hi' }),
    signal: controller.signal,
  })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let seen = ''
  while (!seen.includes('first')) seen += decoder.decode((await reader.read()).value)
  controller.abort()
  assert.equal(await aborted, true)
  await new Promise((resolve) => setTimeout(resolve, 50))
  const rows = await db.all<{ role: string; content: string }>(
    'SELECT role, content FROM messages ORDER BY id',
  )
  assert.deepEqual(
    rows.map((r) => `${r.role}:${r.content}`),
    ['user:hi', 'assistant:first '],
  )
})

test('the chat page loads its client component, served by the running app', async () => {
  const running = await booted()
  const module = await running.root.router.request('/client/chat.tsx')
  assert.equal(module.status, 200)
  assert.match(module.headers.get('content-type') ?? '', /javascript/)
  assert.equal((await running.root.router.request('/client/@acrylblends/jsx-dom.js')).status, 200)
})

const production = (env: Record<string, string> = {}) =>
  chatAccess({ NODE_ENV: 'production', ...env })

test('in development the chat is open and prints nothing', () => {
  const { access, notices } = chatAccess({})
  assert.equal(access.kind, 'open')
  assert.deepEqual(notices, [])
})

test('in production the chat is closed until it has a token or is made public on purpose', async () => {
  const closed = production()
  assert.equal(closed.access.kind, 'closed')
  assert.match(closed.notices.join(), /closed/)
  const { llm, asked } = mock(['x'])
  const app = createApp(await memoryDb(), llm, closed.access)
  for (const path of ['/', '/api/conversations'])
    assert.equal((await app.request(path)).status, 503, path)
  assert.equal((await app.request('/api/chat', post({ message: 'hi' }))).status, 503)
  assert.equal((await app.request('/health')).status, 200)
  assert.equal(asked.length, 0)
})

test('with CHAT_ACCESS_TOKEN the browser must send it, as the password of a basic login', async () => {
  const gated = production({ CHAT_ACCESS_TOKEN: 'a-long-shared-token' })
  assert.equal(gated.access.kind, 'token')
  assert.deepEqual(gated.notices, [])
  const { llm, asked } = mock(['ok'])
  const app = createApp(await memoryDb(), llm, gated.access)
  const login = (password: string) => ({
    ...post({ message: 'hi' }),
    headers: {
      'content-type': 'application/json',
      authorization: `Basic ${Buffer.from(`me:${password}`).toString('base64')}`,
    },
  })
  assert.equal((await app.request('/api/chat', post({ message: 'hi' }))).status, 401)
  assert.equal((await app.request('/api/chat', login('wrong'))).status, 401)
  assert.equal((await app.request('/health')).status, 200)
  assert.equal(asked.length, 0)
  const ok = await app.request('/api/chat', login('a-long-shared-token'))
  assert.equal(ok.status, 200)
  assert.deepEqual(
    events(await ok.text()).map(([e]) => e),
    ['meta', 'token', 'done'],
  )
})

test('ACRYL_PRODUCTION_KEEP=chat makes the chat public with a loud WARNING and a per-address rate limit', async () => {
  const open = production({ ACRYL_PRODUCTION_KEEP: 'agent, chat', CHAT_RATE_PER_MINUTE: '2' })
  assert.equal(open.access.kind, 'public')
  assert.match(open.notices.join(), /^WARNING: the chat is public in production/)
  const { llm, asked } = mock(['ok'])
  const app = createApp(await memoryDb(), llm, open.access)
  const send = () => app.request('/api/chat', post({ message: 'hi' }))
  assert.equal((await (await send()).text()).includes('event: done'), true)
  assert.equal((await send()).status, 200)
  const limited = await send()
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
  assert.equal(asked.length, 2)
  // Other routes are not counted.
  assert.equal((await app.request('/api/conversations')).status, 200)
})

test('the frame mounts the chat at /app: the page, the streaming API and the client follow the prefix', async () => {
  const running = await booted({ prefix: FRAME_MOUNT_PREFIX })
  const page = await running.root.router.request(FRAME_MOUNT_PREFIX)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /<h1>Chat<\/h1>/u)
  assert.match(html, /data-base="\/app"/u)
  assert.match(html, /src="\/app\/client\/chat\.tsx"/u)
  assert.equal((await running.root.router.request(`${FRAME_MOUNT_PREFIX}/health`)).status, 200)
  // The streaming API answers at the prefix, with a local model.
  const { llm } = mock(['Hel', 'lo'])
  const root = new Context()
  try {
    await root.plugin(router)
    root.router.route(
      FRAME_MOUNT_PREFIX,
      createApp(running.root.db, llm, undefined, { prefix: FRAME_MOUNT_PREFIX }),
    )
    const res = await root.router.request(`${FRAME_MOUNT_PREFIX}/api/chat`, post({ message: 'hi' }))
    assert.equal(res.status, 200)
    const got = events(await res.text())
    assert.deepEqual(
      got.map(([e]) => e),
      ['meta', 'token', 'token', 'done'],
    )
    // The app's own URLs are not mounted in the frame; its own server keeps them (the tests above).
    assert.equal((await root.router.request('/health')).status, 404)
  } finally {
    await root.fiber.dispose()
  }
  // The client component is compiled and served below the app's prefix.
  const module = await running.root.router.request(`${FRAME_MOUNT_PREFIX}/client/chat.tsx`)
  assert.equal(module.status, 200)
  assert.match(module.headers.get('content-type') ?? '', /javascript/u)
  assert.equal(
    (await running.root.router.request(`${FRAME_MOUNT_PREFIX}/client/@acrylblends/jsx-dom.js`))
      .status,
    200,
  )
})
