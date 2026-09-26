// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { StreamSocket } from '../../src/client/terminal/pty-stream.ts'
import { TerminalRegistry } from '../../src/client/terminal/terminal-session.ts'

class FakeSocket implements StreamSocket {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 1
  send(): void {}
  close(): void {}
  drop(code: number): void { this.readyState = 3; this.onclose?.(new CloseEvent('close', { code })) }
  deliver(message: object): void { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) })) }
}

describe('TerminalRegistry', () => {
  it('reuses one session per id and tells listeners when a process ends', () => {
    const sockets: FakeSocket[] = []
    const registry = new TerminalRegistry({ createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s }, urlFor: id => `ws://x/${id}` })
    const exits: Array<[string, number | null]> = []
    const stop = registry.onExit((id, code) => { exits.push([id, code]) })
    const first = registry.ensure('pty_1')
    expect(registry.ensure('pty_1')).toBe(first)
    sockets[0]?.deliver({ t: 'exit', exitCode: 3, error: null })
    expect(exits).toEqual([['pty_1', 3]])
    expect(first.getSnapshot()).toMatchObject({ status: 'exited', exitCode: 3 })
    stop()
    registry.ensure('pty_2')
    sockets[1]?.deliver({ t: 'exit', exitCode: 0, error: null })
    expect(exits).toHaveLength(1)
    registry.disposeAll()
  })

  it('ends a session when its tab is closed and starts a fresh one for a reused id', () => {
    const registry = new TerminalRegistry({ createSocket: () => new FakeSocket(), urlFor: id => `ws://x/${id}` })
    const first = registry.ensure('pty_1')
    registry.release('pty_1')
    expect(registry.ensure('pty_1')).not.toBe(first)
    registry.disposeAll()
  })

  it('tells listeners once when the Host no longer knows a terminal, and does not when it merely reconnects', () => {
    const sockets: FakeSocket[] = []
    const registry = new TerminalRegistry({ createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s }, urlFor: id => `ws://x/${id}` })
    const lost: string[] = []
    registry.onLost(id => { lost.push(id) })
    registry.ensure('pty_1')
    registry.ensure('pty_2')
    sockets[0]?.drop(1006)
    expect(lost).toEqual([])
    sockets[1]?.drop(4404)
    expect(lost).toEqual(['pty_2'])
    registry.disposeAll()
  })
})
