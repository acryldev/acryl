import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, createApp } from '../src/app.ts'
import { APP_NAME } from '../src/routes.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Boot the app in a throwaway home on any free port, run the test, always stop it and remove the home. */
async function withApp(run: (app: App) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    listen: false,
  })
  try {
    await run(app)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}

test('serves the index route', () =>
  withApp(async (app) => {
    const response = await app.root.router.request(`/`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { app: APP_NAME, ok: true })
  }))

test('answers health checks and 404 for unknown paths', () =>
  withApp(async (app) => {
    assert.equal((await app.root.router.request(`/health`)).status, 200)
    const missing = await app.root.router.request(`/nope`)
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  }))

test('a plugin puts its widget on the home page, and the widget leaves with the plugin', () =>
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
  const home = await mkdtemp(join(scratch, 'app-test-'))
  // The door is left out (ACRYL_DOOR=off): one process at a time serves a folder's door.
  process.env.ACRYL_DOOR = 'off'
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0))
  await app.stop()
  await assert.rejects(fetch(`${app.url}/health`))
  await rm(home, { recursive: true, force: true })
})

/** Boot in a given environment, with the warnings collected. */
async function inEnvironment(
  env: Record<string, string | undefined>,
  run: (app: App, warnings: string[]) => Promise<void>,
) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: unknown) => void warnings.push(String(message))
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    await withApp((app) => run(app, warnings))
  } finally {
    console.warn = warn
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const asking = (app: App) =>
  app.root.router.request('/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'add 2 3' }),
  })

test('in production the agent and the builder are left out and the extensions are read-only: no /ask, no live install, no approve route; the page and /health stay', () =>
  inEnvironment({ NODE_ENV: 'production', ACRYL_PRODUCTION_KEEP: undefined }, async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    assert.equal((await app.root.router.request('/')).status, 200)
    for (const [path, method] of [
      ['/ask', 'POST'],
      ['/extensions', 'GET'],
      ['/extensions/approve', 'POST'],
      ['/tasks', 'GET'],
    ] as const) {
      const response = await app.root.router.request(path, { method })
      assert.equal(response.status, 404, `${method} ${path} answered ${response.status}`)
      await response.body?.cancel()
    }
    assert.equal((app.root as unknown as { agent?: unknown }).agent, undefined)
    // The service is there (it starts what plugins/ holds, once) and refuses every change.
    const service = (
      app.root as unknown as { extensions?: { install(source: string): Promise<unknown> } }
    ).extensions
    assert.ok(service, 'the extensions service starts read-only in production')
    await assert.rejects(service.install('/anywhere'), /read-only here \(production\)/)
  }))

test('ACRYL_PRODUCTION_KEEP keeps the named rows in production and says so at start; a name it does not know is reported', () =>
  inEnvironment(
    { NODE_ENV: 'production', ACRYL_PRODUCTION_KEEP: 'agent,extensions,nope' },
    async (app, warnings) => {
      const answer = await asking(app)
      assert.equal(answer.status, 200)
      assert.equal(((await answer.json()) as { status: string }).status, 'completed')
      assert.equal((await app.root.router.request('/extensions')).status, 200)
      assert.ok(
        warnings.some((line) => line.includes('"agent" row runs in production')),
        warnings.join('\n'),
      )
      assert.ok(warnings.some((line) => line.includes('"extensions" row runs in production')))
      assert.ok(!warnings.some((line) => line.includes('"builder" row runs in production')))
      assert.ok(warnings.some((line) => line.includes('names "nope"')))
    },
  ))

test('outside production nothing changes: the agent answers and the extensions route is there', () =>
  inEnvironment({ NODE_ENV: 'test', ACRYL_PRODUCTION_KEEP: undefined }, async (app, warnings) => {
    assert.equal((await asking(app)).status, 200)
    assert.equal((await app.root.router.request('/extensions')).status, 200)
    assert.deepEqual(warnings, [])
  }))

