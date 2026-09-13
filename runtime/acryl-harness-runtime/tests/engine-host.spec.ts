import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createAcrylEngineHost,
  type AcrylEngineDefinition,
} from '../src/engine-host.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    testEngine: TestEngine
  }
}

class TestEngine extends Service {
  constructor(ctx: Context, readonly id: string) {
    super(ctx, 'testEngine')
  }
}

function engine(id: string, events: string[]): AcrylEngineDefinition {
  return {
    id,
    plugin: class extends TestEngine {
      constructor(ctx: Context) {
        super(ctx, id)
        ctx.effect(() => {
          events.push(`start:${id}`)
          return () => { events.push(`stop:${id}`) }
        })
      }
    },
  }
}

describe('createAcrylEngineHost', () => {
  const hosts: Awaited<ReturnType<typeof createAcrylEngineHost>>[] = []

  afterEach(async () => {
    await Promise.all(hosts.splice(0).map(host => host.dispose()))
  })

  it('loads the selected engine through one stable Loader row', async () => {
    const events: string[] = []
    const host = await createAcrylEngineHost({
      engines: [engine('dsh', events), engine('pi', events)],
      initialEngine: 'dsh',
    })
    hosts.push(host)

    expect(host.ctx.testEngine.id).toBe('dsh')
    expect(host.currentEngine()).toBe('dsh')
    expect(events).toEqual(['start:dsh'])
  })

  it('replaces the engine and reactivates a dependent consumer', async () => {
    const events: string[] = []
    const host = await createAcrylEngineHost({
      engines: [engine('dsh', events), engine('pi', events)],
      initialEngine: 'dsh',
    })
    hosts.push(host)
    let activations = 0
    let disposals = 0
    const consumer = host.ctx.plugin({
      inject: ['testEngine'],
      apply(ctx) {
        activations += 1
        ctx.effect(() => () => { disposals += 1 })
      },
    })
    await consumer

    await host.select('pi')

    expect(host.ctx.testEngine.id).toBe('pi')
    expect(host.currentEngine()).toBe('pi')
    expect(activations).toBe(2)
    expect(disposals).toBe(1)
    expect(events).toEqual(['start:dsh', 'stop:dsh', 'start:pi'])
  })

  it('keeps the active engine when selection names no registered provider', async () => {
    const events: string[] = []
    const host = await createAcrylEngineHost({
      engines: [engine('dsh', events)],
      initialEngine: 'dsh',
    })
    hosts.push(host)

    await expect(host.select('pi')).rejects.toThrow('unknown ACRYL engine: pi')

    expect(host.ctx.testEngine.id).toBe('dsh')
    expect(events).toEqual(['start:dsh'])
  })

  it('runs prepare on the bare root before any engine mounts, so its registrations are visible to the mounted engine', async () => {
    const events: string[] = []
    const host = await createAcrylEngineHost({
      engines: [engine('dsh', events)],
      initialEngine: 'dsh',
      prepare(ctx) {
        events.push('prepare')
        ctx.provide('testSurfaceService', 'surface-value')
      },
    })
    hosts.push(host)

    expect(events).toEqual(['prepare', 'start:dsh'])
    expect(host.ctx.get('testSurfaceService')).toBe('surface-value')
  })

  it('surfaces a synchronous prepare failure as host preparation, before any engine mounts', async () => {
    const events: string[] = []
    await expect(createAcrylEngineHost({
      engines: [engine('dsh', events)],
      initialEngine: 'dsh',
      prepare() { throw new Error('surface setup failed') },
    })).rejects.toThrow('surface setup failed')

    expect(events).toEqual([])
  })

  it('behaves exactly as before when prepare is omitted', async () => {
    const events: string[] = []
    const host = await createAcrylEngineHost({
      engines: [engine('dsh', events)],
      initialEngine: 'dsh',
    })
    hosts.push(host)

    expect(events).toEqual(['start:dsh'])
  })

  it('gives the host-owned engine row a resolution base URL, the same property dsh-client-modules reads for every Loader entry', async () => {
    // dsh-client-modules (Desktop/Web's client-bundle composer, absent from
    // the CLI/TUI profile - which is why no other test in this file caught
    // this) reads `entry.parent.tree.ctx.baseUrl` for every Loader entry and
    // throws if it is undefined. That property is a one-time snapshot
    // EntryTree's constructor takes of `ctx.baseUrl` when the Loader plugin
    // activates - reproduced directly (RED) as `undefined` for the
    // host-owned "acryl-engine-<id>" row before HOST_ROOT_BASE_URL existed.
    const events: string[] = []
    const host = await createAcrylEngineHost({
      engines: [engine('dsh', events)],
      initialEngine: 'dsh',
    })
    hosts.push(host)

    const entry = [...host.ctx.loader.entries()].find(candidate => candidate.options.name === 'cordis:acryl-engine-dsh')
    expect(entry).toBeDefined()
    expect((entry as { parent: { tree: { ctx: { baseUrl?: string } } } }).parent.tree.ctx.baseUrl).toBeDefined()
  })
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    testSurfaceService: string
  }
}
