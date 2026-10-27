/**
 * `acryl-desktop/api` through a real `@deepseek-ai/cordis-plugin-loader` Loader (spec 048 T003): the real `router` and `routerHttp` rows over a
 * loopback Host whose `webServer` counts every prefix claim and release, the built plugin (`lib/api.js`, as production rows run it), and a
 * row standing in for the shell that declares exactly the shell's own `inject`. It proves the routes are served from two prefix mounts and no
 * exact route, that the plugin waits PENDING for the router, and that reloading the router row re-registers only the routes: one claim per
 * prefix after every reload, and the shell never unloaded. @throws if the package has not been built - run `pnpm run build` first.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it } from 'vitest'
import { inject as shellInject } from '../../src/index.ts'
import DesktopSettingsController from '../../src/settings/desktop-settings-controller.ts'
import { DESKTOP_SETTINGS_PATH } from '../../src/settings/desktop-settings-contract.ts'
import { RENDERER_BOOT_REPORT_PATH, type RendererBootReport } from '../../src/startup/renderer-boot-contract.ts'
import { DESKTOP_DIRECTORY_PICKER_PATH } from '../../src/workspaces/directory-picker-contract.ts'
import { DESKTOP_API_PREFIXES } from '../../src/api/http.ts'

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/** A loopback Host whose `webServer` serves prefix claims (longest first), as the Host does, and counts each claim and release. */
async function testHost(): Promise<{
  readonly origin: string
  readonly webServer: object
  counts(): { prefixes: string[], exactCalls: number, prefixCalls: number, releaseCalls: number }
  close(): Promise<void>
}> {
  const prefixes = new Map<string, Handler>()
  let prefixCalls = 0
  let exactCalls = 0
  let releaseCalls = 0
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const prefix = [...prefixes.keys()].filter(candidate => path === candidate || path.startsWith(`${candidate}/`)).sort((a, b) => b.length - a.length)[0]
    const handler = prefix === undefined ? undefined : prefixes.get(prefix)
    if (handler === undefined) { res.statusCode = 404; res.end(); return }
    void handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    webServer: {
      host: '127.0.0.1',
      port,
      register: (route: { kind: string, path: string, handler: Handler }) => {
        if (route.kind !== 'prefix') { exactCalls += 1; throw new Error(`unexpected ${route.kind} route ${route.path}`) }
        if (prefixes.has(route.path)) throw new Error(`duplicate prefix ${route.path}`)
        prefixCalls += 1
        prefixes.set(route.path, route.handler)
        return () => { releaseCalls += 1; prefixes.delete(route.path) }
      },
    },
    counts: () => ({ prefixes: [...prefixes.keys()].sort(), exactCalls, prefixCalls, releaseCalls }),
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { resolve() }) }),
  }
}

const roots: string[] = []
const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** The real module a row names, by file URL, as this package resolves it (the profile resolves the same copy). */
function moduleUrl(relative: string): string {
  return pathToFileURL(realpathSync(fileURLToPath(new URL(relative, import.meta.url)))).href
}

const BUILT_API = moduleUrl('../../lib/api.js')
const ROUTER = moduleUrl('../../node_modules/acrylblends/lib/cordis/router.js')
const ROUTER_HTTP = moduleUrl('../../node_modules/acrylblends/lib/cordis/router-http.js')

interface Mounted {
  readonly ctx: Context
  readonly host: Awaited<ReturnType<typeof testHost>>
  readonly rows: { readonly router: string, readonly routerHttp: string, readonly api: string, readonly shell: string }
  readonly reports: RendererBootReport[]
  shellDisposals(): number
}

