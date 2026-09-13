import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { AcrRuntimeArchitectureService } from '../src/architecture/provider.ts'
import {
  projectRuntimeArchitecture,
  type RuntimeArchitectureSnapshot,
} from '../src/architecture/projection.ts'

async function projected(ctx: Context, plane: 'host' | 'client' | 'tui'): Promise<RuntimeArchitectureSnapshot> {
  const fiber = ctx.plugin(AcrRuntimeArchitectureService)
  await fiber
  return ctx.acrRuntimeArchitecture.snapshot(plane)
}

describe('RuntimeArchitectureSnapshot', () => {
  it('projects native Fibers, services, effects, and injects without a parallel registry', async () => {
    const ctx = new Context()
    const greeter = ctx.plugin({
      name: 'greeter',
      provide: ['greeting'],
      apply(child) {
        child.provide('greeting', { hello: () => 'hi' })
        child.effect(() => () => {}, 'greeter-effect')
      },
    })
    const consumer = ctx.plugin({
      name: 'consumer',
      inject: ['greeting'],
      apply(child) {
        child.effect(() => () => {}, 'consumer-effect')
      },
    })
    await greeter
    await consumer

    const snapshot = await projected(ctx, 'host')

    expect(snapshot.plane).toBe('host')

    const root = snapshot.fibers.find(fiber => fiber.uid === 0)
    expect(root).toBeDefined()
    expect(root?.name).toBe('root')
    expect(root?.parentUid).toBeNull()

    const greeterView = snapshot.fibers.find(fiber => fiber.name === 'greeter')
    expect(greeterView?.phase).toBe('active')
    expect(greeterView?.providedServices).toContain('greeting')
    expect(greeterView?.effects.some(effect => effect.label === 'greeter-effect')).toBe(true)

    const consumerView = snapshot.fibers.find(fiber => fiber.name === 'consumer')
    expect(consumerView?.phase).toBe('active')
    const greetingDependency = consumerView?.dependencies.find(dep => dep.name === 'greeting')
    expect(greetingDependency?.status).toBe('resolved')
    expect(greetingDependency?.providerFiberUid).toBe(greeterView?.uid)

    const greetingService = snapshot.services.find(service => service.name === 'greeting')
    expect(greetingService?.providerName).toBe('greeter')
    expect(greetingService?.providerFiberUid).toBe(greeterView?.uid)
    expect(greetingService?.providerPhase).toBe('active')

    // The snapshot is pure data: no service values, callbacks, or references leak.
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    await consumer.dispose()
    await greeter.dispose()
  })

  it('reads live native state, so removal is reflected without any cached registry', async () => {
    const ctx = new Context()
    const greeter = ctx.plugin({
      name: 'greeter',
      provide: ['greeting'],
      apply(child) {
        child.provide('greeting', {})
      },
    })
    await greeter

    const snapshot = await projected(ctx, 'host')
    expect(snapshot.services.some(service => service.name === 'greeting')).toBe(true)

    await greeter.dispose()
    const after = ctx.acrRuntimeArchitecture.snapshot('host')
    expect(after.services.some(service => service.name === 'greeting')).toBe(false)
    expect(after.fibers.some(fiber => fiber.name === 'greeter')).toBe(false)
  })

  it('rejects effect labels that exceed the inspection bound', async () => {
    const ctx = new Context()
    const noisy = ctx.plugin({
      name: 'noisy',
      apply(child) {
        child.effect(() => () => {}, 'x'.repeat(600))
      },
    })
    await noisy

    expect(() => projectRuntimeArchitecture(ctx, 'host')).toThrow(/effect label/i)
    await noisy.dispose()
  })

  it('projects missing dependencies without a provider uid', async () => {
    const ctx = new Context()
    const waiting = ctx.plugin({
      name: 'waiting',
      inject: ['never-provided'],
      apply() {},
    })
    // A pending fiber never activates, so it reports the missing dependency.
    await Promise.resolve()

    const snapshot = await projected(ctx, 'host')
    const waitingView = snapshot.fibers.find(fiber => fiber.name === 'waiting')
    const dependency = waitingView?.dependencies.find(dep => dep.name === 'never-provided')
    expect(dependency?.status).toBe('missing')
    expect(dependency?.providerFiberUid).toBeNull()
    await waiting.dispose()
  })
})
