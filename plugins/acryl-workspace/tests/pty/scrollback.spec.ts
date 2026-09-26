import { describe, expect, it } from 'vitest'
import { Scrollback } from '../../src/pty/scrollback.ts'

describe('Scrollback', () => {
  it('hands a client exactly what it has not seen, by cursor', () => {
    const s = new Scrollback()
    s.append('abc')
    s.append('def')
    expect(s.cursor).toBe(6)
    expect(s.replay(0)).toEqual({ data: 'abcdef', cursor: 6, replace: false })
    expect(s.replay(3)).toEqual({ data: 'def', cursor: 6, replace: false })
    expect(s.replay(6)).toEqual({ data: '', cursor: 6, replace: false })
  })

  it('keeps only the tail and tells a client that fell behind to start over', () => {
    const s = new Scrollback(10)
    s.append('0123456789')
    s.append('ABCDE')
    expect(s.cursor).toBe(15)
    expect(s.replay(0)).toEqual({ data: '56789ABCDE', cursor: 15, replace: true })
    expect(s.replay(7)).toEqual({ data: '789ABCDE', cursor: 15, replace: false })
    expect(s.replay(99)).toMatchObject({ replace: true })
  })

  it('starts a trimmed tail at a line break when one is close', () => {
    const s = new Scrollback(20)
    s.append('first line\nsecond line\nthird')
    const replay = s.replay(0)
    expect(replay.replace).toBe(true)
    expect(replay.data.startsWith('second line') || replay.data.startsWith('third') || replay.data.startsWith('nd line')).toBe(true)
    expect(replay.data).not.toContain('first')
  })
})
