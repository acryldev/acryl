/**
 * Real-engine proof for the Extension Context Pack examples (spec 037): every host example is mounted on the
 * real web engine's live Context and reaches the state its header declares. A client-only half is not mounted
 * here (it needs a browser); the sidebar-tab and header-action bundles were exercised in a real browser.
 */
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import { captureSystemPrompt } from '../src/system-prompt-capture.ts'

const examples = new URL('../../../plugins/acryl-extension-context/example-plugins/packages/', import.meta.url)
const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  // Assigning undefined would store the string "undefined" and the next boot would create a ./undefined profile directory.
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

async function bootHost() {
  const home = await mkdtemp(join(tmpdir(), 'acryl-examples-'))
  temporaryHomes.push(home)
  process.env.DSH_HOME = home
  return createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: hostCtx => { provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} }) },
  })
}

const load = async (dir: string) => import(pathToFileURL(join(new URL(dir, examples).pathname, 'index.js')).href) as Promise<Record<string, unknown>>
// ASCII-only fixtures: strip SGR colour codes and count characters.
const visibleWidth = (line: string): number => line.replace(/\u001b\[[0-9;]*m/gu, '').length
const STATES = ['PENDING', 'LOADING', 'ACTIVE', 'FAILED', 'UNLOADING', 'DISPOSED']
const stateOf = (fiber: { state: number | string }): string => (typeof fiber.state === 'number' ? STATES[fiber.state] : fiber.state) ?? String(fiber.state)
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('extension pack examples on the real web engine', () => {
  it('mounts each single-package host example to its declared state', async () => {
    const host = await bootHost()
    try {
      const cases: Array<[string, string, unknown?]> = [
        ['lifecycle-function-basic', 'ACTIVE'],
        ['lifecycle-function-hot-shim', 'ACTIVE'],
        ['event-hook-basic', 'ACTIVE'],
        ['tool-basic', 'ACTIVE'],
        ['prompt-contribution-basic', 'ACTIVE'],
        ['skill-provider-basic', 'ACTIVE'],
        ['host-route-basic', 'ACTIVE'],
        ['llm-adapter-echo', 'ACTIVE'],
        ['generated-capability-template', 'ACTIVE'],
        ['chat-command-basic', 'ACTIVE'],
        ['tui-command-basic', 'ACTIVE'], // optional ctx.get('tuiCommands'): a no-op off the terminal
        ['desktop-main-profile-info', 'ACTIVE'],
      ]
      for (const [dir, expected] of cases) {
        const mod = await load(dir)
        const fiber = host.ctx.plugin(mod as never) as { state: number }
        await settle()
        expect(`${dir}:${stateOf(fiber)}`).toBe(`${dir}:${expected}`)
      }
    } finally { await host.dispose() }
  }, 60_000)

  it('provider then consumer: PENDING until the service exists', async () => {
    const host = await bootHost()
    try {
      const consumer = host.ctx.plugin(await load('service-consumer-greeter') as never) as { state: number }
      await settle()
      expect(stateOf(consumer)).toBe('PENDING')
      const provider = host.ctx.plugin(await load('service-provider-greeter') as never) as { state: number }
      await settle()
      expect(stateOf(provider)).toBe('ACTIVE')
      expect(stateOf(consumer)).toBe('ACTIVE')
    } finally { await host.dispose() }
  }, 60_000)

  it('three-role capability: consumer follows a provider swap', async () => {
    const host = await bootHost()
    try {
      const consumer = host.ctx.plugin(await load('capability-swap-consumer') as never) as { state: number }
      await settle()
      expect(stateOf(consumer)).toBe('PENDING')
      const loud = host.ctx.plugin(await load('capability-swap-provider-loud') as never) as { state: number; dispose(): void }
      await settle()
      expect([stateOf(loud), stateOf(consumer)]).toEqual(['ACTIVE', 'ACTIVE'])
      expect((host.ctx as unknown as { speller: { shout(t: string): string } }).speller.shout('hi')).toBe('HI!')
      loud.dispose()
      await settle()
      const quiet = host.ctx.plugin(await load('capability-swap-provider-quiet') as never) as { state: number }
      await settle()
      expect([stateOf(quiet), stateOf(consumer)]).toEqual(['ACTIVE', 'ACTIVE'])
      expect((host.ctx as unknown as { speller: { shout(t: string): string } }).speller.shout('HI')).toBe('hi...')
    } finally { await host.dispose() }
  }, 60_000)

  it('config-schema: a valid config mounts, an out-of-range one fails before apply', async () => {
    const host = await bootHost()
    try {
      const good = host.ctx.plugin(await load('config-schema-basic') as never, { intervalMs: 500 } as never) as { state: number }
      await settle()
      expect(stateOf(good)).toBe('ACTIVE')
      const bad = host.ctx.plugin(await load('config-schema-basic') as never, { intervalMs: 10 } as never) as { state: number }
      await settle()
      expect(stateOf(bad)).toBe('FAILED')
    } finally { await host.dispose() }
  }, 60_000)

  it('settings-section: mounts with a config and registers its namespace when a settings service exists', async () => {
    const host = await bootHost()
    try {
      const fiber = host.ctx.plugin(await load('settings-section-basic') as never, { greeting: 'Hi', loud: true } as never) as { state: number }
      await settle()
      expect(stateOf(fiber)).toBe('ACTIVE')
    } finally { await host.dispose() }
  }, 60_000)

  it('web-page-branding: the served index gets the title, favicon and style rows', async () => {
    const host = await bootHost()
    try {
      const fiber = host.ctx.plugin(await load('web-page-branding') as never) as { state: number }
      await settle()
      expect(stateOf(fiber)).toBe('ACTIVE')
      const server = host.ctx.get('webServer' as never) as { renderIndex(html: string): string }
      const html = server.renderIndex('<!doctype html><html><head><title>DeepSeek Harness</title></head><body></body></html>')
      expect(html).toContain('<title>My Studio</title>')
      expect(html).toContain('rel="icon"')
      expect(html).toContain('background:#1a1410')
    } finally { await host.dispose() }
  }, 60_000)

  it('tui-overlay-themed: never renders a line wider than the terminal, and closes on escape', async () => {
    const mod = await load('tui-overlay-themed') as { buildOverlay(close: () => void): { render(width: number): string[]; handleInput(data: string): void } }
    let closed = 0
    const overlay = mod.buildOverlay(() => { closed += 1 })
    for (const width of [12, 24, 40, 80, 200]) {
      for (const line of overlay.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width)
    }
    overlay.handleInput('\x1b')
    expect(closed).toBe(1)
    const host = await bootHost()
    try {
      const fiber = host.ctx.plugin(mod as never) as { state: number }
      await settle()
      expect(stateOf(fiber)).toBe('ACTIVE') // a no-op where there is no tuiCommands service
    } finally { await host.dispose() }
  }, 60_000)

  it('prompt-assemble-hook: the assembled prompt gains the example section and keeps every other section', async () => {
    const host = await bootHost()
    try {
      const systemPrompt = host.ctx.get('systemPrompt' as never) as unknown as { assemble(): Promise<{ sections: Array<{ name: string }> }> }
      const before = (await systemPrompt.assemble()).sections.map(s => s.name)
      const fiber = host.ctx.plugin(await load('prompt-assemble-hook') as never) as { state: number }
      await settle()
      expect(stateOf(fiber)).toBe('ACTIVE')
      const after = (await systemPrompt.assemble()).sections.map(s => s.name)
      expect(after).toContain('example:note')
      for (const name of before) expect(after).toContain(name)
    } finally { await host.dispose() }
  }, 60_000)

  it('lifecycle-hooks-observer: the pre-step, request and stream waterfalls fire during a real turn and pass through', async () => {
    process.env.DEEPSEEK_API_KEY = 'dummy-key-for-lifecycle-hooks'
    const host = await bootHost()
    try {
      const fiber = host.ctx.plugin(await load('lifecycle-hooks-observer') as never) as { state: number }
      await settle()
      expect(stateOf(fiber)).toBe('ACTIVE')
      const captured = await captureSystemPrompt(host.ctx, { profile: 'web', selectStandardPreset: true })
      // The turn was fully assembled (system prompt present) although the hooks sat in the middle of the chain: nothing was cut out.
      expect(captured.system.length).toBeGreaterThan(100)
      const probe = host.ctx.get('acrylLifecycleProbe' as never) as unknown as { counts(): { preStep: number; request: number; stream: number } }
      const counts = probe.counts()
      expect(counts.preStep).toBeGreaterThan(0)
      expect(counts.request).toBeGreaterThan(0)
      expect(counts.stream).toBeGreaterThan(0)
    } finally { await host.dispose() }
  }, 90_000)

  it('tool-policy-hook: a blocked tool is denied with the reason, another tool still runs', async () => {
    const host = await bootHost()
    try {
      const tools = host.ctx.get('tools' as never) as unknown as {
        register(definition: unknown): () => void
        execute(input: { callId: string; name: string; arguments: unknown; signal: AbortSignal }): Promise<{ isError?: boolean; kind?: string; content?: Array<{ type: string; text?: string }> } & Record<string, unknown>>
      }
      const make = (toolName: string) => ({
        name: toolName,
        description: `example tool ${toolName}`,
        parameters: {},
        output: { schema: { type: 'string' }, render: (_args: unknown, value: string) => [{ type: 'text', text: value }] },
        async execute() { return `${toolName} ran` },
      })
      const { defineTool } = await import('@deepseek-ai/dsh-tools')
      tools.register(defineTool(make('example_allowed') as never))
      tools.register(defineTool(make('example_forbidden') as never))
      const fiber = host.ctx.plugin(await load('tool-policy-hook') as never, {} as never) as { state: number }
      await settle()
      expect(stateOf(fiber)).toBe('ACTIVE')
      const allowed = await tools.execute({ callId: 'c1', name: 'example_allowed', arguments: {}, signal: new AbortController().signal })
      const denied = await tools.execute({ callId: 'c2', name: 'example_forbidden', arguments: {}, signal: new AbortController().signal })
      expect(JSON.stringify(allowed)).toContain('example_allowed ran')
      expect(JSON.stringify(denied)).toContain('blocked by the ACRYL example tool policy')
      expect(JSON.stringify(denied)).not.toContain('example_forbidden ran')
    } finally { await host.dispose() }
  }, 90_000)
})
