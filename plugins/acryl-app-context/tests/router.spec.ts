import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as appContext from '../src/index.ts'
import { buildRouterText, estimateTokens, type PackManifest, ROUTER_SECTION_NAME, ROUTER_TAG, ROUTER_TOKEN_BUDGET } from '../src/router.ts'

const root = appContext.packRoot(new URL('../src/index.ts', import.meta.url).href)
const manifest = JSON.parse(readFileSync(join(root, 'docs', 'docs.json'), 'utf8')) as PackManifest

describe('the prompt router', () => {
  it('names the pack, every route with its doc paths, and the plugin rule, within its budget', () => {
    const text = buildRouterText('node_modules/acryl-app-context', manifest)
    expect(text.startsWith(`<${ROUTER_TAG}>`)).toBe(true)
    expect(text).toContain("This app's builder docs: node_modules/acryl-app-context.")
    for (const route of manifest.routes) expect(text).toContain(route.when)
    expect(text).toContain('extending/home-widget.md')
    expect(text).toContain('plugins/<name>/index.ts plus its row in blend.yaml')
    expect(estimateTokens(text)).toBeLessThanOrEqual(ROUTER_TOKEN_BUDGET)
  })

  it('registers one section with the system prompt while it runs and takes it back when it stops', async () => {
    const sections = new Map<string, string>()
    const app = new Context()
    app.plugin({
      name: 'system-prompt-stub',
      apply(ctx: Context) {
        ctx.provide('systemPrompt', {
          section({ name, text }: { name: string; text: string }) {
            sections.set(name, text)
            return () => sections.delete(name)
          },
        })
      },
    })
    const fiber = app.plugin(appContext)
    await fiber.await()
    expect([...sections.keys()]).toEqual([ROUTER_SECTION_NAME])
    const service = (app as unknown as { appContext: { resolveDoc(id: string): string | undefined } }).appContext
    expect(service.resolveDoc('start.this-app')).toBe(join(root, 'docs', 'start-here', 'this-app.md'))
    expect(service.resolveDoc('nope')).toBeUndefined()
    await fiber.dispose()
    expect(sections.size).toBe(0)
  })

  it('gives the agent the path inside the app when the app has the pack installed', () => {
    expect(appContext.readablePackRoot(root, undefined)).toBe(root)
    expect(appContext.readablePackRoot(root, join(root, 'no-such-app'))).toBe(root)
    // An app with the pack installed: the path is inside the app, by the package's own name.
    const app = mkdtempSync(join(root, 'tests', '.apps-'))
    try {
      mkdirSync(join(app, 'node_modules'), { recursive: true })
      symlinkSync(root, join(app, 'node_modules', 'acryl-app-context'), 'dir')
      expect(appContext.readablePackRoot(root, app)).toBe('node_modules/acryl-app-context')
    } finally {
      rmSync(app, { recursive: true, force: true })
    }
  })
})
