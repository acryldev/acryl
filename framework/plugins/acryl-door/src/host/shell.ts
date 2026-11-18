/**
 * The desktop shell's channel: the Electron main process of `npm run desktop`, which reaches the door as a page does (an event stream down, a POST up) and answers calls about
 * the app's windows and menu. One shell at a time: a new one replaces the old (the dev server restarted and the shell came back). It needs this run's secret, so no page can open it.
 */

import { Acryl } from 'acryl-router'
import { streamSSE } from 'acryl-router/helpers'
import { parseShellAnswer, ShellError, shellErrorCode, type ShellCall, type ShellRequest, type ShellResult } from '../shell/protocol.ts'
import { error, INVALID_JSON, jsonBody, operatorOnly, readJson } from './http.ts'
import type { PageStream } from './channel.ts'

const CALL_TIMEOUT_MS = 10_000
/** What a verb says when no desktop shell is attached: one line a model can act on. */
export const NO_DESKTOP = 'no desktop window is attached; run npm run desktop'

interface Pending {
  readonly resolve: (value: ShellResult) => void
  readonly reject: (cause: ShellError) => void
  readonly timer: NodeJS.Timeout
  readonly cleanup: () => void
}

export class ShellChannel {
  private current: { readonly stream: PageStream } | undefined
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private closed = false
  private readonly attachWaiters = new Set<() => void>()

  get connected(): boolean {
    return this.current !== undefined
  }

  /** @returns the function to call when this stream ends. */
  attach(stream: PageStream): () => void {
    const previous = this.current
    const connection = { stream }
    this.current = connection
    if (previous !== undefined) {
      this.failAll(new ShellError('disconnected', 'the desktop shell reconnected before it answered'))
      previous.stream.close()
    }
    for (const waiter of [...this.attachWaiters]) waiter()
    return () => {
      if (this.current !== connection) return
      this.current = undefined
      this.failAll(new ShellError('disconnected', 'the desktop shell went away before it answered'))
    }
  }

  /** A promise for the shell connecting (it reconnects after the dev server restarted). */
  waitForShell(timeoutMs: number): Promise<boolean> {
    if (this.current !== undefined) return Promise.resolve(true)
    return new Promise((resolve) => {
      const done = (value: boolean): void => { clearTimeout(timer); this.attachWaiters.delete(waiter); resolve(value) }
      const waiter = (): void => { done(true) }
      const timer = setTimeout(() => { done(false) }, timeoutMs)
      this.attachWaiters.add(waiter)
    })
  }

  receive(body: unknown): void {
    const answer = parseShellAnswer(body)
    if (answer === null) return
    if (answer.t === 'result') this.settle(answer.id, answer.value)
    else this.settle(answer.id, undefined, new ShellError(shellErrorCode(answer.code), answer.message))
  }

  /** @throws ShellError `no-desktop` when no shell is attached, else what the shell refused with. */
  call(request: ShellRequest, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<ShellResult> {
    if (this.closed) return Promise.reject(new ShellError('unloaded', 'the door was unloaded'))
    const target = this.current
    if (target === undefined) return Promise.reject(new ShellError('no-desktop', NO_DESKTOP))
    const signal = options.signal
    if (signal?.aborted === true) return Promise.reject(new ShellError('aborted', 'the call was cancelled'))
    const id = this.nextId
    this.nextId += 1
    return new Promise<ShellResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.settle(id, undefined, new ShellError('timeout', 'the desktop shell did not answer in time')) }, options.timeoutMs ?? CALL_TIMEOUT_MS)
      const onAbort = (): void => { this.settle(id, undefined, new ShellError('aborted', 'the call was cancelled')) }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, { resolve, reject, timer, cleanup: () => { signal?.removeEventListener('abort', onAbort) } })
      try {
        target.stream.send(JSON.stringify({ t: 'call', id, request } satisfies ShellCall))
      } catch {
        this.settle(id, undefined, new ShellError('disconnected', 'the desktop shell could not be reached'))
      }
    })
  }

  close(): void {
    this.closed = true
    this.failAll(new ShellError('unloaded', 'the door was unloaded'))
    this.current?.stream.close()
    this.current = undefined
  }

  private failAll(failure: ShellError): void {
    for (const id of [...this.pending.keys()]) this.settle(id, undefined, failure)
  }

  private settle(id: number, value: ShellResult | undefined, failure?: ShellError): void {
    const entry = this.pending.get(id)
    if (entry === undefined) return
    this.pending.delete(id)
    clearTimeout(entry.timer)
    entry.cleanup()
    if (failure !== undefined) entry.reject(failure)
    else entry.resolve(value as ShellResult)
  }
}

/** How often a `ping` is written, so the shell knows a silent stream died and reconnects. */
export const SHELL_HEARTBEAT_MS = 15_000

/** `GET <prefix>/shell/events` is the shell's stream and `POST <prefix>/shell/answer` carries its answers: both need this run's secret. */
export function shellRoutes(prefix: string, secret: string, channel: ShellChannel, heartbeatMs = SHELL_HEARTBEAT_MS): Acryl {
  return new Acryl()
    .get(`${prefix}/shell/events`, operatorOnly(secret), (c) => {
      const signal = c.req.raw.signal
      return streamSSE(c, async (stream) => {
        let end = (): void => {}
        const ended = new Promise<void>((resolve) => { end = resolve })
        stream.onAbort(end)
        signal.addEventListener('abort', end, { once: true })
        const write = (event: string, data: string): void => {
          stream.writeSSE({ event, data }).catch(end)
        }
        const detach = channel.attach({ send: (data) => { write('call', data) }, close: end })
        const beat = setInterval(() => { write('ping', '') }, heartbeatMs)
        try {
          write('ready', '')
          await ended
        } finally {
          clearInterval(beat)
          signal.removeEventListener('abort', end)
          detach()
        }
      })
    })
    .post(`${prefix}/shell/answer`, operatorOnly(secret), jsonBody, async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON || typeof body !== 'object' || body === null) return c.json(error('invalid request body'), 400)
      channel.receive(body)
      return c.json({ ok: true })
    })
}
