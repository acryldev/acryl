import { describe, expect, it } from 'vitest'
import { synchronizeCanvasWithSessionNavigation } from '../src/client/development-canvas/session-navigation.ts'
import {
  DevelopmentCanvasState,
  normalizeBrowserUrl,
} from '../src/client/development-canvas/state.ts'

describe('DevelopmentCanvasState', () => {
  it('starts with Chat filling the workspace and focuses new tabs from +', () => {
    let n = 0
    const canvas = new DevelopmentCanvasState({ createId: () => `tile_${String(++n)}` })
    expect(canvas.getSnapshot().tiles.map(tile => tile.kind)).toEqual(['chat'])
    expect(canvas.getSnapshot().activeId).toBe('tile_1')
    expect(canvas.addTile('chat')).toBeUndefined()
    expect(canvas.getSnapshot().activeId).toBe('tile_1')
    expect(canvas.addTile('pty', { commandId: 'claude', title: 'Claude' })?.kind).toBe('pty')
    expect(canvas.addTile('file')?.kind).toBe('file')
    expect(canvas.addTile('browser')?.kind).toBe('browser')
    expect(canvas.getSnapshot().tiles.map(tile => tile.kind)).toEqual([
      'chat', 'pty', 'file', 'browser',
    ])
    expect(canvas.getSnapshot().activeId).toBe('tile_4')
    expect(canvas.getSnapshot().menuOpen).toBe(false)
  })

  it('closes the active tab and focuses its neighbor', () => {
    let n = 0
    const canvas = new DevelopmentCanvasState({ createId: () => `tile_${String(++n)}` })
    const file = canvas.addTile('file')
    expect(file).toBeDefined()
    expect(canvas.getSnapshot().activeId).toBe(file?.id)
    expect(canvas.closeTile(file?.id ?? '')?.kind).toBe('file')
    expect(canvas.getSnapshot().tiles.map(tile => tile.kind)).toEqual(['chat'])
    expect(canvas.getSnapshot().activeId).toBe('tile_1')
  })

  it('selects an existing tab without adding another', () => {
    let n = 0
    const canvas = new DevelopmentCanvasState({ createId: () => `tile_${String(++n)}` })
    canvas.addTile('browser')
    canvas.selectTile('tile_1')
    expect(canvas.getSnapshot().activeId).toBe('tile_1')
    expect(canvas.getSnapshot().tiles).toHaveLength(2)
  })

  it('names file and browser tabs from path and URL', () => {
    let n = 0
    const canvas = new DevelopmentCanvasState({ createId: () => `tile_${String(++n)}` })
    const file = canvas.addTile('file')
    canvas.updateTile(file?.id ?? '', { path: '/tmp/acryl-core.ts' })
    expect(canvas.getSnapshot().tiles.find(tile => tile.id === file?.id)?.title).toBe('acryl-core.ts')
    const browser = canvas.addTile('browser')
    canvas.updateTile(browser?.id ?? '', { url: 'https://onorca.dev/docs' })
    expect(canvas.getSnapshot().tiles.find(tile => tile.id === browser?.id)?.title).toBe('onorca.dev')
  })

  it('restores Chat when New Session reselects the current blank session', () => {
    let n = 0
    const canvas = new DevelopmentCanvasState({ createId: () => `tile_${String(++n)}` })
    canvas.closeTile('tile_1')
    expect(canvas.getSnapshot().tiles).toEqual([])

    const current = synchronizeCanvasWithSessionNavigation(canvas, 'session_1', {
      current: 'session_1',
      blank: true,
    })

    expect(current).toBe('session_1')
    expect(canvas.getSnapshot().tiles.map(tile => tile.kind)).toEqual(['chat'])
    expect(canvas.getSnapshot().activeId).toBe('tile_2')
  })

  it('opens Chat for changed sessions without stealing focus on ordinary updates', () => {
    let n = 0
    const canvas = new DevelopmentCanvasState({ createId: () => `tile_${String(++n)}` })
    const terminal = canvas.addTile('pty')

    synchronizeCanvasWithSessionNavigation(canvas, 'session_1', {
      current: 'session_1',
      blank: false,
    })
    expect(canvas.getSnapshot().activeId).toBe(terminal?.id)

    synchronizeCanvasWithSessionNavigation(canvas, 'session_1', {
      current: 'session_2',
      blank: false,
    })
    expect(canvas.getSnapshot().tiles.map(tile => tile.kind)).toEqual(['chat', 'pty'])
    expect(canvas.getSnapshot().activeId).toBe('tile_1')
  })

  it('accepts only http(s) browser URLs', () => {
    expect(normalizeBrowserUrl('example.com')).toBe('https://example.com/')
    expect(normalizeBrowserUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000/')
    expect(normalizeBrowserUrl('javascript:alert(1)')).toBeUndefined()
    expect(normalizeBrowserUrl('')).toBeUndefined()
  })
})
