import { describe, expect, it } from 'vitest'
import { joinPath, visibleRows, type DirState } from '../../src/client/files/tree-model.ts'

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
    expect(visibleRows(dirs, new Set(), '').map(r => r.path)).toEqual(['src', 'docs', 'README.md'])
    const rows = visibleRows(dirs, new Set(['src', 'src/deep']), '')
    expect(rows.map(r => `${r.depth}:${r.path}`)).toEqual(['0:src', '1:src/deep', '2:src/deep/c.ts', '1:src/a.ts', '0:docs', '0:README.md'])
    expect(rows[0]).toMatchObject({ kind: 'dir', open: true })
  })

  it('marks an open folder that is still loading or failed', () => {
    const state = new Map<string, DirState>([['', ready('src/', 'lib/')], ['src', { phase: 'loading' }], ['lib', { phase: 'error', message: 'x' }]])
    const rows = visibleRows(state, new Set(['src', 'lib']), '')
    expect(rows.find(r => r.path === 'src')?.status).toBe('loading')
    expect(rows.find(r => r.path === 'lib')?.status).toBe('error')
  })

  it('filters loaded files by name across opened folders, case-insensitively, as a flat list', () => {
    const rows = visibleRows(dirs, new Set(), '  C.T')
    expect(rows.map(r => r.path)).toEqual(['src/deep/c.ts'])
    expect(rows[0]?.depth).toBe(0)
    expect(visibleRows(dirs, new Set(), 'zzz')).toEqual([])
  })

  it('shows nothing for a directory that is not loaded yet', () => {
    expect(visibleRows(new Map(), new Set(), '')).toEqual([])
  })
})
