import { describe, expect, it } from 'vitest'
import { parseChannelToHost, parseChannelToPage, parseUiRequest, UiControlError } from '../src/contract.ts'

const invalid = (value: unknown): boolean => { try { parseUiRequest(value); return false } catch (cause) { return cause instanceof UiControlError && cause.code === 'invalid' } }

describe('parseUiRequest', () => {
  it('accepts each well-formed request and keeps only what it knows', () => {
    expect(parseUiRequest({ op: 'snapshot' })).toEqual({ op: 'snapshot' })
    expect(parseUiRequest({ op: 'snapshot', cursor: 30, maxNodes: 50 })).toEqual({ op: 'snapshot', cursor: 30, maxNodes: 50 })
    expect(parseUiRequest({ op: 'click', ref: '3.17' })).toEqual({ op: 'click', ref: '3.17' })
    expect(parseUiRequest({ op: 'type', ref: '3.2', text: 'hi', submit: true })).toEqual({ op: 'type', ref: '3.2', text: 'hi', submit: true })
    expect(parseUiRequest({ op: 'select', ref: '3.2', option: 'pro' })).toEqual({ op: 'select', ref: '3.2', option: 'pro' })
    expect(parseUiRequest({ op: 'press', key: 'Enter' })).toEqual({ op: 'press', key: 'Enter' })
    expect(parseUiRequest({ op: 'scroll', direction: 'down', amount: 200 })).toEqual({ op: 'scroll', direction: 'down', amount: 200 })
    expect(parseUiRequest({ op: 'wait', text: 'Ready', timeoutMs: 500 })).toEqual({ op: 'wait', text: 'Ready', timeoutMs: 500 })
  })

  it.each([
    ['not an object', 'click'], ['no op', {}], ['an unknown op', { op: 'eval', code: 'x' }],
    ['a ref that is not a ref', { op: 'click', ref: 'button' }], ['a ref with extra parts', { op: 'click', ref: '1.2.3' }],
    ['an unknown field', { op: 'click', ref: '1.2', force: true }], ['text too long', { op: 'type', ref: '1.2', text: 'x'.repeat(10_001) }],
    ['a NUL in text', { op: 'type', ref: '1.2', text: 'a\0b' }], ['a non-boolean flag', { op: 'type', ref: '1.2', text: 'a', submit: 'yes' }],
    ['a strange key', { op: 'press', key: 'Control+Alt+Delete' }], ['a bad direction', { op: 'scroll', direction: 'sideways' }],
    ['a huge scroll', { op: 'scroll', direction: 'down', amount: 1e9 }], ['a wait with nothing to wait for', { op: 'wait' }],
    ['a wait that is too long', { op: 'wait', text: 'x', timeoutMs: 60_000 }], ['a negative cursor', { op: 'snapshot', cursor: -1 }],
    ['too many nodes', { op: 'snapshot', maxNodes: 100_000 }],
  ])('refuses %s', (_name, value) => { expect(invalid(value)).toBe(true) })
})

describe('channel messages', () => {
  it('parses a call to the page and refuses a malformed one', () => {
    expect(parseChannelToPage(JSON.stringify({ t: 'call', id: 4, request: { op: 'click', ref: '1.1' } }))).toEqual({ t: 'call', id: 4, request: { op: 'click', ref: '1.1' } })
    expect(() => parseChannelToPage('{"t":"call","id":"x","request":{}}')).toThrow()
    expect(() => parseChannelToPage('{"t":"call","id":1,"request":{"op":"eval"}}')).toThrow()
  })

  it('parses what the page sends and drops anything else', () => {
    expect(parseChannelToHost('{"t":"hello","windowId":"w1","focused":true}')).toEqual({ t: 'hello', windowId: 'w1', focused: true })
    expect(parseChannelToHost('{"t":"focus","focused":false}')).toEqual({ t: 'focus', focused: false })
    expect(parseChannelToHost('{"t":"error","id":2,"code":"stale-ref","message":"gone"}')).toEqual({ t: 'error', id: 2, code: 'stale-ref', message: 'gone' })
    for (const bad of ['nope', '[]', '{"t":"error","id":2,"code":"exploded","message":"x"}', '{"t":"hello","windowId":5,"focused":true}', '{"t":"result","id":1}']) {
      expect(parseChannelToHost(bad)).toBeNull()
    }
  })
})
