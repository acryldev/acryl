import { describe, expect, it } from 'vitest'
import { joinPath, moveFor, parentOf, rowWindow, scrollToShow, visibleRows, type DirState } from '../../src/client/files/tree-model.ts'

const ready = (...names: string[]): DirState => ({
  phase: 'ready',
  truncated: false,
  entries: names.map(n => ({ name: n.replace(/\/$/, ''), kind: n.endsWith('/') ? 'dir' as const : 'file' as const })),
})

describe('tree model', () => {
  const dirs = new Map<string, DirState>([
    ['', ready('src/', 'docs/', 'README.md')],
    ['src', ready('deep/', 'a.ts')],
    ['src/deep', ready('c.ts')],
  ])

  it('joins paths', () => {
    expect(joinPath('', 'a')).toBe('a')
    expect(joinPath('src', 'a.ts')).toBe('src/a.ts')
  })

  it('shows only the root while nothing is open, and descends into open folders in order', () => {
    expect(visibleRows(dirs, new Set()).map(r => r.path)).toEqual(['src', 'docs', 'README.md'])
    const rows = visibleRows(dirs, new Set(['src', 'src/deep']))
    expect(rows.map(r => `${r.depth}:${r.path}`)).toEqual(['0:src', '1:src/deep', '2:src/deep/c.ts', '1:src/a.ts', '0:docs', '0:README.md'])
    expect(rows[0]).toMatchObject({ kind: 'dir', open: true })
  })

  it('marks an open folder that is still loading or failed', () => {
    const state = new Map<string, DirState>([['', ready('src/', 'lib/')], ['src', { phase: 'loading' }], ['lib', { phase: 'error', message: 'x' }]])
    const rows = visibleRows(state, new Set(['src', 'lib']))
    expect(rows.find(r => r.path === 'src')?.status).toBe('loading')
    expect(rows.find(r => r.path === 'lib')?.status).toBe('error')
  })

  it('marks what git ignores, and everything inside an ignored folder', () => {
    const state = new Map<string, DirState>([
      ['', { phase: 'ready', truncated: false, entries: [{ name: 'build', kind: 'dir', ignored: true }, { name: 'a.ts', kind: 'file' }] }],
      ['build', ready('out.js')],
    ])
    expect(visibleRows(state, new Set(['build'])).map(r => `${r.path}:${String(r.ignored)}`)).toEqual(['build:true', 'build/out.js:true', 'a.ts:false'])
  })

  it('finds the folder above an entry', () => {
    expect(parentOf('src/deep/c.ts')).toBe('src/deep')
    expect(parentOf('README.md')).toBe('')
  })

  it('moves through the rows with the keys a tree takes', () => {
    const rows = visibleRows(dirs, new Set(['src']))
    // src, src/deep, src/a.ts, docs, README.md
    expect(moveFor('ArrowDown', rows, 0)).toEqual({ kind: 'focus', index: 1 })
    expect(moveFor('ArrowDown', rows, 4)).toEqual({ kind: 'focus', index: 4 })
    expect(moveFor('ArrowUp', rows, 0)).toEqual({ kind: 'focus', index: 0 })
    expect(moveFor('End', rows, 0)).toEqual({ kind: 'focus', index: 4 })
    expect(moveFor('ArrowRight', rows, 1)).toEqual({ kind: 'toggle', path: 'src/deep' })
    expect(moveFor('ArrowRight', rows, 0)).toEqual({ kind: 'focus', index: 1 })
    expect(moveFor('ArrowRight', rows, 2)).toEqual({ kind: 'none' })
    expect(moveFor('ArrowLeft', rows, 2)).toEqual({ kind: 'focus', index: 0 })
    expect(moveFor('ArrowLeft', rows, 0)).toEqual({ kind: 'toggle', path: 'src' })
    expect(moveFor('ArrowLeft', rows, 3)).toEqual({ kind: 'none' })
    expect(moveFor('Enter', rows, 2)).toEqual({ kind: 'open', path: 'src/a.ts' })
    expect(moveFor('Enter', rows, 3)).toEqual({ kind: 'toggle', path: 'docs' })
  })

  it('draws only the rows in view and a margin, and scrolls a row into view by the least amount', () => {
    expect(rowWindow(10_000, 24, 24 * 1000, 240)).toEqual({ first: 992, last: 1018 })
    expect(rowWindow(5, 24, 0, 240)).toEqual({ first: 0, last: 5 })
    expect(rowWindow(1000, 24, 0, 0).last).toBe(48)
    expect(scrollToShow(2, 24, 100, 240)).toBe(48)
    expect(scrollToShow(20, 24, 0, 240)).toBe(264)
    expect(scrollToShow(5, 24, 0, 240)).toBe(0)
  })

  it('shows nothing for a directory that is not loaded yet', () => {
    expect(visibleRows(new Map(), new Set())).toEqual([])
  })
})
