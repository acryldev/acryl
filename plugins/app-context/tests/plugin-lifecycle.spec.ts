/**
 * A Blends frame's `acrPluginLifecycle` (spec 052 T055d): the app's plugins listed and switched through the frame's own port, the frame's rows locked, changes
 * one at a time, and the service there while the frame provides its plugins.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { lifecycleOver, provideAcrPluginLifecycle, type FrameAppPluginsPort } from '../src/plugin-lifecycle.ts'

function fakeFrame() {
  const on = new Map([['notes', true], ['home', true], ['tasks', false]])
  const calls: string[] = []
  const port: FrameAppPluginsPort = {
    list: () => [
      { name: 'notes', kind: 'made', on: on.get('notes') === true },
      { name: 'home', kind: 'row', on: on.get('home') === true },
      { name: 'tasks', kind: 'row', on: on.get('tasks') === true },
    ],
    frame: () => [{ id: 'acryl-settings', name: '@acryldev/settings', disabled: false, fiberState: 2 }],
    switch: async (kind, name, value) => { calls.push(`${kind} ${name} ${String(value)}`); on.set(name, value) },
    restart: async () => { calls.push('restart') },
  }
  return { port, calls }
}

describe('the lifecycle over a frame\'s plugins', () => {
  it('lists the app\'s plugins as changeable and the frame\'s rows as locked', () => {
    const entries = lifecycleOver(fakeFrame().port).snapshot().entries
    expect(entries.map(entry => [entry.entryId, entry.enabled, entry.mutable, entry.hostPhase])).toEqual([
      ['app:notes', true, true, null],
      ['app:home', true, true, null],
      ['app:tasks', false, true, null],
      ['frame:acryl-settings', true, false, 'active'],
    ])
    expect(entries.at(-1)?.protectedReason).toContain('frame')
  })

  it('switches through the frame by the plugin\'s kind and answers with the new list', async () => {
    const { port, calls } = fakeFrame()
    const receipt = await lifecycleOver(port).setEnabled('app:notes', false)
    expect(calls).toEqual(['made notes false'])
    expect(receipt).toMatchObject({ accepted: true, action: 'disable', entryIds: ['app:notes'] })
    expect(receipt.snapshot.entries.find(entry => entry.entryId === 'app:notes')?.enabled).toBe(false)
  })

  it('refuses a frame row, an unknown id and a switch that changes nothing, and runs changes one at a time', async () => {
    const { port, calls } = fakeFrame()
    const lifecycle = lifecycleOver(port)
    await expect(lifecycle.setEnabled('frame:acryl-settings', false)).rejects.toMatchObject({ code: 'protected-entry' })
    await expect(lifecycle.setEnabled('app:nothing', false)).rejects.toMatchObject({ code: 'unknown-entry' })
    await expect(lifecycle.setEnabled('app:tasks', false)).rejects.toMatchObject({ code: 'already-disabled' })
    const both = await Promise.all([lifecycle.setEnabled('app:tasks', true), lifecycle.setEnabled('app:home', false)])
    expect(both.map(receipt => receipt.action)).toEqual(['enable', 'disable'])
    expect(calls).toEqual(['row tasks true', 'row home false'])
  })

  it('restarts the app\'s plugins for a reload, and reports a failing switch as a lifecycle failure', async () => {
    const { port, calls } = fakeFrame()
    expect((await lifecycleOver(port).reload()).entryIds).toEqual(['app:notes', 'app:home'])
    expect(calls).toEqual(['restart'])
    const failing = lifecycleOver({ ...port, switch: async () => { throw new Error('blend.yaml is read-only') } })
    await expect(failing.setEnabled('app:notes', false)).rejects.toMatchObject({ code: 'lifecycle-failed', message: 'blend.yaml is read-only' })
  })

  it('is provided while the frame provides its plugins, and only then', async () => {
    const ctx: any = new Context()
    provideAcrPluginLifecycle(ctx)
    let seen: unknown
    ctx.inject(['acrPluginLifecycle'], (child: any) => { seen = child.acrPluginLifecycle })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).toBeUndefined()
    ctx.effect(() => ctx.reflect.provide('frameAppPlugins', fakeFrame().port), 'frame')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(seen).toBeDefined()
    await ctx.fiber.dispose()
  })
})