test('the app has a /settings page with the appearance setting, and the home page applies it', () =>
  inEnvironment({ NODE_ENV: 'test', ACRYL_PRODUCTION_KEEP: undefined }, async (app) => {
    const settings = await app.root.router.request('/settings', {
      headers: { accept: 'text/html' },
    })
    assert.equal(settings.status, 200)
    const page = await settings.text()
    assert.match(page, /<h1>Settings<\/h1>/)
    assert.match(page, /<select id="theme"/)
    for (const option of ['System', 'Light', 'Dark'])
      assert.match(page, new RegExp(`>(?:Match the )?${option.toLowerCase()}|>${option}<`, 'i'))
    // The setting is kept in the browser and applied to the home page before it paints, by the one script every page of the app can carry.
    const home = await (
      await app.root.router.request('/', { headers: { accept: 'text/html' } })
    ).text()
    assert.match(home, /<script src="\/appearance\.js"><\/script>/)
    assert.match(page, /<script src="\/appearance\.js"><\/script>/)
    // ... without leaving a global behind for the page's own code to collide with.
    assert.doesNotMatch(home, /<script>\s*(?:var|let|const) /)
    const script = await app.root.router.request('/appearance.js')
    assert.equal(script.status, 200)
    assert.match(script.headers.get('content-type') ?? '', /javascript/)
    const code = await script.text()
    assert.match(code, /localStorage\.getItem\('theme'\)/)
    // A change made in another window of the app is applied here at once, and the colours are custom properties for a page to use.
    assert.match(code, /addEventListener\('storage'/)
    for (const token of ['--bg', '--fg', '--muted', '--surface', '--border', '--accent'])
      assert.ok(code.includes(token), token)
    assert.match(code, /prefers-color-scheme:dark/)
    // Run against a stand-in page: it applies the saved choice, follows a change made in another window, and goes back to the system's choice when the setting is removed.
    const storage = new Map<string, string>([['theme', 'dark']])
    const dataset: Record<string, string> = {}
    const appended: Array<{ id: string; textContent: string }> = []
    const listeners: Array<(event: { key: string | null }) => void> = []
    new Function('document', 'localStorage', 'addEventListener', code)(
      {
        documentElement: { dataset },
        head: { appendChild: (style: { id: string; textContent: string }) => appended.push(style) },
        createElement: () => ({ id: '', textContent: '' }),
      },
      { getItem: (key: string) => storage.get(key) ?? null },
      (_type: string, listener: (event: { key: string | null }) => void) =>
        listeners.push(listener),
    )
    assert.equal(dataset.theme, 'dark')
    assert.equal(appended[0]?.id, 'appearance')
    storage.set('theme', 'light')
    for (const listener of listeners) listener({ key: 'theme' })
    assert.equal(dataset.theme, 'light')
    storage.delete('theme')
    for (const listener of listeners) listener({ key: 'something-else' })
    assert.equal(dataset.theme, 'light')
    for (const listener of listeners) listener({ key: null })
    assert.equal(dataset.theme, undefined)
  }))

test('the frame row mounts the same routes under /app; the app on its own server keeps its old URLs', () =>
  inEnvironment({ NODE_ENV: 'test', ACRYL_PRODUCTION_KEEP: undefined }, async (app) => {
    // The frame row claims that prefix on the frame's web adapter only; the app's own rows mount the routes there (the generated app-plugins row),
    // so the frame row does not ask for the host router (127 app URLs).
    const frame = await import('../src/frame.ts')
    assert.deepEqual([...frame.inject].sort(), ['routerHttp'])
    const { FRAME_MOUNT_PREFIX, routes } = await import('../src/routes.ts')
    routes.apply(app.root, { prefix: FRAME_MOUNT_PREFIX })
    for (const path of ['', '/health', '/settings', '/appearance.js']) {
      const response = await app.root.router.request(`${FRAME_MOUNT_PREFIX}${path}`, {
        headers: { accept: 'text/html' },
      })
      assert.equal(response.status, 200, path)
      await response.body?.cancel()
    }
    // The page under the prefix writes its own URLs from it.
    const page = await (
      await app.root.router.request(`${FRAME_MOUNT_PREFIX}/settings`, {
        headers: { accept: 'text/html' },
      })
    ).text()
    assert.match(page, new RegExp(`src="${FRAME_MOUNT_PREFIX}/appearance.js"`, 'u'))
    assert.match(page, new RegExp(`href="${FRAME_MOUNT_PREFIX}/"`, 'u'))
    const missing = await app.root.router.request(`${FRAME_MOUNT_PREFIX}/nope`)
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  }))
