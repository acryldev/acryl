/** The page over a real socket: our document with the taps, the built assets, and no way out of the asset folder. */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply as routerApply, name as routerName } from 'acryl-router'
import { afterEach, describe, expect, it } from 'vitest'
import * as nodeServer from 'acryl-node-server'
import * as webServer from 'acryl-web-server'
import * as page from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function boot(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin({ name: routerName, apply: routerApply })
  await ctx.plugin(nodeServer, { port: 0, scan: 0 })
  await ctx.plugin(webServer)
  await ctx.plugin(page, { title: 'Test App' })
  return ctx
}

describe('acryl-page', () => {
  it('serves our own document, not the frontend package index, with the taps applied', async () => {
    const ctx = await boot()
    ctx.webServer.tapIndex(html => html.replace('</head>', '<script>window.__TEST_BOOT__ = 1</script></head>'))
    const response = await fetch(ctx.nodeServer.url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Test App</title>')
    expect(html).toContain('<meta name="application-name" content="Test App" />')
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('window.__TEST_BOOT__ = 1')
    expect(html).toContain('/assets/')
    expect(html).toContain('<link rel="stylesheet"')
    // The entry script is closed: an unclosed copy turns the stylesheet links after it into script text, and the frame falls back to browser defaults
    // for every DSH component (dialogs without a surface or backdrop, flat buttons).
    expect(html).toMatch(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/u)
    expect(html).not.toMatch(/<script\b[^>]*\bsrc="[^"]*"[^>]*>\s*<link/u)
    // The frontend package's own title is not what the page says.
    expect(html).not.toContain('<title>DeepSeek Harness</title>')
  })

  it('answers every icon request with the ACRYL Blends logo, never the frontend package\'s DeepSeek whale', async () => {
    const ctx = await boot()
    const html = await (await fetch(ctx.nodeServer.url)).text()
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    const icons = await Promise.all(['/favicon.ico', '/favicon.svg', '/favicon-dark.svg'].map(async path => fetch(ctx.nodeServer.url + path)))
    for (const icon of icons) {
      expect(icon.status).toBe(200)
      expect(icon.headers.get('content-type')).toBe('image/svg+xml')
      const svg = await icon.text()
      // The ACRYL Blends logo as a PNG inside the SVG, not the DeepSeek whale and not the wordmark.
      expect(svg).toContain('aria-label="ACRYL Blends"')
      expect(svg).toMatch(/xlink:href="data:image\/png;base64,iVBORw0KGgo/u)
    }
    const manifest = await (await fetch(ctx.nodeServer.url + '/manifest.webmanifest')).json() as { name: string }
    expect(manifest.name).toBe('Test App')
  })

  it('writes an app name as text, never as markup', () => {
    const html = page.pageDocument('', '<b onload="x">shop</b>', (document) => document)
    expect(html).not.toContain('<b onload')
    expect(html).toContain('<title>&#60;b onload=&#34;x&#34;&#62;shop&#60;/b&#62;</title>')
  })

  it('closes the entry script it copies, so the tags after it parse', () => {
    const tags = page.clientAssetTags(
      '<title>x</title><script type="module" crossorigin src="./assets/index-abc.js"></script>' +
        '<link rel="modulepreload" crossorigin href="./assets/vendor.js">' +
        '<link rel="stylesheet" crossorigin href="./assets/index.css">',
    )
    expect(tags).toBe(
      '<script type="module" crossorigin src="./assets/index-abc.js"></script>\n' +
        '    <link rel="modulepreload" crossorigin href="./assets/vendor.js">\n' +
        '    <link rel="stylesheet" crossorigin href="./assets/index.css">',
    )
  })

  it('serves the built assets the entry imports', async () => {
    const ctx = await boot()
    const dir = join(page.frontendDist(), 'assets')
    const asset = readdirSync(dir).find((name) => name.endsWith('.js'))
    expect(asset).toBeDefined()
    const response = await fetch(`${ctx.nodeServer.url}/assets/${asset ?? ''}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('javascript')
    expect((await response.text()).length).toBeGreaterThan(0)
  })

  it('answers 404 for a missing asset and for a path outside the asset folder', async () => {
    const ctx = await boot()
    expect((await fetch(`${ctx.nodeServer.url}/assets/missing.js`)).status).toBe(404)
    expect((await fetch(`${ctx.nodeServer.url}/assets/..%2F..%2Fpackage.json`)).status).toBe(404)
    expect((await fetch(`${ctx.nodeServer.url}/nope`)).status).toBe(404)
  })

  it('answers HEAD without a body', async () => {
    const ctx = await boot()
    const response = await fetch(ctx.nodeServer.url, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })
})
