/** @jsxImportSource acryl-router/jsx */
/**
 * JSX in a Cordis plugin, set up as the docs say (`jsxImportSource: 'acryl-router/jsx'`, which resolves this package's built runtime): a page rendered with the ported JSX renderer and styled with the CSS helper, served through `ctx.router`, and a
 * streamed page whose suspended part arrives after the shell. The ported suites cover the renderer itself; this covers the plugin seam.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { css, Style } from '../src/helpers/index.ts'
import { Acryl, apply, name } from '../src/index.ts'
import { Suspense } from 'acryl-router/jsx'
import { renderToReadableStream } from 'acryl-router/jsx/streaming'

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function serve(app: Acryl): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.plugin({ name, apply })
  ctx.plugin({ name: 'pages', inject: ['router'], apply(inner: Context) { inner.router.route('/pages', app) } })
  await settle()
  return ctx
}

describe('JSX through ctx.router', () => {
  it('serves a page rendered from JSX, styled with the CSS helper', async () => {
    const title = css`color: teal;`
    const app = new Acryl().get('/', c => c.html(
      <html>
        <head><Style /></head>
        <body><h1 class={title}>Acryl!</h1></body>
      </html>,
    ))
    const ctx = await serve(app)

    const response = await ctx.router.request('/pages')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=UTF-8')
    const page = await response.text()
    expect(page).toMatch(/^<html><head><style id="acryl-css">\.css-\d+\{color:teal\}<\/style><\/head><body><h1 class="css-\d+">Acryl!<\/h1><\/body><\/html>$/u)
  })

  it('streams a page: the shell first, then the suspended part', async () => {
    const Late = async () => { await new Promise(resolve => setTimeout(resolve, 10)); return <p>loaded</p> }
    const page = <Suspense fallback={<p>loading</p>}><Late /></Suspense>
    const app = new Acryl().get('/stream', c => c.body(renderToReadableStream(page), 200, {
      'content-type': 'text/html; charset=UTF-8',
    }))
    const ctx = await serve(app)

    const response = await ctx.router.request('/pages/stream')
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
    const chunks: string[] = []
    for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]).toContain('loading')
    expect(chunks.join('')).toContain('loaded')
  })
})
