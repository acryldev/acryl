import { describe, expect, it } from 'vitest'
import { changeFor, fileToOpenAfter } from '../../src/client/files/file-edit.ts'

describe('changeFor', () => {
  it('turns what was typed into the change to request, trimmed', () => {
    expect(changeFor({ type: 'create', entry: 'file', value: ' src/a.ts ' })).toEqual({ op: 'create', kind: 'file', file: 'src/a.ts' })
    expect(changeFor({ type: 'create', entry: 'dir', value: 'docs' })).toEqual({ op: 'create', kind: 'dir', file: 'docs' })
    expect(changeFor({ type: 'rename', file: 'a.ts', value: 'b.ts' })).toEqual({ op: 'rename', file: 'a.ts', to: 'b.ts' })
    expect(changeFor({ type: 'delete', file: 'a.ts', isDir: false })).toEqual({ op: 'delete', file: 'a.ts' })
  })
  it('asks for nothing while a name is empty', () => {
    expect(changeFor({ type: 'create', entry: 'file', value: '   ' })).toBeNull()
    expect(changeFor({ type: 'rename', file: 'a.ts', value: '' })).toBeNull()
  })
})

describe('fileToOpenAfter', () => {
  it('opens only a newly created file', () => {
    expect(fileToOpenAfter({ op: 'create', kind: 'file', file: 'a.ts' }, 'a.ts')).toBe('a.ts')
    expect(fileToOpenAfter({ op: 'create', kind: 'dir', file: 'd' }, 'd')).toBeNull()
    expect(fileToOpenAfter({ op: 'rename', file: 'a', to: 'b' }, 'b')).toBeNull()
    expect(fileToOpenAfter({ op: 'delete', file: 'a' }, null)).toBeNull()
  })
})
