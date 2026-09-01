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
  id: number
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
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

export type NotificationHandler = (params: unknown) => void
export type RequestHandler = (params: unknown) => unknown | Promise<unknown>

export interface JsonRpcClientOptions {
  /** Called for each line written to stderr (defaults to no-op). */
  onStderr?: (line: string) => void
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
  private readonly stderrHandler: ((line: string) => void) | undefined
  private disposed = false
  private buffer = ''

  constructor(process: ChildProcess, options: JsonRpcClientOptions = {}) {
    this.process = process
    this.stderrHandler = options.onStderr

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

    process.on('exit', (code, signal) => {
      if (!this.disposed) {
        const error = new Error(`JSON-RPC process exited (code=${code}, signal=${signal})`)
        for (const { reject } of this.pending.values()) {
          reject(error)
        }
        this.pending.clear()
      }
    })
  }

  /** Send a request and return a promise that resolves with the result. */
  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('JsonRpcClient is disposed'))
    const id = this.nextId++
    const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.send(message)
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

  /** Register a handler for an inbound request method. */
  onRequest(method: string, handler: RequestHandler): void {
    this.emitter.on(`request:${method}`, handler)
  }

  /** Remove all listeners, reject pending calls. Safe to call multiple times. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const { reject } of this.pending.values()) {
      reject(new Error('JsonRpcClient disposed'))
    }
    this.pending.clear()
    this.emitter.removeAllListeners()
  }

  private send(message: JsonRpcMessage): void {
    if (this.process.stdin === null) return
    const line = JSON.stringify(message) + '\n'
    this.process.stdin.write(line)
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
      Promise.resolve(this.emitter.emit(`request:${req.method}`, req.params))
        .then((handled) => {
          if (!handled && !this.disposed) {
            // Respond with method-not-found error
            this.send({
              jsonrpc: '2.0',
              id: req.id,
              error: { code: -32601, message: `Method not found: ${req.method}` },
            })
          }
        })
        .catch(() => {})
    } else if ('method' in message && !('id' in message)) {
      // Inbound notification
      const notif = message as JsonRpcNotification
      this.emitter.emit(`notification:${notif.method}`, notif.params)
    } else if ('id' in message && !('method' in message)) {
      // Response to our request
      const resp = message as JsonRpcResponse
      const pending = this.pending.get(resp.id)
      if (pending !== undefined) {
        this.pending.delete(resp.id)
        if (resp.error !== undefined) {
          pending.reject(resp.error)
        } else {
          pending.resolve(resp.result)
        }
      }
    }
  }
}
