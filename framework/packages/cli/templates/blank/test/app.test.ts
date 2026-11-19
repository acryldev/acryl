import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, type AppOptions, createApp } from '../src/app.ts'
import { APP_NAME, FRAME_MOUNT_PREFIX } from '../src/routes.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Boot the app in a throwaway home on any free port, run the test, always stop it and remove the home. */
async function withApp(run: (app: App) => Promise<void>, options: AppOptions = {}) {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    ...options,
    listen: false,
  })
  try {
    await run(app)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}

test('serves the index route: the first screen to a browser, the JSON hello to an API client', () =>
  withApp(async (app) => {
    const api = await app.root.router.request(`/`)
    assert.equal(api.status, 200)
    assert.deepEqual(await api.json(), { app: APP_NAME, ok: true })
    const page = await app.root.router.request(`/`, {
      headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    })
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type') ?? '', /text\/html/)
    const html = await page.text()
    // The ACRYL frame's first tile asks for a page: the root must never hand it JSON (Chrome's viewer is nearly invisible in the dark frame).
    assert.ok(html.includes(`<h1>${APP_NAME}</h1>`), 'the page names the app')
    assert.ok(html.includes('href="./about"'), 'the page links to About relatively')
  }))

test('renders a .tsx page, and an error in it names the .tsx line', () =>
  withApp(async (app) => {
    const response = await app.root.router.request(`/about`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<main><h1>About<\/h1>/)
    const { failingPage } = await import('../src/about.tsx')
    let stack = ''
    try {
      failingPage()
    } catch (error) {
      stack = String((error as Error).stack)
    }
    assert.match(stack, /about\.tsx:\d+/)
  }))

test('answers health checks and 404 for unknown paths', () =>
  withApp(async (app) => {
    assert.equal((await app.root.router.request(`/health`)).status, 200)
    const missing = await app.root.router.request(`/nope`)
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  }))

test('the frame mounts the same app under /app; the app on its own server keeps its old URLs', async () => {
  // Standalone (production, `npm start`): the public URLs do not move.
  await withApp(async (app) => {
    for (const path of ['/', '/about', '/health']) {
      const response = await app.root.router.request(path)
      assert.equal(response.status, 200, path)
      await response.body?.cancel()
    }
  })
  // The frame composes the same blend.yaml rows at the one prefix the app names; src/frame.ts only claims that prefix on the frame's web server.
  const frame = await import('../src/frame.ts')
  assert.deepEqual([...frame.inject], ['routerHttp'])
  await withApp(
    async (app) => {
      for (const path of ['', '/about', '/health']) {
        const response = await app.root.router.request(`${FRAME_MOUNT_PREFIX}${path}`)
        assert.equal(response.status, 200, path)
        await response.body?.cancel()
      }
      const missing = await app.root.router.request(`${FRAME_MOUNT_PREFIX}/nope`)
      assert.equal(missing.status, 404)
      await missing.body?.cancel()
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('a plugin puts its widget on the first screen, and the widget leaves with the plugin', () =>
  withApp(async (app) => {
    const page = async () =>
      (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()
    const feature = app.root.plugin({
      name: 'hello-widget',
      inject: ['home'],
      apply(ctx: typeof app.root) {
        ctx.effect(() =>
          ctx.home.widget({
            id: 'hello-widget',
            title: 'Hello',
            render: () => '<p id="hello">hi</p>',
          }),
        )
      },
    })
    await feature.await()
    assert.match(
      await page(),
      /<section class="widget" data-widget="hello-widget">[\s\S]*<p id="hello">hi<\/p>/,
    )
    await feature.dispose()
    assert.doesNotMatch(await page(), /data-widget="hello-widget"/)
  }))

/** A sandbox may forbid listening on a port (Codex's workspace-write does); the one test that starts the real server is skipped there, and says so. */
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

test('stops listening when stopped', { skip }, async () => {
  // One process at a time serves a folder's door, and in the frame the frame's own door serves this folder: this server starts without one.
  const door = process.env.ACRYL_DOOR
  process.env.ACRYL_DOOR = 'off'
  const home = await mkdtemp(join(scratch, 'app-test-'))
  try {
    const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0))
    await app.stop()
    await assert.rejects(fetch(`${app.url}/health`))
  } finally {
    if (door === undefined) delete process.env.ACRYL_DOOR
    else process.env.ACRYL_DOOR = door
    await rm(home, { recursive: true, force: true })
  }
})

test('the manifest decides what is mounted: a parameter changes the server, an unknown value is refused', async () => {
  const { readManifest } = await import('../src/app.ts')
  const manifest = readManifest()
  // The template's rows, in their order; a feature's row (plugins/<name>/) may sit between them.
  const library = ['router', 'home', 'routes', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(
    manifest.plugins.map((row) => row.id).filter((id) => library.includes(id)),
    library,
  )
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})
