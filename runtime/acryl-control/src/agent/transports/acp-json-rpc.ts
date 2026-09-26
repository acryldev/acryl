/**
 * JSON-RPC 2.0 client over child process stdio.
 *
 * Line-delimited JSON framing: one JSON-RPC object per line on stdin/stdout.
 * Used by the Devin ACP transport to speak the Agent Client Protocol.
 */

import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  /** JSON-RPC allows string ids as well; echoed back verbatim. */
  id: number | string
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

/**
 * Raised when the JSON-RPC transport itself fails: a failed spawn, a dead
 * child process, an unwritable stdin, a request timeout, or disposal. These
 * are transport faults, not JSON-RPC error responses from the peer.
 */
export class TransportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'TransportError'
  }
}

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  /** Release the timer and abort listener owned by this call. */
  cleanup: () => void
}

export type NotificationHandler = (params: unknown) => void
export type RequestHandler = (params: unknown) => unknown | Promise<unknown>

export interface JsonRpcClientOptions {
  /** Called for each line written to stderr (defaults to no-op). */
  onStderr?: (line: string) => void
  /**
   * Per-request timeout in milliseconds. A call that receives no response
   * within the budget rejects with a {@link TransportError}. `0` disables
   * the timeout. Default: 30_000.
   */
  requestTimeoutMs?: number | undefined
}

/** Per-call options for {@link JsonRpcClient.call}. */
export interface JsonRpcCallOptions {
  /** Rejects the pending call when the signal aborts. */
  readonly signal?: AbortSignal | undefined
  /** Overrides the client-level request timeout for this call. */
  readonly timeoutMs?: number | undefined
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * A JSON-RPC 2.0 client that communicates over a child process's stdio.
 *
 * The client sends requests and notifications on the process's stdin and
 * receives responses and notifications on stdout. Line-delimited JSON
 * framing is used (one JSON object per line).
 */
export class JsonRpcClient {
  private readonly process: ChildProcess
  private readonly emitter = new EventEmitter()
  private nextId = 1
  private readonly pending = new Map<number, PendingCall>()
  /**
   * Inbound request handlers are a Map, not the emitter: an agent request
   * has exactly one answerer and the handler's return value must reach the
   * wire, which `emit`'s boolean cannot carry.
   */
  private readonly requestHandlers = new Map<string, RequestHandler>()
  /**
   * In-flight inbound request handler tasks. Tracked so `dispose()` can drop
   * the references; a task that settles after disposal never writes to the
   * dead stdin.
   */
  private readonly inflightRequests = new Set<Promise<void>>()
  private readonly stderrHandler: ((line: string) => void) | undefined
  private readonly requestTimeoutMs: number
  private disposed = false
  private dead = false
  private deadError: TransportError | undefined
  private buffer = ''