async function mount(options: { platform?: NodeJS.Platform, router?: boolean } = {}): Promise<Mounted> {
  const root = mkdtempSync(join(tmpdir(), 'acryl-desktop-api-'))
  roots.push(root)
  const write = (file: string, source: string): string => { writeFileSync(join(root, file), source); return `./${file}` }
  // The shell's stand-in: exactly the shell's injects, and a count of every time it is disposed.
  ;(globalThis as { __shellDisposals?: number }).__shellDisposals = 0
  const shell = write('shell.mjs', [
    `export const name = 'desktop-shell'`,
    `export const inject = ${JSON.stringify(shellInject)}`,
    `export function apply(ctx) { ctx.effect(() => () => { globalThis.__shellDisposals += 1 }, 'shell stand-in') }`,
  ].join('\n'))
  const host = await testHost()
  closers.push(() => host.close())
  const reports: RendererBootReport[] = []
  const ctx = new Context()
  ctx.provide('webServer' as never, host.webServer as never)
  for (const service of ['webRuntime', 'appExit']) ctx.provide(service as never, {} as never)
  ctx.provide('acrylSettings' as never, { get: () => undefined, update: async () => {} } as never)
  ctx.provide('desktopRuntime' as never, {
    platform: options.platform ?? 'darwin',
    reportRendererBoot: (report: RendererBootReport) => { reports.push(report) },
    pickDirectory: async () => '/Users/x/proj',
    validateDirectory: async () => true,
  } as never)
  ctx.provide('desktopSettingsController' as never, new DesktopSettingsController({
    profiles: { current: { name: 'desktop', dir: '/p/desktop' }, list: () => [], create: () => { throw new Error('unused') } },
    persistProfileSelection: async () => {},
    readMarket: () => ({ requested: 'disabled', effective: 'disabled', legacyDefaulted: false }),
    selectMarket: async () => ({ requested: 'disabled', effective: 'disabled', legacyDefaulted: false }),
    scheduleRestart: () => {},
    openTerminal: () => {},
    exportDiagnostics: async () => {},
    openProfileCreator: () => {},
    prepareProfileRollback: () => ({ response: { accepted: true, restartRequired: true, targetProfile: 'desktop' } }),
  }) as never)
  await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
  const router = await ctx.loader.create({ name: write('router.mjs', `export * from ${JSON.stringify(ROUTER)}\n`), disabled: options.router === false })
  const routerHttp = await ctx.loader.create({ name: write('router-http.mjs', `export * from ${JSON.stringify(ROUTER_HTTP)}\n`) })
  const shellRow = await ctx.loader.create({ name: shell })
  const api = await ctx.loader.create({ name: write('api.mjs', `export * from ${JSON.stringify(BUILT_API)}\n`) })
  await ctx.loader.await()
  closers.unshift(async () => { await ctx.fiber.dispose() })
  return {
    ctx,
    host,
    rows: { router, routerHttp, api, shell: shellRow },
    reports,
    shellDisposals: () => (globalThis as { __shellDisposals?: number }).__shellDisposals ?? 0,
  }
}

function entryOf(ctx: Context, entryId: string) {
  const found = [...ctx.loader.entries()].find(candidate => candidate.id === entryId)
  if (found === undefined) throw new Error('entry not found')
  return found
}

const until = async (check: () => boolean, label: string): Promise<void> => {
  for (let i = 0; i < 300; i += 1) { if (check()) return; await new Promise(resolve => { setTimeout(resolve, 10) }) }
  throw new Error(`timed out waiting for: ${label}`)
}

const active = async (mounted: Mounted): Promise<void> => {
  await mounted.ctx.loader.await()
  await until(() => entryOf(mounted.ctx, mounted.rows.api).fiber?.state === ACTIVE, 'the api row to be ACTIVE')
}

/** A request from the renderer's own page: its `Origin` and same-origin fetch metadata. */
function fromPage(origin: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { origin, 'sec-fetch-site': 'same-origin', ...(init.headers as Record<string, string> | undefined) } }
}

