import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as appContext from '../src/index.ts'
import { LOOKUP_TOOL_NAME, type LookupManifest, lookupAppDocs } from '../src/lookup.ts'
import { SNAPSHOT_APPLY_TOOL, SNAPSHOT_CAPTURE_TOOL, SNAPSHOT_VERIFY_TOOL } from '../src/snapshot-tools.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'docs', 'docs.json'), 'utf8')) as LookupManifest

describe('the docs lookup', () => {
  it('routes the Notes request to the feature plugin, the widget and state docs, and their examples', () => {
    const result = lookupAppDocs('please build a simple Notes widget', manifest, 'node_modules/acryl-app-context')
    if (!result.ok) throw new Error(result.error)
    expect(result.docs[0]?.id).toBe('extending.home-widget')
    expect(result.docs.map(doc => doc.path)).toContain('node_modules/acryl-app-context/docs/extending/home-widget.md')
    expect(result.examples[0]?.id).toBe('home-widget-basic')
    expect(result.examples[0]?.path).toBe('node_modules/acryl-app-context/example-plugins/packages/home-widget-basic')
  })

  it('finds state for keeping data, and troubleshooting for an error', () => {
    const state = lookupAppDocs('keep the notes after a restart', manifest, root)
    expect(state.ok && state.docs[0]?.id).toBe('extending.state')
    expect(state.ok && state.examples[0]?.id).toBe('state-json-file')
    const broken = lookupAppDocs('Not reloaded: Cannot find module', manifest, root)
    expect(broken.ok && broken.docs[0]?.id).toBe('start.troubleshooting')
  })

  it('sends a topic it cannot place to this-app, and refuses an empty one', () => {
    const none = lookupAppDocs('zebra quantum', manifest, root)
    expect(none.ok && none.docs.map(doc => doc.id)).toEqual(['start.this-app'])
    expect(none.ok && none.note).toMatch(/No doc matched/)
    expect(lookupAppDocs('the and', manifest, root)).toEqual({ ok: false, error: expect.stringMatching(/meaningful word/) })
  })

  // DSH's registry ties a registration to the plugin that made it (its own tool plugins register the same way); this stub only records it.
  it('is a tool when the tools registry is up', async () => {
    const registered = new Map<string, { execute(args: unknown, exec?: unknown): Promise<unknown> }>()
    const app = new Context()
    app.plugin({ name: 'prompt', apply: (ctx: Context) => ctx.provide('systemPrompt', { section: () => () => undefined }) })
    app.plugin({
      name: 'tools',
      apply: (ctx: Context) =>
        ctx.provide('tools', {
          register(tool: { name: string; execute(args: unknown): Promise<unknown> }) {
            registered.set(tool.name, tool)
          },
        }),
    })
    const fiber = app.plugin(appContext)
    await fiber.await()
    // `inject` starts its part on a fiber of its own, after the plugin's.
    for (let tries = 0; tries < 50 && !registered.has(LOOKUP_TOOL_NAME); tries += 1) await new Promise(done => setTimeout(done, 10))
    const tool = registered.get(LOOKUP_TOOL_NAME)
    expect(tool).toBeDefined()
    const answer = JSON.parse(String(await tool?.execute({ topic: 'a page of its own' })))
    expect(answer.docs[0].id).toBe('extending.routes-and-pages')
    await fiber.dispose()
  })

  it('gives the agent the snapshot verbs while the frame provides appSnapshot, and only then', async () => {
    const registered = new Map<string, { execute(args: Record<string, unknown>): Promise<unknown> }>()
    const calls: string[] = []
    const app = new Context()
    app.plugin({ name: 'prompt', apply: (ctx: Context) => ctx.provide('systemPrompt', { section: () => () => undefined }) })
    app.plugin({
      name: 'tools',
      apply: (ctx: Context) => ctx.provide('tools', { register(tool: { name: string; execute(args: Record<string, unknown>): Promise<unknown> }) { registered.set(tool.name, tool) } }),
    })
    const fiber = app.plugin(appContext)
    await fiber.await()
    const settle = async (name: string) => {
      for (let tries = 0; tries < 50 && !registered.has(name); tries += 1) await new Promise(done => setTimeout(done, 10))
    }
    await settle(LOOKUP_TOOL_NAME)
    expect(registered.has(SNAPSHOT_CAPTURE_TOOL)).toBe(false)
    app.plugin({
      name: 'frame',
      apply: (ctx: Context) =>
        ctx.provide('appSnapshot', {
          capture: async () => { calls.push('capture'); return { addedRows: ['notes'], modules: 2 } },
          verify: async (dir?: string) => { calls.push(`verify ${dir ?? 'app'}`); return { ok: true, problems: [], checked: 2 } },
          apply: async (dir: string) => { calls.push(`apply ${dir}`); return { ok: true, problems: [], modules: [], manifestChanged: true, extra: [] } },
        }),
    })
    await settle(SNAPSHOT_APPLY_TOOL)
    expect(JSON.parse(String(await registered.get(SNAPSHOT_CAPTURE_TOOL)?.execute({})))).toEqual({ addedRows: ['notes'], modules: 2 })
    await registered.get(SNAPSHOT_VERIFY_TOOL)?.execute({})
    await registered.get(SNAPSHOT_APPLY_TOOL)?.execute({ folder: '../older' })
    await expect(registered.get(SNAPSHOT_APPLY_TOOL)?.execute({})).rejects.toThrow('missing required property "folder"')
    expect(calls).toEqual(['capture', 'verify app', 'apply ../older'])
    await fiber.dispose()
  })
})
