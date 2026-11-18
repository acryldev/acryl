import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, createApp, readManifest } from '../src/app.ts'
import { FRAME_MOUNT_PREFIX } from '../src/todo.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Boot the app with its data in `home`, run the test, always stop it. In process by default (`app.root.router.request`); `listen` starts the real server on any free port; `prefix` mounts it where the frame does. */
async function withApp(
  home: string,
  run: (app: App) => Promise<void>,
  options: { listen?: boolean; prefix?: string } = {},
) {
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    listen: false,
    ...options,
  })
  try {
    await run(app)
  } finally {
    await app.stop()
  }
}

async function withHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'todo-test-'))
  try {
    await run(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

const send = (app: App, method: string, path: string, body?: unknown) =>
  app.root.router.request(`${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

test('creates, completes, lists and deletes', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const created = await send(app, 'POST', '/todo/api', { title: ' buy milk ' })
      assert.equal(created.status, 201)
      assert.deepEqual(await created.json(), { id: 1, title: 'buy milk', done: false })

      const done = await send(app, 'PATCH', '/todo/api/1', { done: true })
      assert.deepEqual(await done.json(), { id: 1, title: 'buy milk', done: true })
      assert.deepEqual(await (await send(app, 'GET', '/todo/api')).json(), [
        { id: 1, title: 'buy milk', done: true },
      ])

      assert.equal((await send(app, 'DELETE', '/todo/api/1')).status, 204)
      assert.deepEqual(await (await send(app, 'GET', '/todo/api')).json(), [])
    }),
  ))

/** A sandbox may forbid listening on a port (Codex's workspace-write does). The one test that needs a real connection (the origin check looks at who connected) is skipped there, and says so. */
/**
 * Whether this environment forbids listening at all: only a sandbox's refusal (EPERM/EACCES) means the real-server test must skip. A loaded
 * machine can fail a bind transiently, so that is retried briefly; any other outcome lets the real test run, where a host that truly cannot
 * listen fails loudly instead of hiding behind a skip.
 */
const canListen = await new Promise<boolean>((done) => {
  let attempts = 0
  const probeOnce = (): void => {
    attempts += 1
    const probe = createServer()
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPERM' || error.code === 'EACCES') done(false)
      else if (attempts < 3) setTimeout(probeOnce, 100)
      else done(true)
    })
    probe.listen(0, '127.0.0.1', () => probe.close(() => done(true)))
  }
  probeOnce()
})
const skip = canListen ? false : 'this environment does not allow listening on a port'
if (!canListen)
  console.log(
    `skipped: the test that starts the real server (${skip}); every other test ran in process`,
  )

test(
  'a change from a foreign origin is refused; a plain request from this machine works',
  { skip },
  () =>
    withHome((home) =>
      withApp(
        home,
        async (app) => {
          const post = (headers: Record<string, string>) =>
            fetch(`${app.url}/todo/api`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', ...headers },
              body: JSON.stringify({ title: 'x' }),
            })
          assert.equal((await post({ origin: 'http://evil.example' })).status, 403)
          assert.equal((await post({ origin: 'null' })).status, 403)
          assert.equal((await post({})).status, 201)
          assert.equal((await post({ origin: new URL(app.url).origin })).status, 201)
        },
        { listen: true },
      ),
    ),
)

test('rejects bad input and unknown ids', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      assert.equal((await send(app, 'POST', '/todo/api', { title: '' })).status, 400)
      assert.equal((await send(app, 'POST', '/todo/api', { title: 42 })).status, 400)
      assert.equal((await send(app, 'DELETE', '/todo/api/9')).status, 404)
      assert.equal((await send(app, 'PATCH', '/todo/api/9', { done: true })).status, 404)
      assert.equal((await send(app, 'GET', '/nope')).status, 404)
    }),
  ))

test('the list survives a restart: a second app on the same home sees it', () =>
  withHome(async (home) => {
    await withApp(home, async (app) => {
      await send(app, 'POST', '/todo/api', { title: 'first' })
      await send(app, 'POST', '/todo/api', { title: 'second' })
      await send(app, 'PATCH', '/todo/api/2', { done: true })
    })
    await withApp(home, async (app) => {
      const list = (await (await send(app, 'GET', '/todo/api')).json()) as Array<{
        id: number
        done: boolean
      }>
      assert.deepEqual(
        list.map((todo) => [todo.id, todo.done]),
        [
          [1, false],
          [2, true],
        ],
      )
      const created = (await (await send(app, 'POST', '/todo/api', { title: 'third' })).json()) as {
        id: number
      }
      assert.equal(created.id, 3)
    })
  }))

test('serves the page, and streams the list: now, and again on every change', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const page = await send(app, 'GET', '/todo')
      assert.equal(page.status, 200)
      assert.match(await page.text(), /<title>Todo<\/title>/)

      const controller = new AbortController()
      const stream = await app.root.router.request(`/todo/events`, { signal: controller.signal })
      const reader = stream.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      const until = async (what: RegExp) => {
        for (let waited = 0; !what.test(text) && waited < 3000; waited += 25) {
          const next = await Promise.race([
            reader.read(),
            new Promise<{ done: true; value: undefined }>((done) =>
              setTimeout(() => done({ done: true, value: undefined }), 25),
            ),
          ])
          if (next.value) text += decoder.decode(next.value, { stream: true })
        }
        assert.match(text, what)
      }
      await until(/data: \[\]/)
      await send(app, 'POST', '/todo/api', { title: 'streamed' })
      await until(/"title":"streamed"/)
      controller.abort()
    }),
  ))

test('the frame mounts the same app at /app; the app on its own server keeps /todo', () =>
  withHome((home) =>
    withApp(
      home,
      async (app) => {
        // The frame row claims the app's prefix on the host's web server; the app's own rows mount it there.
        const frame = await import('../src/frame.ts')
        assert.deepEqual([...frame.inject].sort(), ['routerHttp'])
        assert.equal(FRAME_MOUNT_PREFIX, '/app')
        const page = await app.root.router.request(FRAME_MOUNT_PREFIX)
        assert.equal(page.status, 200)
        const html = await page.text()
        assert.match(html, /<title>Todo<\/title>/)
        // The page writes every URL from the prefix it is mounted at.
        assert.match(html, new RegExp(`const base = "${FRAME_MOUNT_PREFIX}"`, 'u'))
        assert.deepEqual(await (await send(app, 'GET', `${FRAME_MOUNT_PREFIX}/api`)).json(), [])
        const created = await send(app, 'POST', `${FRAME_MOUNT_PREFIX}/api`, { title: 'framed' })
        assert.equal(created.status, 201)
        const list = (await (await send(app, 'GET', `${FRAME_MOUNT_PREFIX}/api`)).json()) as Array<{
          title: string
        }>
        assert.deepEqual(
          list.map((todo) => todo.title),
          ['framed'],
        )
        // The standalone URLs did not move: the app still answers under /todo on its own server.
        assert.equal((await send(app, 'GET', '/todo')).status, 404)
      },
      { prefix: FRAME_MOUNT_PREFIX },
    ),
  ))

test('the manifest decides what is mounted', () => {
  // The template's rows, in their order; a feature's row (plugins/<name>/) may sit between them.
  const library = ['router', 'state', 'todo', 'server', 'acryl-door']
  assert.deepEqual(
    readManifest()
      .plugins.map((row) => row.id)
      .filter((id) => library.includes(id)),
    library,
  )
})
