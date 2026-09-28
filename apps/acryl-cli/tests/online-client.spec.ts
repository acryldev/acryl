import { describe, expect, it } from 'vitest'
import type { RunningApp } from 'acryl-harness-runtime'
import { OnlineChannelError, pickInstance } from '../src/host/online-client.ts'

function app(id: string, overrides: Partial<RunningApp> = {}): RunningApp {
  return { id, name: id, home: `/h/${id}`, pid: 1, port: 3100, ...overrides }
}

describe('pickInstance (spec 041 TB31)', () => {
  it('picks the sole running instance when none is named', () => {
    expect(pickInstance(undefined, [app('a')])).toEqual(app('a'))
  })

  it('refuses with no running app to pick', () => {
    expect(() => pickInstance(undefined, [])).toThrow(OnlineChannelError)
    expect(() => pickInstance(undefined, [])).toThrow(/no ACRYL app is running/)
  })

  it('refuses an ambiguous pick, naming the choices', () => {
    expect(() => pickInstance(undefined, [app('a'), app('b')])).toThrow(/more than one app is running: a, b/)
  })

  it('picks the named instance by id or by name, among several', () => {
    const a = app('a'); const b = app('b', { name: 'my-app' })
    expect(pickInstance('a', [a, b])).toEqual(a)
    expect(pickInstance('my-app', [a, b])).toEqual(b)
  })

  it('refuses a name that matches nothing running', () => {
    expect(() => pickInstance('ghost', [app('a')])).toThrow(/no running app named "ghost"/)
  })

  it('refuses an ambiguous name match', () => {
    const a = app('a', { name: 'x' }); const b = app('b', { name: 'x' })
    expect(() => pickInstance('x', [a, b])).toThrow(/"x" is ambiguous: a, b/)
  })
})
