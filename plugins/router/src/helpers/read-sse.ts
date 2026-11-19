/**
 * `readSSE(response)`: the events of a `text/event-stream` answer from `fetch`, for the browser. `EventSource` reads GET streams only; a chat
 * or any stream that needs a POST body, a header or an `AbortSignal` is read with `fetch`, and this is the loop every such page otherwise writes by
 * hand. It follows the parsing rules of the HTML standard (lines end in LF, CRLF or CR; the `data` lines of one event join with LF; a line that
 * starts with a colon is a comment; an event ends at a blank line; an event with no `data` line is not dispatched; the last event is dispatched
 * only if its blank line arrived), and it is one module with no imports, so it also runs in a service worker and on a fetch runtime.
 *
 * ACRYL's own addition, not part of the upstream port.
 */

/** One event of the stream. */
export interface SSEEvent {
  /** The `event:` name; `message` when the event has none. */
  readonly event: string
  /** The `data:` lines of the event, joined with a line feed. */
  readonly data: string
  /** The `id:` of the event, when it had one. */
  readonly id?: string
  /** The `retry:` of the event in milliseconds, when it had one. */
  readonly retry?: number
}

export interface ReadSSEOptions {
  /** Stops the loop and cancels the response body when it aborts. (Abort the `fetch` itself with the signal you pass to it.) */
  readonly signal?: AbortSignal
}

/**
 * Read the events of a `text/event-stream` response as they arrive. Leaving the loop early (`break`, a thrown error) cancels the body, so the
 * request to the server ends.
 * @throws when the response is not `ok` (the status is in the message; the body is cancelled, not parsed), has no body, or fails while it is read.
 */
export async function* readSSE(response: Response, options: ReadSSEOptions = {}): AsyncGenerator<SSEEvent, void, undefined> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`readSSE: the request failed with ${String(response.status)}${response.statusText === '' ? '' : ` ${response.statusText}`}`)
  }
  if (response.body === null) throw new Error('readSSE: the response has no body to read')
  const { signal } = options
  if (signal?.aborted === true) {
    await response.body.cancel().catch(() => undefined)
    return
  }

  const reader = response.body.getReader()
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let skipLineFeed = false
  let name = ''
  let data: string[] = []
  let id: string | undefined
  let retry: number | undefined

  /** Apply one line; returns the event when this line completes one. */
  const apply = (line: string): SSEEvent | undefined => {
    if (line === '') {
      const event = data.length === 0 ? undefined : { event: name === '' ? 'message' : name, data: data.join('\n'), ...(id === undefined ? {} : { id }), ...(retry === undefined ? {} : { retry }) }
      name = ''
      data = []
      id = undefined
      retry = undefined
      return event
    }
    if (line.startsWith(':')) return undefined
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') name = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') {
      if (!value.includes('\u0000')) id = value
    } else if (field === 'retry' && /^\d+$/u.test(value)) retry = Number(value)
    return undefined
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      let text = decoder.decode(value, { stream: true })
      // A CR at the end of the last chunk already ended its line; the LF that completes the CRLF may open this one.
      if (skipLineFeed && text.startsWith('\n')) text = text.slice(1)
      if (text !== '') skipLineFeed = false
      buffer += text
      let start = 0
      for (let index = 0; index < buffer.length; index += 1) {
        const code = buffer.charCodeAt(index)
        if (code !== 10 && code !== 13) continue
        const line = buffer.slice(start, index)
        if (code === 13) {
          if (index + 1 < buffer.length) {
            if (buffer.charCodeAt(index + 1) === 10) index += 1
          } else skipLineFeed = true
        }
        start = index + 1
        const event = apply(line)
        if (event !== undefined) yield event
      }
      buffer = buffer.slice(start)
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await reader.cancel().catch(() => undefined)
  }
}