describe('acryl-desktop/api through a real Loader', () => {
  it('serves every Desktop route from its two prefix mounts, and no exact route', async () => {
    const mounted = await mount()
    await active(mounted)
    const { origin } = mounted.host

    expect(mounted.host.counts()).toEqual({ prefixes: [...DESKTOP_API_PREFIXES].sort(), exactCalls: 0, prefixCalls: 2, releaseCalls: 0 })
    const settings = await fetch(`${origin}${DESKTOP_SETTINGS_PATH}`, fromPage(origin))
    expect(settings.status).toBe(200)
    expect(await settings.json()).toMatchObject({ current: 'desktop' })
    const boot = await fetch(`${origin}${RENDERER_BOOT_REPORT_PATH}`, fromPage(origin, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'healthy' }),
    }))
    expect(boot.status).toBe(204)
    expect(mounted.reports).toEqual([{ status: 'healthy' }])
    const picked = await fetch(`${origin}${DESKTOP_DIRECTORY_PICKER_PATH}`, fromPage(origin, { method: 'POST' }))
    expect(await picked.json()).toEqual({ path: '/Users/x/proj' })
    // Another page is refused before any handler runs.
    expect((await fetch(`${origin}${DESKTOP_SETTINGS_PATH}`, { headers: { origin: 'https://example.com' } })).status).toBe(403)
  })

  it('has no native picker route on Linux', async () => {
    const mounted = await mount({ platform: 'linux' })
    await active(mounted)
    const { origin } = mounted.host

    expect((await fetch(`${origin}${DESKTOP_DIRECTORY_PICKER_PATH}`, fromPage(origin, { method: 'POST' }))).status).toBe(404)
  })

  it('waits PENDING without the router, and activates when the router row is enabled', async () => {
    const mounted = await mount({ router: false })
    expect(entryOf(mounted.ctx, mounted.rows.api).fiber?.state).toBe(PENDING)
    expect(mounted.host.counts().prefixes).toEqual([])
    // The shell does not need the router: it is up while the routes wait.
    expect(entryOf(mounted.ctx, mounted.rows.shell).fiber?.state).toBe(ACTIVE)

    await entryOf(mounted.ctx, mounted.rows.router).update({ disabled: false })
    await active(mounted)
    expect(mounted.host.counts().prefixes).toEqual([...DESKTOP_API_PREFIXES].sort())
  })

  it('re-registers only the routes when the router row reloads: one claim per prefix each time, and the shell never unloads', async () => {
    const mounted = await mount()
    await active(mounted)
    const shellFiber = entryOf(mounted.ctx, mounted.rows.shell).fiber

    for (let i = 0; i < 3; i += 1) {
      await entryOf(mounted.ctx, mounted.rows.router).update({ disabled: true })
      await mounted.ctx.loader.await()
      expect(mounted.host.counts().prefixes).toEqual([])
      await entryOf(mounted.ctx, mounted.rows.router).update({ disabled: false })
      await active(mounted)
      expect(mounted.host.counts().prefixes).toEqual([...DESKTOP_API_PREFIXES].sort())
    }

    // Four activations (the first and three reloads), each claiming both prefixes once, each unload releasing both.
    expect(mounted.host.counts()).toEqual({ prefixes: [...DESKTOP_API_PREFIXES].sort(), exactCalls: 0, prefixCalls: 8, releaseCalls: 6 })
    expect(mounted.shellDisposals()).toBe(0)
    expect(entryOf(mounted.ctx, mounted.rows.shell).fiber).toBe(shellFiber)
    expect(shellFiber?.state).toBe(ACTIVE)
    const { origin } = mounted.host
    expect((await fetch(`${origin}${DESKTOP_SETTINGS_PATH}`, fromPage(origin))).status).toBe(200)
  })

  it('releases both prefixes when the api row unloads, and the shell stays', async () => {
    const mounted = await mount()
    await active(mounted)

    await entryOf(mounted.ctx, mounted.rows.api).update({ disabled: true })
    await mounted.ctx.loader.await()

    expect(mounted.host.counts()).toMatchObject({ prefixes: [], releaseCalls: 2 })
    expect(mounted.shellDisposals()).toBe(0)
  })
})
