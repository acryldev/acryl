import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { JsonRpcClient, TransportError } from '../src/agent/transports/acp-json-rpc.ts'

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

  function emitError(error: Error) {
    emitter.emit('error', error)
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
    readonly _emitError: (error: Error) => void
  }

  Object.defineProperty(process, '_captured', { value: captured })
  Object.defineProperty(process, '_sendLine', { value: sendLine })
  Object.defineProperty(process, '_emitExit', { value: emitExit })
  Object.defineProperty(process, '_emitError', { value: emitError })

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

  it('rejects pending calls with TransportError when the process errors, then refuses new calls', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    const pending = client.call('hang')
    proc._emitError(new Error('spawn ENOENT'))

    await expect(pending).rejects.toBeInstanceOf(TransportError)
    await expect(pending).rejects.toThrow('JSON-RPC process failed: spawn ENOENT')

    // The client is dead: further calls reject instead of writing to stdin.
    await expect(client.call('again')).rejects.toBeInstanceOf(TransportError)
    // Notifications are swallowed rather than thrown into a dead stream.
    expect(() => client.notify('session/cancel')).not.toThrow()
    client.dispose()
  })

  it('rejects a call when the request timeout elapses and keeps working after', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc, { requestTimeoutMs: 40 })

    await expect(client.call('hang')).rejects.toThrow('timed out after 40ms')

    // A subsequent call still gets its response.
    proc.on('input', (chunk: string) => {
      const msg = JSON.parse(chunk.trim())
      proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: 'ok' }))
    })
    await expect(client.call('test')).resolves.toBe('ok')
    client.dispose()
  })

  it('supports a per-call timeout override', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc, { requestTimeoutMs: 60_000 })

    await expect(client.call('hang', undefined, { timeoutMs: 30 }))
      .rejects.toThrow('timed out after 30ms')
    client.dispose()
  })

  it('rejects a pending call when the abort signal fires', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)
    const controller = new AbortController()

    const pending = client.call('hang', undefined, { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toThrow(/abort/i)
    client.dispose()
  })

  it('rejects an already-aborted call without writing to stdin', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)
    const controller = new AbortController()
    controller.abort()

    let wrote = false
    proc.on('input', () => { wrote = true })

    await expect(client.call('nope', undefined, { signal: controller.signal }))
      .rejects.toThrow(/abort/i)
    expect(wrote).toBe(false)
    client.dispose()
  })

  it('rejects a call placed after the process exited', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    proc._emitExit(0, null)
    await expect(client.call('late')).rejects.toBeInstanceOf(TransportError)
    client.dispose()
  })

  it('writes an onRequest handler result back as the JSON-RPC response', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    client.onRequest('session/request_permission', () => ({ outcome: { outcome: 'cancelled' } }))
    proc._sendLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 77,
      method: 'session/request_permission',
      params: { sessionId: 's1' },
    }))

    await new Promise((resolve) => setImmediate(resolve))

    const responses = proc._captured.map((line) => JSON.parse(line))
    expect(responses).toHaveLength(1)
    expect(responses[0]).toEqual({
      jsonrpc: '2.0',
      id: 77,
      result: { outcome: { outcome: 'cancelled' } },
    })
    client.dispose()
  })

  it('writes an async onRequest handler result back as the response', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    let received: unknown = null
    client.onRequest('ask', async (params) => {
      received = params
      await new Promise((resolve) => setImmediate(resolve))
      return { ok: true }
    })
    proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ask', params: { q: 1 } }))

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(received).toEqual({ q: 1 })
    const responses = proc._captured.map((line) => JSON.parse(line))
    expect(responses).toEqual([{ jsonrpc: '2.0', id: 9, result: { ok: true } }])
    client.dispose()
  })

  it('writes a -32603 error response when a request handler throws', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    client.onRequest('boom', () => {
      throw new Error('handler exploded')
    })
    proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'boom' }))

    await new Promise((resolve) => setImmediate(resolve))

    const responses = proc._captured.map((line) => JSON.parse(line))
    expect(responses).toEqual([{
      jsonrpc: '2.0',
      id: 5,
      error: { code: -32603, message: 'handler exploded' },
    }])
    client.dispose()
  })

  it('writes a -32603 error response when a request handler rejects', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    client.onRequest('boom', () => Promise.reject(new Error('rejected async')))
    proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'boom' }))

    await new Promise((resolve) => setImmediate(resolve))

    const responses = proc._captured.map((line) => JSON.parse(line))
    expect(responses).toEqual([{
      jsonrpc: '2.0',
      id: 6,
      error: { code: -32603, message: 'rejected async' },
    }])
    client.dispose()
  })

  it('answers -32601 for an inbound request with no registered handler', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'fs/read_text_file' }))

    await new Promise((resolve) => setImmediate(resolve))

    const responses = proc._captured.map((line) => JSON.parse(line))
    expect(responses).toEqual([{
      jsonrpc: '2.0',
      id: 12,
      error: { code: -32601, message: 'Method not found: fs/read_text_file' },
    }])
    client.dispose()
  })

  it('echoes a string request id back verbatim', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    client.onRequest('ask', () => 'yes')
    proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: 'req-abc', method: 'ask' }))

    await new Promise((resolve) => setImmediate(resolve))

    const responses = proc._captured.map((line) => JSON.parse(line))
    expect(responses).toEqual([{ jsonrpc: '2.0', id: 'req-abc', result: 'yes' }])
    client.dispose()
  })

  it('does not write a response when the handler settles after dispose', async () => {
    const proc = createStubProcess()
    const client = new JsonRpcClient(proc)

    let release: (() => void) | undefined
    client.onRequest('slow', () => new Promise<void>((resolve) => { release = () => resolve(undefined) }))
    proc._sendLine(JSON.stringify({ jsonrpc: '2.0', id: 21, method: 'slow' }))
    await new Promise((resolve) => setImmediate(resolve))

    client.dispose()
    release?.()
    await new Promise((resolve) => setImmediate(resolve))

    expect(proc._captured).toHaveLength(0)
  })
})
