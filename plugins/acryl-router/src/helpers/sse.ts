import type { RouteContext } from '../types.ts'

export interface SseStream {
  /** Send one event. Objects and arrays are sent as JSON; strings as they are. */
  send(data: unknown, options?: { readonly event?: string, readonly id?: string }): void
  /** Send a comment line (a keep-alive that clients ignore). */
  comment(text: string): void
  /** End the stream from the server side. */
  close(): void
  /** Aborted when the client goes away or the router is disposed. */
  readonly signal: AbortSignal
}

const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * A server-sent-event response (Hono's `streamSSE`). `run` starts the stream; whatever cleanup function it returns runs exactly once when the stream
 * ends for any reason (the client disconnects, `close()`, a plugin unload, the router being disposed). The request is held in flight with `waitUntil`
 * until then, so disposal waits for the stream instead of leaking it.
 */
export function streamSSE(c: RouteContext, run: (stream: SseStream) => void | (() => void)): Response {
  let finish!: () => void
  c.waitUntil(new Promise<void>(resolve => { finish = resolve }))
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cleanup: (() => void) | undefined
  let ended = false

  const end = (): void => {
    if (ended) return
    ended = true
    c.signal.removeEventListener('abort', end)
    try { cleanup?.() } finally {
      try { controller.close() } catch { /* already closed */ }
      finish()
    }
  }

  const body = new ReadableStream<Uint8Array>({
    start: ctrl => {
      controller = ctrl
      const stream: SseStream = {
        signal: c.signal,
        send: (data, options) => {
          if (ended) return
          const lines: string[] = []
          if (options?.id !== undefined) lines.push(`id: ${options.id}`)
          if (options?.event !== undefined) lines.push(`event: ${options.event}`)
          const payload = typeof data === 'string' ? data : JSON.stringify(data)
          for (const line of payload.split('\n')) lines.push(`data: ${line}`)
          try { controller.enqueue(encode(`${lines.join('\n')}\n\n`)) } catch { end() }
        },
        comment: text => {
          if (ended) return
          try { controller.enqueue(encode(`: ${text.replaceAll('\n', ' ')}\n\n`)) } catch { end() }
        },
        close: end,
      }
      if (c.signal.aborted) { end(); return }
      c.signal.addEventListener('abort', end, { once: true })
      cleanup = run(stream) ?? undefined
      if (ended) { try { cleanup?.() } catch { /* the stream already ended */ } }
    },
    cancel: end,
  })
  return new Response(body, { headers: HEADERS })
}
