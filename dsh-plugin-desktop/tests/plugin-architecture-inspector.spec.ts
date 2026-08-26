import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { inspectCordisContext } from '../src/plugin-architecture-inspector.ts'

describe('native Cordis architecture inspector', () => {
  it('projects distinct Fibers, dependencies, services, parentage, and effect ownership', async () => {
    const ctx = new Context()
    const provider = ctx.plugin({
      name: 'clock-provider',
      apply(pluginCtx) {
        pluginCtx.provide('clock', { secretValue: 'must-not-leak' })
        pluginCtx.effect(
          () => pluginCtx.effect(() => () => {}, 'inner timer'),
          'clock resources',
        )
        pluginCtx.plugin({ name: 'clock-child', apply() {} })
      },
    })
    await provider
    const consumer = ctx.plugin({
      name: 'clock-consumer',
      inject: ['clock'],
      apply() {},
    })
    await consumer

    const snapshot = inspectCordisContext(ctx, 'host')
    const providerView = snapshot.fibers.find(fiber => fiber.name === 'clock-provider')
    const childView = snapshot.fibers.find(fiber => fiber.name === 'clock-child')
    const consumerView = snapshot.fibers.find(fiber => fiber.name === 'clock-consumer')

    expect(snapshot.fibers[0]).toMatchObject({ uid: 0, name: 'root', parentUid: null })
    expect(providerView?.providedServices).toContain('clock')
    expect(providerView?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'clock resources' }),
    ]))
    expect(providerView?.effects.find(effect => effect.label === 'clock resources')?.children)
      .toEqual([expect.objectContaining({ label: 'inner timer' })])
    expect(childView?.parentUid).toBe(providerView?.uid)
    expect(consumerView?.dependencies).toEqual([{
      name: 'clock',
      status: 'resolved',
      providerFiberUid: providerView?.uid,
    }])
    expect(snapshot.services).toContainEqual(expect.objectContaining({
      name: 'clock',
      providerFiberUid: providerView?.uid,
    }))
    expect(JSON.stringify(snapshot)).not.toContain('must-not-leak')
  })

  it('keeps repeated mounts separate and reports missing injects', async () => {
    const ctx = new Context()
    const plugin = { name: 'repeatable', inject: ['absent'], apply() {} }
    ctx.plugin(plugin)
    ctx.plugin(plugin)

    const first = inspectCordisContext(ctx, 'client')
    const repeated = first.fibers.filter(fiber => fiber.name === 'repeatable')
    expect(repeated).toHaveLength(2)
    expect(new Set(repeated.map(fiber => fiber.uid)).size).toBe(2)
    expect(repeated.every(fiber => fiber.phase === 'pending')).toBe(true)
    expect(repeated.every(fiber => fiber.dependencies[0]?.status === 'missing')).toBe(true)
    expect(inspectCordisContext(ctx, 'client')).toEqual(first)
  })
})
