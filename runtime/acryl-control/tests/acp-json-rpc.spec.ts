import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { JsonRpcClient } from '../src/agent/transports/acp-json-rpc.ts'

/** A minimal stub process with stdin/stdout/stderr for testing. */
function createStubProcess() {
  const stdin = new Writable({ decodeStrings: false })
  const stdout = new Readable({ read() {} })
  const stderr = new Readable({ read() {} })
  const emitter = new EventEmitter()

  const captured: string[] = []
  stdin._write = (chunk: string, _enc: BufferEncoding, done: () => void) => {
    captured.push(chunk)
    emitter.emit('input', chunk)
    done()
  }

  // Helper to send a line back from the "process"
  function sendLine(line: string) {
    stdout.push(line + '\n')
  }

  function emitExit(code: number | null, signal: NodeJS.Signals | null) {
    emitter.emit('exit', code, signal)
  }

  const state = { killed: false }
  const process = {
    stdin,
    stdout,
    stderr,
    pid: 12345,
    get killed() { return state.killed },
    once: emitter.once.bind(emitter),
    on: emitter.on.bind(emitter),
    kill: (_signal?: string) => { state.killed = true; return true },
    removeListener: emitter.removeListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
  } as unknown as import('node:child_process').ChildProcess & {
    readonly _captured: string[]
    readonly _sendLine: (line: string) => void
    readonly _emitExit: (code: number | null, signal: NodeJS.Signals | null) => void
  }

  Object.defineProperty(process, '_captured', { value: captured })
  Object.defineProperty(process, '_sendLine', { value: sendLine })
  Object.defineProperty(process, '_emitExit', { value: emitExit })

  return process
}

describe('JsonRpcClient', () => {
  it('sends a call and resolves with the matching response', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    // When the client sends the request, respond
    proc.on('input', (chunk: string) => {
      const msg = JSON.parse(chunk.trim())
      if (msg.method === 'add') {
        proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: 42 }))
      }
    })

    const result = await client.call<number>('add', { a: 2, b: 40 })
    expect(result).toBe(42)
    client.dispose()
  })

  it('sends a notification without expecting a response', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    let captured: unknown = null
    proc.on('input', (chunk: string) => {
      captured = JSON.parse(chunk.trim())
    })

    client.notify('session/cancel', { sessionId: 's1' })
    expect(captured).toEqual({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: 's1' },
    })
    client.dispose()
  })

  it('dispatches inbound notifications to registered handlers', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    const updates: unknown[] = []
    client.onNotification('session/update', (params) => {
      updates.push(params)
    })

    proc._sendLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk' } },
    }))

    // Allow the stream 'data' event to fire
    await new Promise((resolve) => setImmediate(resolve))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ update: { sessionUpdate: 'agent_message_chunk' } })
    client.dispose()
  })

  it('correlates two concurrent calls to the right responses', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    proc.on('input', (chunk: string) => {
      const msg = JSON.parse(chunk.trim())
      proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.id * 10 }))
    })

    const [r1, r2] = await Promise.all([
      client.call<number>('op1'),
      client.call<number>('op2'),
    ])

    expect(r1).toBe(10)
    expect(r2).toBe(20)
    client.dispose()
  })

  it('rejects a call when the response is a JSON-RPC error', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    proc.on('input', (chunk: string) => {
      const msg = JSON.parse(chunk.trim())
      proc._sendLine(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: 'Method not found' },
      }))
    })

    await expect(client.call('unknown')).rejects.toMatchObject({
      code: -32601,
      message: 'Method not found',
    })
    client.dispose()
  })

  it('rejects pending calls on dispose', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    // Start a call that never gets a response
    const promise = client.call('hang')
    client.dispose()

    await expect(promise).rejects.toThrow('JsonRpcClient disposed')
  })

  it('rejects pending calls on process exit', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    const promise = client.call('hang')
    proc._emitExit(1, null)

    await expect(promise).rejects.toThrow('JSON-RPC process exited')
    client.dispose()
  })

  it('ignores malformed lines on stdout', () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    // Should not throw
    proc._sendLine('this is not json')
    proc._sendLine('')
    proc._sendLine('{ broken json')

    // Client should still work after malformed input
    proc.on('input', (chunk: string) => {
      const msg = JSON.parse(chunk.trim())
      proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: 'ok' }))
    })

    return client.call('test').then((result) => {
      expect(result).toBe('ok')
      client.dispose()
    })
  })
})
