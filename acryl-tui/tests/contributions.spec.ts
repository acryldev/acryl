import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  TuiContributionRegistry,
  type TuiContribution,
} from '../src/render/contributions.ts'

const screen: TuiContribution = {
  id: 'architecture',
  kind: 'screen',
  label: 'Architecture',
  priority: 10,
  requiredCapabilities: ['architecture.inspect'],
}

describe('TuiContributionRegistry', () => {
  it('owns each contribution with the registering consumer Fiber', async () => {
    const ctx = new Context()
    const registryFiber = ctx.plugin(TuiContributionRegistry)
    await registryFiber
    const consumer = ctx.plugin({
      name: 'architecture-screen',
      inject: ['tuiContributions'],
      apply(child) {
        child.tuiContributions.register(child, screen)
      },
    })
    await consumer

    expect(ctx.tuiContributions.list()).toEqual([screen])
    await consumer.dispose()
    expect(ctx.tuiContributions.list()).toEqual([])
    await registryFiber.dispose()
  })

  it('orders contributions and rejects duplicate active ids', async () => {
    const ctx = new Context()
    const registryFiber = ctx.plugin(TuiContributionRegistry)
    await registryFiber
    const first = ctx.plugin({
      name: 'first-contribution',
      inject: ['tuiContributions'],
      apply(child) {
        child.tuiContributions.register(child, screen)
        child.tuiContributions.register(child, {
          id: 'status',
          kind: 'status',
          label: 'Status',
          priority: 0,
          requiredCapabilities: [],
        })
      },
    })
    await first
    expect(ctx.tuiContributions.list().map(item => item.id)).toEqual(['status', 'architecture'])

    await expect(ctx.plugin({
      name: 'duplicate-contribution',
      inject: ['tuiContributions'],
      apply(child) {
        child.tuiContributions.register(child, screen)
      },
    })).rejects.toThrow('duplicate TUI contribution id')

    await first.dispose()
    await registryFiber.dispose()
  })
})
