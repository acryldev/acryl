/**
 * The app's own URLs seen from the frame's root: a navigation from an app page goes back under the canvas prefix, and a sub-resource or fetch is served
 * at the same path under it. The frame's own page and pages outside the app never trigger either.
 */

import { describe, expect, it } from 'vitest'
import { appFallbackTarget, appNavigationTarget, refererPath, underAppBase } from '../src/app-urls.ts'

const url = (path: string): URL => new URL(path, 'http://127.0.0.1:3711')
const headers = (values: Record<string, string>): Headers => new Headers(values)

describe('the app URLs under the canvas prefix', () => {
  it('knows what is under the prefix', () => {
    expect(underAppBase('/app', '/app')).toBe(true)
    expect(underAppBase('/app', '/app/board')).toBe(true)
    expect(underAppBase('/app', '/application')).toBe(false)
    expect(underAppBase('/app', '/')).toBe(false)
  })

  it('reads the referer path only from an absolute URL', () => {
    expect(refererPath('http://127.0.0.1:3711/app/board')).toBe('/app/board')
    expect(refererPath('/app/board')).toBeUndefined()
    expect(refererPath('')).toBeUndefined()
    expect(refererPath(null)).toBeUndefined()
  })

  it('sends a navigation from an app page back under the prefix, with its query', () => {
    expect(appNavigationTarget('/app', url('/board/2?x=1'), headers({ referer: 'http://127.0.0.1:3711/app/board', 'sec-fetch-mode': 'navigate' }))).toBe('/app/board/2?x=1')
    // The app's home, not the frame's page inside itself: the app's root is its mount at the base, not '/app/', which the app 404s.
    expect(appNavigationTarget('/app', url('/'), headers({ referer: 'http://127.0.0.1:3711/app/board', 'sec-fetch-mode': 'navigate' }))).toBe('/app')
    expect(appNavigationTarget('/app', url('/?x=1'), headers({ referer: 'http://127.0.0.1:3711/app/board', 'sec-fetch-mode': 'navigate' }))).toBe('/app?x=1')
    // The frame's own load (no referer) and a page outside the app never trigger it.
    expect(appNavigationTarget('/app', url('/'), headers({ 'sec-fetch-mode': 'navigate' }))).toBeUndefined()
    expect(appNavigationTarget('/app', url('/settings'), headers({ referer: 'http://127.0.0.1:3711/settings', 'sec-fetch-mode': 'navigate' }))).toBeUndefined()
    // A navigation to a path already under the prefix is the app's own request.
    expect(appNavigationTarget('/app', url('/app/board'), headers({ referer: 'http://127.0.0.1:3711/app', 'sec-fetch-mode': 'navigate' }))).toBeUndefined()
    // A sub-resource from an app page is not a navigation.
    expect(appNavigationTarget('/app', url('/logo.svg'), headers({ referer: 'http://127.0.0.1:3711/app/board', 'sec-fetch-mode': 'no-cors' }))).toBeUndefined()
  })

  it('finds the app target of a sub-resource or fetch from an app page', () => {
    expect(appFallbackTarget('/app', url('/api/tasks'), headers({ referer: 'http://127.0.0.1:3711/app/board' }))).toBe('/app/api/tasks')
    expect(appFallbackTarget('/app', url('/logo.svg?x=1'), headers({ referer: 'http://127.0.0.1:3711/app/board' }))).toBe('/app/logo.svg?x=1')
    expect(appFallbackTarget('/app', url('/'), headers({ referer: 'http://127.0.0.1:3711/app/board' }))).toBe('/app')
    expect(appFallbackTarget('/app', url('/api/tasks'), headers({}))).toBeUndefined()
    expect(appFallbackTarget('/app', url('/app/api/tasks'), headers({ referer: 'http://127.0.0.1:3711/app/board' }))).toBeUndefined()
  })
})
