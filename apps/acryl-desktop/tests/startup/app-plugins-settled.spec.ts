import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { appPluginsSettled } from '../../src/startup/app-plugins-settled.ts'

describe('waiting for the app plugins before the window loads', () => {
  it('waits for the startup pass to settle', async () => {
    const ctx = new Context()
    let settle = () => {}
    ctx.provide('pluginContext', { startupSettled: new Promise<void>(resolve => { settle = resolve }) })
    let outcome: string | undefined
    const waiting = appPluginsSettled(ctx, 5_000).then(value => { outcome = value })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(outcome).toBeUndefined()
    settle()
    await waiting
    expect(outcome).toBe('settled')
  })

  it('does not wait when no plugin context is mounted', async () => {
    expect(await appPluginsSettled(new Context(), 5_000)).toBe('absent')
  })

  it('stops waiting at the limit', async () => {
    const ctx = new Context()
    ctx.provide('pluginContext', { startupSettled: new Promise<void>(() => {}) })
    expect(await appPluginsSettled(ctx, 30)).toBe('timed-out')
  })
})
