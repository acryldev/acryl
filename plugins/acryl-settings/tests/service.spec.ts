import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { afterEach, describe, expect, it } from 'vitest'
import { AcrylSettings, apply, inject, name, type Config } from '../src/index.ts'

const homes: string[] = []
const contexts: Context[] = []

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'acryl-settings-'))
  homes.push(home)
  return home
}

async function mount(home: string, config: Config = { filename: '' }): Promise<{ ctx: Context, settings: AcrylSettings }> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('appInstance', { home })
  ctx.plugin({ name, inject, apply }, config)
  await new Promise(resolve => setTimeout(resolve, 0))
  return { ctx, settings: ctx.acrylSettings }
}

const Schema = z.object({
  mode: z.union(['compatibility', 'advanced']).default('compatibility'),
  port: z.number().default(3080),
  nested: z.object({ flag: z.boolean().default(false) }).default({}),
})
type Section = { mode: 'compatibility' | 'advanced', port: number, nested: { flag: boolean } }

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

describe('acryl-settings', () => {
  it('resolves schema defaults and stores nothing until a write', async () => {
    const home = makeHome()
    const { settings } = await mount(home)
    const scope = settings.register<Section>('desktop', Schema)
    expect(scope.get()).toEqual({ mode: 'compatibility', port: 3080, nested: { flag: false } })
    expect(existsSync(join(home, 'acryl-settings.yaml'))).toBe(false)
    expect(settings.get('desktop')).toEqual(scope.get())
    expect(settings.get('unregistered')).toBeUndefined()
  })

  it('persists updates to the ACRYL home file and a new service reads them back', async () => {
    const home = makeHome()
    const first = await mount(home)
    const scope = first.settings.register<Section>('desktop', Schema)
    await scope.update({ mode: 'advanced', nested: { flag: true } })
    expect(scope.get().mode).toBe('advanced')
    expect(scope.get().port).toBe(3080)
    expect(readFileSync(join(home, 'acryl-settings.yaml'), 'utf8')).toContain('mode: advanced')

    const second = await mount(home)
    expect(second.settings.register<Section>('desktop', Schema).get()).toEqual({
      mode: 'advanced', port: 3080, nested: { flag: true },
    })
  })

  it('merges base under the stored section and replace({}) resets to base and defaults', async () => {
    const { settings } = await mount(makeHome())
    const scope = settings.register<Section>('desktop', Schema, { base: { port: 4000 } })
    expect(scope.get().port).toBe(4000)
    await scope.update({ port: 5000 })
    expect(scope.get().port).toBe(5000)
    await scope.replace({})
    expect(scope.get().port).toBe(4000)
  })

  it('keeps sections of namespaces nobody registered when it rewrites the file', async () => {
    const home = makeHome()
    writeFileSync(join(home, 'acryl-settings.yaml'), 'other:\n  keep: 1\n')
    const { settings } = await mount(home)
    await settings.register<Section>('desktop', Schema).update({ port: 1234 })
    const text = readFileSync(join(home, 'acryl-settings.yaml'), 'utf8')
    expect(text).toContain('keep: 1')
    expect(text).toContain('port: 1234')
  })

  it('notifies watchers and the updated event once per committed change, in order, and not for equal values', async () => {
    const { ctx, settings } = await mount(makeHome())
    const scope = settings.register<Section>('desktop', Schema)
    const seen: number[] = []
    const events: string[] = []
    const stop = scope.watch(next => { seen.push(next.port) })
    ctx.on('acrylSettings/updated', (namespace) => { events.push(namespace) })
    await Promise.all([scope.update({ port: 1 }), scope.update({ port: 2 }), scope.update({ port: 2 })])
    expect(seen).toEqual([1, 2])
    expect(events).toEqual(['desktop', 'desktop'])
    stop()
    await scope.update({ port: 3 })
    expect(seen).toEqual([1, 2])
  })

  it('contains a failing watcher', async () => {
    const { settings } = await mount(makeHome())
    const scope = settings.register<Section>('desktop', Schema)
    scope.watch(() => { throw new Error('boom') })
    await expect(scope.update({ port: 9 })).resolves.toBeUndefined()
    expect(scope.get().port).toBe(9)
  })

  it('refuses a write the owner rejects and changes nothing', async () => {
    const home = makeHome()
    const { settings } = await mount(home)
    const scope = settings.register<Section>('desktop', Schema, {
      validate: (value) => { if (value.mode === 'advanced') throw new Error('not here') },
    })
    await expect(scope.update({ mode: 'advanced' })).rejects.toThrow('not here')
    expect(scope.get().mode).toBe('compatibility')
    expect(existsSync(join(home, 'acryl-settings.yaml'))).toBe(false)
  })

  it('refuses a patch the schema rejects', async () => {
    const { settings } = await mount(makeHome())
    const scope = settings.register<Section>('desktop', Schema)
    await expect(scope.update({ port: 'not a number' })).rejects.toThrow()
    expect(scope.get().port).toBe(3080)
  })

  it('rejects values YAML would distort', async () => {
    const { settings } = await mount(makeHome())
    const scope = settings.register<Record<string, unknown>>('free', z.dict(z.any()).default({}))
    await expect(scope.update({ when: new Date() })).rejects.toThrow(/\$\.when/)
    await expect(scope.update({ n: Number.NaN })).rejects.toThrow(/non-finite/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    await expect(scope.update(cyclic)).rejects.toThrow(/circular/)
  })

  it('rejects the registration when the stored section fails the schema', async () => {
    const home = makeHome()
    writeFileSync(join(home, 'acryl-settings.yaml'), 'desktop:\n  port: nope\n')
    const { settings } = await mount(home)
    expect(() => settings.register<Section>('desktop', Schema)).toThrow()
  })

  it('rejects an unreadable document at start', async () => {
    const home = makeHome()
    writeFileSync(join(home, 'acryl-settings.yaml'), ': : :\n  - [')
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('appInstance', { home })
    ctx.plugin({ name, inject, apply }, { filename: '' })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(ctx.get('acrylSettings')).toBeUndefined()
  })

  it('updates a registered namespace by name, validated, and refuses an unregistered one', async () => {
    const { settings } = await mount(makeHome())
    const scope = settings.register('demo', Schema)
    await settings.update('demo', { port: 5 })
    expect(scope.get().port).toBe(5)
    await expect(settings.update('demo', { port: 'x' })).rejects.toThrow()
    expect(scope.get().port).toBe(5)
    await expect(settings.update('nobody', { port: 1 })).rejects.toThrow(/not registered/)
  })

  it('validates namespaces and refuses duplicates', async () => {
    const { settings } = await mount(makeHome())
    expect(() => settings.register('Bad_Name', Schema)).toThrow(/must match/)
    settings.register('good-name', Schema)
    expect(() => settings.register('good-name', Schema)).toThrow(/already registered/)
  })

  it('describes registered namespaces for configuration UIs', async () => {
    const { settings } = await mount(makeHome())
    const scope = settings.register<Section>('desktop', Schema, { applies: 'restart' })
    await scope.update({ port: 7 })
    const [descriptor] = settings.describe()
    expect(descriptor).toMatchObject({ namespace: 'desktop', applies: 'restart', revision: 1, user: { port: 7 } })
  })

  it('honors an explicit filename', async () => {
    const home = makeHome()
    const filename = join(home, 'custom.yaml')
    const { settings } = await mount(home, { filename })
    await settings.register<Section>('desktop', Schema).update({ port: 11 })
    expect(readFileSync(filename, 'utf8')).toContain('port: 11')
  })

  it('releases a namespace when its registrant unloads, so a reactivated registrant can register it again', async () => {
    const { ctx, settings } = await mount(makeHome())
    const registrant = () => ctx.plugin({
      name: 'registrant',
      inject: ['acrylSettings'],
      apply: (child: Context) => { child.acrylSettings.register<Section>('desktop', Schema) },
    })
    const first = registrant()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settings.get('desktop')).toBeDefined()

    await first.dispose()
    expect(settings.get('desktop')).toBeUndefined()

    registrant()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settings.get('desktop')).toBeDefined()
  })
})
