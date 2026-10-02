/**
 * Real-Loader lifecycle mechanics for `acryl-agent-control` (spec 041 T022): PENDING while its dependencies are
 * missing, reactivation when they appear, restart on provider replacement, settling every pending call on
 * disposal, and no leak across repeated reloads. Mounted through a real `@deepseek-ai/cordis-plugin-loader`
 * Loader, a real HTTP server standing in for `webServer`, and a fake `tools` service that captures what was
 * registered so a mount can be counted. The `appInstance` service points the audit log at a temporary home.
 */

import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ChannelToPage } from '../../src/contract.ts'
import { UI_CONTROL_CHANNEL_PATH } from '../../src/host/stream.ts'

type ToolHandle = { execute(args: unknown, ctx: { signal: AbortSignal }): Promise<unknown> }

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const DISPOSED = 4 as FiberState.DISPOSED

let server: Server
let port = 0

beforeAll(async () => {
  server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

const roots: string[] = []
afterEach(() => {
  server.removeAllListeners('upgrade')
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A `webServer` whose routes are wired to the real HTTP server above, and which counts (de)registrations. */
function fakeWebServer() {
  const upgradeHandlers = new Map<string, (req: Parameters<Parameters<Server['on']>[1]>[0], socket: import('node:stream').Duplex, head: Buffer) => void>()
  server.on('upgrade', (req, socket, head) => {
    const handler = req.url !== undefined ? upgradeHandlers.get(req.url.split('?')[0] ?? '') : undefined
    handler?.(req, socket, head)
  })
  let registerCalls = 0
  let upgradeCalls = 0
  let releaseCalls = 0
  return {
    counts: () => ({ registerCalls, upgradeCalls, releaseCalls }),
    host: '127.0.0.1',
    port,
    register: (_route: unknown) => { registerCalls += 1; return () => { releaseCalls += 1 } },
    registerUpgrade: (route: { path: string; handler: (req: unknown, socket: unknown, head: unknown) => void }) => {
      upgradeCalls += 1
      upgradeHandlers.set(route.path, route.handler as never)
      return () => { releaseCalls += 1; upgradeHandlers.delete(route.path) }
    },
  }
}

/** A `tools` service that records every `defineTool` registration and its disposal, by name. */
function fakeTools() {
  const registered = new Map<string, unknown>()
  let registerCalls = 0
  let releaseCalls = 0
  return {
    counts: () => ({ registerCalls, releaseCalls, liveNames: [...registered.keys()].sort() }),
    get: (name: string) => registered.get(name),
    register: (tool: { name: string }) => {
      registerCalls += 1
      registered.set(tool.name, tool)
      return () => { releaseCalls += 1; registered.delete(tool.name) }
    },
  }
}

const BUILT_ENTRY = new URL('../../lib/index.js', import.meta.url).href

/**
 * Mounts the real, built `lib/index.js` (not the TypeScript source: Node's type-stripping loader cannot parse
 * this package's parameter-property constructors, and production Loader rows only ever run the built output
 * anyway). @throws if the package has not been built - run `pnpm run build` first.
 */
async function mount(): Promise<{ ctx: Context; entryId: string; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'acryl-agent-control-loader-'))
  roots.push(root)
  writeFileSync(join(root, 'row.mjs'), `export * from ${JSON.stringify(BUILT_ENTRY)}\n`)
  const ctx = new Context()
  // The app this plugin runs in (its audit log lives under the app's home): provided by every composition root, so
  // present from the start here too; the lifecycle under test is the one around webServer and tools.
  ctx.provide('appInstance' as never, { home: root, dshHome: join(root, '.dsh') } as never)
  await ctx.plugin(Loader, { baseUrl: `file://${root}/` })
  const entryId = await ctx.loader.create({ name: './row.mjs' })
  await ctx.loader.await()
  return { ctx, entryId, root }
}

function entryOf(ctx: Context, entryId: string) {
  const found = [...ctx.loader.entries()].find(candidate => candidate.id === entryId)
  if (found === undefined) throw new Error('entry not found')
  return found
}

const open = (): Promise<WebSocket> => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${String(port)}${UI_CONTROL_CHANNEL_PATH}`, { headers: { origin: `http://127.0.0.1:${String(port)}` } })
  ws.once('open', () => { resolve(ws) })
  ws.once('error', reject)
})
const until = async (check: () => boolean, label: string): Promise<void> => {
  for (let i = 0; i < 300; i += 1) { if (check()) return; await new Promise(resolve => { setTimeout(resolve, 10) }) }
  throw new Error(`timed out waiting for: ${label}`)
}