  constructor(process: ChildProcess, options: JsonRpcClientOptions = {}) {
    this.process = process
    this.stderrHandler = options.onStderr
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

    if (process.stdout === null) {
      throw new Error('JsonRpcClient requires a process with stdout')
    }
    if (process.stdin === null) {
      throw new Error('JsonRpcClient requires a process with stdin')
    }

    process.stdout.setEncoding('utf8')
    process.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      let newlineIndex: number
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIndex).trim()
        this.buffer = this.buffer.slice(newlineIndex + 1)
        if (line !== '') this.handleLine(line)
      }
    })

    if (process.stderr !== null) {
      let stderrBuffer = ''
      process.stderr.setEncoding('utf8')
      process.stderr.on('data', (chunk: string) => {
        stderrBuffer += chunk
        let idx: number
        while ((idx = stderrBuffer.indexOf('\n')) !== -1) {
          const line = stderrBuffer.slice(0, idx).trim()
          stderrBuffer = stderrBuffer.slice(idx + 1)
          if (line !== '' && this.stderrHandler) this.stderrHandler(line)
        }
      })
    }

    // A failed spawn (bad binaryPath or cwd) emits 'error' on the child; an
    // unhandled 'error' becomes an uncaughtException that kills the host.
    process.once('error', (error: Error) => {
      this.failAll(new TransportError(`JSON-RPC process failed: ${error.message}`, error))
    })

    process.on('exit', (code, signal) => {
      this.failAll(new TransportError(`JSON-RPC process exited (code=${code}, signal=${signal})`))
    })

    // Writing to a dead child's stdin raises EPIPE on the stream; it must
    // surface as a TransportError on pending calls, never as an unhandled
    // stream 'error'.
    process.stdin.on('error', (error: Error) => {
      this.failAll(new TransportError(`JSON-RPC stdin failed: ${error.message}`, error))
    })
  }

  /**
   * Send a request and return a promise that resolves with the result.
   *
   * The call rejects with a {@link TransportError} when the client-level (or
   * per-call) request timeout elapses, when the process dies or fails to
   * spawn, or when writing to stdin fails. `options.signal` aborts the call.
   */
  call<T = unknown>(method: string, params?: unknown, options: JsonRpcCallOptions = {}): Promise<T> {
    if (this.disposed) return Promise.reject(new TransportError('JsonRpcClient is disposed'))
    if (this.dead) {
      return Promise.reject(this.deadError ?? new TransportError('JSON-RPC process is not running'))
    }
    if (options.signal?.aborted) return Promise.reject(abortError(options.signal))
    const id = this.nextId++
    const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    const signal = options.signal
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        if (this.pending.delete(id)) {
          cleanup()
          reject(abortError(signal as AbortSignal))
        }
      }
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, cleanup })
      const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (this.pending.delete(id)) {
            cleanup()
            reject(new TransportError(`JSON-RPC call "${method}" timed out after ${timeoutMs}ms`))
          }
        }, timeoutMs)
        // A pending RPC must never hold the host process open.
        timer.unref?.()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      if (!this.send(message) && this.pending.delete(id)) {
        cleanup()
        reject(new TransportError('JSON-RPC process stdin is not writable'))
      }
    })
  }

  /** Send a notification (no response expected). */
  notify(method: string, params?: unknown): void {
    if (this.disposed) return
    const message: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.send(message)
  }

  /** Register a handler for an inbound notification method. */
  onNotification(method: string, handler: NotificationHandler): void {
    this.emitter.on(`notification:${method}`, handler)
  }

  /**
   * Register the handler for an inbound request method. One handler per
   * method; re-registering replaces the previous handler.
   *
   * The handler may be sync or async. Its return value is written back to
   * the peer as the JSON-RPC `result`; a throw or rejection becomes a
   * `-32603` error response.
   */
  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler)
  }

  /** Remove all listeners, reject pending calls. Safe to call multiple times. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const { reject, cleanup } of this.pending.values()) {
      cleanup()
      reject(new TransportError('JsonRpcClient disposed'))
    }
    this.pending.clear()
    this.requestHandlers.clear()
    this.inflightRequests.clear()
    this.emitter.removeAllListeners()
  }

  /**
   * Mark the transport dead and reject every pending call with the same
   * failure. Idempotent; later calls reuse the first recorded cause.
   */
  private failAll(error: TransportError): void {
    this.dead = true
    if (this.deadError === undefined) this.deadError = error
    const failure = this.deadError
    for (const { reject, cleanup } of this.pending.values()) {
      cleanup()
      reject(failure)
    }
    this.pending.clear()
  }

  /**
   * Write one framed message to the child's stdin. Returns `false` when the
   * peer is dead or the stream can no longer accept writes — callers turn
   * that into a {@link TransportError} instead of an unhandled stream error.
   */
  private send(message: JsonRpcMessage): boolean {
    const stdin = this.process.stdin
    if (
      stdin === null
      || this.dead
      || this.disposed
      || stdin.destroyed
      || stdin.writableEnded
      || this.process.killed
    ) {
      return false
    }
    try {
      stdin.write(JSON.stringify(message) + '\n')
      return true
    } catch {
      return false
    }
  }

  private handleLine(line: string): void {
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line)
    } catch {
      // Ignore malformed lines (could be agent banner output)
      return
    }

    if ('id' in message && 'method' in message) {
      // Inbound request
      const req = message as JsonRpcRequest
      this.handleInboundRequest(req)
    } else if ('method' in message && !('id' in message)) {
      // Inbound notification
      const notif = message as JsonRpcNotification
      this.emitter.emit(`notification:${notif.method}`, notif.params)
    } else if ('id' in message && !('method' in message)) {
      // Response to our request. Outbound ids are always numbers; a
      // non-numeric id can only be a stray/duplicate and is ignored.
      const resp = message as JsonRpcResponse
      if (typeof resp.id !== 'number') return
      const pending = this.pending.get(resp.id)
      if (pending !== undefined) {
        this.pending.delete(resp.id)
        pending.cleanup()
        if (resp.error !== undefined) {
          pending.reject(resp.error)
        } else {
          pending.resolve(resp.result)
        }
      }
    }
  }

  /**
   * Dispatch an inbound request to its registered handler and write the
   * handler's settled value back as the JSON-RPC response.
   *
   * The handler resolves asynchronously, so awaiting it never blocks the
   * stdout reader: later lines (responses to our own calls, notifications)
   * keep processing while the answer is produced. `undefined` results are
   * serialized as `null` — an absent `result` key is not a valid response.
   * Every settled handler produces exactly one response; a handler that
   * settles after `dispose()` writes nothing.
   */
  private handleInboundRequest(req: JsonRpcRequest): void {
    const handler = this.requestHandlers.get(req.method)
    if (handler === undefined) {
      if (!this.disposed) {
        this.send({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        })
      }
      return
    }

    const task: Promise<void> = Promise.resolve()
      .then(() => handler(req.params))
      .then((result) => {
        if (this.disposed) return
        this.send({
          jsonrpc: '2.0',
          id: req.id,
          result: result === undefined ? null : result,
        })
      })
      .catch((error: unknown) => {
        if (this.disposed) return
        this.send({
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        })
      })
      .finally(() => {
        this.inflightRequests.delete(task)
      })
    this.inflightRequests.add(task)
  }
}
