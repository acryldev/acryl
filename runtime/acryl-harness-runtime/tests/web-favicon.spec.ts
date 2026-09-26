import { describe, expect, it } from 'vitest'
import { applyWebFavicon, WEB_FAVICON_LINKS } from '../src/web-favicon.ts'

describe('applyWebFavicon', () => {
  it('replaces the pinned frontend icon links with the ACRYL icon', () => {
    const html = '<html><head><title>x</title><link rel="icon" href="/favicon.svg"><link rel="shortcut icon" href="/a.ico"></head><body></body></html>'
    const out = applyWebFavicon(html)
    expect(out).not.toContain('/favicon.svg')
    expect(out).not.toContain('/a.ico')
    expect(out.match(/rel="icon"/g)).toHaveLength(1)
    expect(out).toContain(`${WEB_FAVICON_LINKS}</head>`)
  })

  it('leaves other links alone and works when there was no icon', () => {
    const out = applyWebFavicon('<head><link rel="stylesheet" href="/s.css"></head>')
    expect(out).toContain('rel="stylesheet"')
    expect(out).toContain('data:image/png;base64,')
  })
})
