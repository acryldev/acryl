import { vi } from 'vitest'
import { AgentStatusState } from '../../src/client/status/agent-status-state.ts'
import { DockController } from '../../src/client/dock/dock-controller.ts'
import type { WorkspacePtyApi } from '../../src/client/terminal/pty-api.ts'
import { TerminalRegistry } from '../../src/client/terminal/terminal-session.ts'

// jsdom has no matchMedia, which xterm asks for when it opens a terminal.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
  })
}

export const fakeSocket = () => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null, readyState: 0 })

/** A Host that starts terminals with predictable ids and remembers what it was asked. */
export function fakePtyApi() {
  let count = 0
  const started: Array<{ commandId: string; cwd: string | undefined }> = []
  const closed: string[] = []
  const api: WorkspacePtyApi = {
    start: vi.fn(async (commandId, cwd) => { count += 1; started.push({ commandId, cwd }); return { id: `term-${String(count)}`, status: 'running' as const, output: '', exitCode: null, error: null } }),
    read: vi.fn(async () => { throw new Error('not used') }),
    write: vi.fn(async () => {}),
    resize: vi.fn(async () => {}),
    close: vi.fn(async (id: string) => { closed.push(id) }),
  }
  return { api, started, closed }
}

export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, data }
}

export function makeDock(storage = memoryStorage()) {
  const terminals = new TerminalRegistry({ createSocket: fakeSocket, urlFor: id => `ws://x/${id}` })
  const pty = fakePtyApi()
  const timers: Array<() => void> = []
  const controller = new DockController({ api: pty.api, terminals, storage, setTimer: (cb) => { timers.push(cb); return timers.length }, clearTimer: () => {} })
  return { controller, terminals, pty, storage, timers }
}

/** An agent status state whose Host answers with whatever `set` last received. */
export function makeStatus() {
  let list: Array<{ terminalId: string; state: 'working' | 'waiting' | 'done'; at: number }> = []
  const state = new AgentStatusState({ list: async () => list })
  return { state, set: (next: typeof list) => { list = next } }
}
