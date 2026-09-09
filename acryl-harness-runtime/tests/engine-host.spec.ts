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
})