describe('acryl-agent-control through a real Loader', () => {
  it('is PENDING (not failed) without webServer and tools, and reactivates the moment both are provided', async () => {
    const { ctx, entryId } = await mount()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(PENDING)

    const web = fakeWebServer()
    ctx.provide('webServer' as never, web as never)
    ctx.provide('tools' as never, fakeTools() as never)
    await ctx.loader.await()

    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    // Its own two routes (the audit route and the channel upgrade), and its seven ui_* tools.
    expect(web.counts()).toMatchObject({ registerCalls: 1, upgradeCalls: 1 })
  })

  it('restarts cleanly when the tools provider is replaced, with no doubled registrations left behind', async () => {
    const { ctx, entryId } = await mount()
    const web = fakeWebServer()
    const firstTools = fakeTools()
    ctx.provide('webServer' as never, web as never)
    // `provide()` returns the disposer that retracts exactly this registration - the way to replace a
    // Cordis service safely (a second `provide()` for the same live name is rejected).
    let disposeTools = ctx.provide('tools' as never, firstTools as never)
    await ctx.loader.await()
    expect(firstTools.counts().liveNames).toEqual(['ui_click', 'ui_press', 'ui_scroll', 'ui_select', 'ui_snapshot', 'ui_type', 'ui_wait'])
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)

    const secondTools = fakeTools()
    disposeTools()
    disposeTools = ctx.provide('tools' as never, secondTools as never)
    await ctx.loader.await()

    // The old provider's registrations were released, not left dangling; the new one has exactly one set, not two.
    expect(firstTools.counts()).toMatchObject({ registerCalls: 7, releaseCalls: 7, liveNames: [] })
    expect(secondTools.counts().liveNames).toEqual(['ui_click', 'ui_press', 'ui_scroll', 'ui_select', 'ui_snapshot', 'ui_type', 'ui_wait'])
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    // The Host route and the upgrade route were each released once and registered again once - not accumulated.
    expect(web.counts()).toMatchObject({ registerCalls: 2, upgradeCalls: 2, releaseCalls: 2 })
  })

  it('settles a call that is still pending when the row is disabled, instead of leaving it hanging', async () => {
    const { ctx, entryId } = await mount()
    const web = fakeWebServer()
    const tools = fakeTools()
    ctx.provide('webServer' as never, web as never)
    ctx.provide('tools' as never, tools as never)
    await ctx.loader.await()

    const ws = await open()
    // The page connects but never answers: `ui_snapshot`'s call stays pending until the row unloads.
    let received: ChannelToPage | undefined
    ws.on('message', (raw) => { received = JSON.parse(raw.toString('utf8')) as ChannelToPage })
    ws.send(JSON.stringify({ t: 'hello', windowId: 'w1', focused: true }))
    const snapshotTool = tools.get('ui_snapshot') as ToolHandle
    const call = snapshotTool.execute({}, { signal: new AbortController().signal })
    await until(() => received !== undefined, 'the page to receive the call')

    await entryOf(ctx, entryId).update({ disabled: true })
    await ctx.loader.await()

    await expect(call).rejects.toThrow(/unloaded/i)
    // Loader 1.0.5 keeps a disabled entry's disposed Fiber rather than clearing it.
    const fiber = entryOf(ctx, entryId).fiber
    expect(fiber === undefined || fiber.state === DISPOSED).toBe(true)
    ws.close()
  })

  it('leaves no growing set of registrations after ten disable/enable cycles', async () => {
    const { ctx, entryId } = await mount()
    const web = fakeWebServer()
    const tools = fakeTools()
    ctx.provide('webServer' as never, web as never)
    ctx.provide('tools' as never, tools as never)
    await ctx.loader.await()

    for (let i = 0; i < 10; i += 1) {
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      await entryOf(ctx, entryId).update({ disabled: false })
      await ctx.loader.await()
    }

    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    // Exactly one live registration of each kind after 11 mounts (the first, plus ten reloads) - never more than one.
    expect(tools.counts().liveNames).toEqual(['ui_click', 'ui_press', 'ui_scroll', 'ui_select', 'ui_snapshot', 'ui_type', 'ui_wait'])
    const toolCounts = tools.counts()
    // Seven tools registered per mount, released per unmount (10 disables); a live mount is never doubled up.
    expect(toolCounts.registerCalls).toBe(11 * 7)
    expect(toolCounts.releaseCalls).toBe(10 * 7)
    const webCounts = web.counts()
    expect(webCounts.registerCalls).toBe(11)
    expect(webCounts.upgradeCalls).toBe(11)
    // Two disposers per mount (the Host route and the upgrade route), ten unmounts.
    expect(webCounts.releaseCalls).toBe(20)
  })
})
