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

const examples = new URL('../../../plugins/acryl-extension-context/examples/packages/', import.meta.url)
const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
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
})
