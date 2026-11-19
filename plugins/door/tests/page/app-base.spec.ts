// @vitest-environment jsdom
/** The app base the frame puts on an app page, and the navigation that follows it (`act navigate --path /board` under the canvas prefix). */

import { afterEach, describe, expect, it } from 'vitest'
import { appBaseOf, underAppBase } from '../../src/page/base.ts'

afterEach(() => {
  document.head.innerHTML = ''
})

describe('the app base a page carries', () => {
  it('reads the meta the frame adds, and nothing from a malformed value', () => {
    document.head.innerHTML = '<meta name="acryl-app-base" content="/app/">'
    expect(appBaseOf(document)).toBe('/app')
    document.head.innerHTML = '<meta name="acryl-app-base" content="app">'
    expect(appBaseOf(document)).toBe('')
    document.head.innerHTML = '<meta name="acryl-app-base" content="/">'
    expect(appBaseOf(document)).toBe('')
    document.head.innerHTML = ''
    expect(appBaseOf(document)).toBe('')
  })

  it('puts an app path under the base, leaving a path already under it alone', () => {
    expect(underAppBase('/app', '/board')).toBe('/app/board')
    expect(underAppBase('/app', 'board')).toBe('/app/board')
    // The app's root is its mount at the base, not '/app/', which the app answers with its 404 page; a query stays with it.
    expect(underAppBase('/app', '/')).toBe('/app')
    expect(underAppBase('/app', '/?x=1')).toBe('/app?x=1')
    expect(underAppBase('/app', '/app/settings')).toBe('/app/settings')
    expect(underAppBase('/app', '/app?x=1')).toBe('/app?x=1')
    expect(underAppBase('', '/board')).toBe('/board')
  })
})
