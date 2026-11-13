import { describe, expect, it } from 'vitest'
import { applyWebFavicon, brandWebIndex, WEB_FAVICON_LINKS } from '../src/web-favicon.ts'

describe('applyWebFavicon', () => {
  it('replaces the pinned frontend icon links with the ACRYL icon', () => {
    const html = '<html><head><title>x</title><link rel="icon" href="/favicon.svg"><link rel="shortcut icon" href="/a.ico"></head><body></body></html>'
    const out = applyWebFavicon(html)
    expect(out).not.toContain('/favicon.svg')
    expect(out).not.toContain('/a.ico')
    expect(out.match(/rel="icon"/g)).toHaveLength(3)
    expect(out.match(/rel="apple-touch-icon"/g)).toHaveLength(1)
    expect(out).toContain(`${WEB_FAVICON_LINKS}</head>`)
  })

  it('leaves other links alone and works when there was no icon', () => {
    const out = applyWebFavicon('<head><link rel="stylesheet" href="/s.css"></head>')
    expect(out).toContain('rel="stylesheet"')
    expect(out).toContain('data:image/x-icon;base64,')
  })
})

describe('brandWebIndex', () => {
  const index = '<html><head><title>DeepSeek Harness</title><link rel="icon" type="image/svg+xml" href="./favicon-dark.svg" media="(prefers-color-scheme: dark)" /></head></html>'

  it('gives the stock ACRYL brand its title and its icon even though a product name is always set (the web face names it ACRYL)', () => {
    const out = brandWebIndex(index, { productName: 'ACRYL', stockBrand: true })
    expect(out).toContain('<title>ACRYL</title>')
    expect(out).not.toContain('favicon-dark.svg')
    expect(out).toContain(WEB_FAVICON_LINKS)
  })

  it('leaves a custom brand its own icon, and escapes its name in the title', () => {
    const out = brandWebIndex(index, { productName: '<Shop>', stockBrand: false })
    expect(out).toContain('<title>&#60;Shop&#62;</title>')
    expect(out).toContain('favicon-dark.svg')
    expect(out).not.toContain(WEB_FAVICON_LINKS)
  })

  it('treats a composition that names neither a product nor a brand kind as the stock one', () => {
    expect(brandWebIndex(index, {})).toContain(WEB_FAVICON_LINKS)
  })
})
