/**
 * Real-Loader lifecycle mechanics for `acryl-agent-control` (spec 041 T022): PENDING while its dependencies are
 * missing, reactivation when they appear, restart on provider replacement, settling every pending call on
 * disposal, and no leak across repeated reloads. Mounted through a real `@deepseek-ai/cordis-plugin-loader`
 * Loader, the real `router` and `routerHttp` over a loopback Host (`test-host.ts`), and a fake `tools` service that captures what
 * was registered so a mount can be counted. The `appInstance` service points the audit log at a temporary home.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ChannelToPage } from '../../src/contract.ts'
import { AGENT_CONTROL_API_PREFIX } from '../../src/host/http.ts'
import { UI_CONTROL_CHANNEL_PATH } from '../../src/host/stream.ts'
import { provideHost, testHost, type TestHost } from './test-host.ts'

type ToolHandle = { execute(args: unknown, ctx: { signal: AbortSignal }): Promise<unknown> }

const PENDING = 0 as FiberState.PENDING
const ACTIVE = 2 as FiberState.ACTIVE
const DISPOSED = 4 as FiberState.DISPOSED

const hosts: TestHost[] = []
let port = 0
const roots: string[] = []
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A fresh loopback Host for one test; the page channel's WebSocket opens on it. */
async function newHost(): Promise<TestHost> {
  const host = await testHost()
  hosts.push(host)
  port = host.port
  return host
}

/** A `tools` service that records every `defineTool` registration and its disposal, by name. */
function fakeTools() {
  const registered = new Map<string, unknown>()
  let registerCalls = 0
  let releaseCalls = 0
  return {
    counts: () => ({ registerCalls, releaseCalls, liveNames: [...registered.keys()].sort() }),
    get: (name: string) => registered.get(name),
    policy: () => () => {},
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
/** The Loader settles first; the row then activates once the router and its HTTP adapter (plugins of their own) are up. */
const active = async (ctx: Context, entryId: string): Promise<void> => {
  await ctx.loader.await()
  await until(() => entryOf(ctx, entryId).fiber?.state === ACTIVE, 'the row to be ACTIVE')
}

describe('acryl-agent-control through a real Loader', () => {
  it('is PENDING (not failed) without the Host, the router and tools, and reactivates the moment all are provided', async () => {
    const { ctx, entryId } = await mount()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(PENDING)

    const host = await newHost()
    provideHost(ctx, host)
    ctx.provide('acrylTools' as never, fakeTools() as never)
    await active(ctx, entryId)

    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    // Every HTTP route behind one prefix mount, no exact routes, and the page channel as its one upgrade.
    expect(host.counts()).toMatchObject({ prefixes: [AGENT_CONTROL_API_PREFIX], exact: [], upgrades: [UI_CONTROL_CHANNEL_PATH] })
  })

  it('stays PENDING without the router even with everything else present, and activates when it appears', async () => {
    const { ctx, entryId } = await mount()
    const host = await newHost()
    const { router } = provideHost(ctx, host, { router: false })
    ctx.provide('acrylTools' as never, fakeTools() as never)
    await ctx.loader.await()
    expect(entryOf(ctx, entryId).fiber?.state).toBe(PENDING)
    expect(host.counts()).toMatchObject({ prefixes: [], upgrades: [] })

    router()
    await active(ctx, entryId)
    await until(() => entryOf(ctx, entryId).fiber?.state === ACTIVE, 'the plugin to activate')
    expect(host.counts()).toMatchObject({ prefixes: [AGENT_CONTROL_API_PREFIX], upgrades: [UI_CONTROL_CHANNEL_PATH] })
  })

  it('restarts cleanly when the tools provider is replaced, with no doubled registrations left behind', async () => {
    const { ctx, entryId } = await mount()
    const host = await newHost()
    const firstTools = fakeTools()
    provideHost(ctx, host)
    // `provide()` returns the disposer that retracts exactly this registration - the way to replace a
    // Cordis service safely (a second `provide()` for the same live name is rejected).
    let disposeTools = ctx.provide('acrylTools' as never, firstTools as never)
    await active(ctx, entryId)
    expect(firstTools.counts().liveNames).toEqual(['ui_click', 'ui_press', 'ui_scroll', 'ui_select', 'ui_snapshot', 'ui_type', 'ui_wait'])
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)

    const secondTools = fakeTools()
    disposeTools()
    disposeTools = ctx.provide('acrylTools' as never, secondTools as never)
    await active(ctx, entryId)

    // The old provider's registrations were released, not left dangling; the new one has exactly one set, not two.
    expect(firstTools.counts()).toMatchObject({ registerCalls: 7, releaseCalls: 7, liveNames: [] })
    expect(secondTools.counts().liveNames).toEqual(['ui_click', 'ui_press', 'ui_scroll', 'ui_select', 'ui_snapshot', 'ui_type', 'ui_wait'])
    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    // The prefix mount and the upgrade were each released once and registered again once - not accumulated.
    expect(host.counts()).toMatchObject({ prefixes: [AGENT_CONTROL_API_PREFIX], prefixCalls: 2, exactCalls: 0, upgradeCalls: 2, releaseCalls: 2 })
  })

  it('settles a call that is still pending when the row is disabled, instead of leaving it hanging', async () => {
    const { ctx, entryId } = await mount()
    const host = await newHost()
    const tools = fakeTools()
    provideHost(ctx, host)
    ctx.provide('acrylTools' as never, tools as never)
    await active(ctx, entryId)

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
    const host = await newHost()
    const tools = fakeTools()
    provideHost(ctx, host)
    ctx.provide('acrylTools' as never, tools as never)
    await active(ctx, entryId)

    for (let i = 0; i < 10; i += 1) {
      await entryOf(ctx, entryId).update({ disabled: true })
      await ctx.loader.await()
      await entryOf(ctx, entryId).update({ disabled: false })
      await active(ctx, entryId)
    }

    expect(entryOf(ctx, entryId).fiber?.state).toBe(ACTIVE)
    // Exactly one live registration of each kind after 11 mounts (the first, plus ten reloads) - never more than one.
    expect(tools.counts().liveNames).toEqual(['ui_click', 'ui_press', 'ui_scroll', 'ui_select', 'ui_snapshot', 'ui_type', 'ui_wait'])
    const toolCounts = tools.counts()
    // Seven tools registered per mount, released per unmount (10 disables); a live mount is never doubled up.
    expect(toolCounts.registerCalls).toBe(11 * 7)
    expect(toolCounts.releaseCalls).toBe(10 * 7)
    // One prefix mount and one upgrade per activation, both released on each of the ten unloads; no exact routes ever.
    expect(host.counts()).toMatchObject({ prefixes: [AGENT_CONTROL_API_PREFIX], prefixCalls: 11, exactCalls: 0, upgradeCalls: 11, releaseCalls: 20 })
  })
})
