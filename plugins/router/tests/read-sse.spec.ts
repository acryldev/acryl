/**
 * `readSSE`: the events of a `text/event-stream` answer from `fetch`, for the POST streams `EventSource` (GET only) cannot read. It follows
 * the SSE parsing rules of the HTML standard: lines end in LF, CRLF or CR; `data` lines of one event join with LF; a comment line starts
 * with a colon; an event ends at a blank line; an event with no `data` line is not dispatched; the last event is dispatched only if its
 * blank line arrived.
 */

import { describe, expect, it } from 'vitest'
import { Acryl } from '../src/index.ts'
import { streamSSE } from '../src/core/helper/streaming/index.ts'
import { readSSE, type SSEEvent } from '../src/helpers/read-sse.ts'

/** A response whose body arrives in exactly these chunks (strings are UTF-8 encoded; byte arrays are used as they are). */
function chunked(chunks: (string | Uint8Array)[], init: ResponseInit = { headers: { 'content-type': 'text/event-stream' } }): Response {
  const encoder = new TextEncoder()
  let index = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++]
      if (chunk === undefined) controller.close()
      else controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
    },
  }), init)
}

async function collect(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const event of readSSE(response)) events.push(event)
  return events
}

describe('readSSE parsing', () => {
  it('reads events with the default name, a name, an id and a retry', async () => {
    const events = await collect(chunked(['data: one\n\nevent: token\ndata: two\nid: 7\nretry: 3000\n\n']))
    expect(events).toEqual([
      { event: 'message', data: 'one' },
      { event: 'token', data: 'two', id: '7', retry: 3000 },
    ])
  })

  it('joins several data lines with a line feed, and keeps an empty data line', async () => {
    expect(await collect(chunked(['data: a\ndata: b\ndata:\ndata: c\n\n']))).toEqual([{ event: 'message', data: 'a\nb\n\nc' }])
    expect(await collect(chunked(['data:\n\n']))).toEqual([{ event: 'message', data: '' }])
  })

  it('removes one space after the colon, and no more', async () => {
    expect(await collect(chunked(['data:  two spaces\n\ndata:none\n\n']))).toEqual([
      { event: 'message', data: ' two spaces' },
      { event: 'message', data: 'none' },
    ])
  })

  it('accepts LF, CRLF and CR line ends, also a CRLF cut between the two chunks', async () => {
    expect(await collect(chunked(['data: a\r\n\r\ndata: b\r\rdata: c\n\n']))).toEqual([
      { event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
      { event: 'message', data: 'c' },
    ])
    expect(await collect(chunked(['data: a\r', '\n\r', '\ndata: b\r', '\n\r\n']))).toEqual([
      { event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
    ])
    // The LF that completes a CRLF is not a blank line: two data lines stay one event.
    expect(await collect(chunked(['data: a\r', '\ndata: b\r\n\r\n']))).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('ignores comments, unknown fields and a field-less line', async () => {
    expect(await collect(chunked([': keep-alive\ndata: x\nunknown: y\nnocolon\n\n: another\n\n']))).toEqual([{ event: 'message', data: 'x' }])
  })

  it('does not dispatch an event that has no data line, and resets its name', async () => {
    expect(await collect(chunked(['event: ping\n\ndata: after\n\n']))).toEqual([{ event: 'message', data: 'after' }])
  })

  it('does not dispatch the last event when its blank line never arrived', async () => {
    expect(await collect(chunked(['data: whole\n\ndata: cut off']))).toEqual([{ event: 'message', data: 'whole' }])
  })

  it('ignores an id with a null character and a retry that is not digits', async () => {
    expect(await collect(chunked(['id: a\u0000b\nretry: soon\ndata: x\n\n']))).toEqual([{ event: 'message', data: 'x' }])
  })

  it('removes a byte order mark at the start of the stream', async () => {
    expect(await collect(chunked(['﻿data: x\n\n']))).toEqual([{ event: 'message', data: 'x' }])
  })

  it('reassembles lines and UTF-8 characters split across chunks, one byte at a time', async () => {
    const bytes = new TextEncoder().encode('event: token\ndata: café ✓ 😀\n\ndata: second\n\n')
    const events = await collect(chunked(Array.from(bytes, byte => new Uint8Array([byte]))))
    expect(events).toEqual([
      { event: 'token', data: 'café ✓ 😀' },
      { event: 'message', data: 'second' },
    ])
  })

  it('reads ten thousand events', async () => {
    const lines = Array.from({ length: 10_000 }, (_, index) => `data: ${index}\n\n`)
    const events = await collect(chunked([lines.join('')]))
    expect(events).toHaveLength(10_000)
    expect(events.at(-1)?.data).toBe('9999')
  })
})

describe('readSSE and the response', () => {
  it('yields each event as soon as its blank line arrives, before the stream ends', async () => {
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const encoder = new TextEncoder()
    const response = new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('data: early\n\n'))
        await held
        controller.enqueue(encoder.encode('data: late\n\n'))
        controller.close()
      },
    }))
    const iterator = readSSE(response)[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual({ event: 'message', data: 'early' })
    release()
    expect((await iterator.next()).value).toEqual({ event: 'message', data: 'late' })
    expect((await iterator.next()).done).toBe(true)
  })

  it('cancels the response body when the loop stops early', async () => {
    let cancelled = false
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode('data: tick\n\n')) },
      cancel() { cancelled = true },
    }))
    for await (const event of readSSE(response)) {
      expect(event.data).toBe('tick')
      break
    }
    expect(cancelled).toBe(true)
  })

  it('cancels the body and ends when the signal aborts', async () => {
    let cancelled = false
    const controller = new AbortController()
    const response = new Response(new ReadableStream<Uint8Array>({
      pull: async () => { await new Promise(resolve => setTimeout(resolve, 10)) },
      cancel() { cancelled = true },
    }))
    const reading = collect2(readSSE(response, { signal: controller.signal }))
    setTimeout(() => controller.abort(), 30)
    await expect(reading).resolves.toEqual([])
    expect(cancelled).toBe(true)
  })

  it('throws at once for a response without a body, and for a signal that is already aborted it yields nothing', async () => {
    await expect(collect(new Response(null))).rejects.toThrow(/no body/u)
    const controller = new AbortController()
    controller.abort()
    expect(await collect2(readSSE(chunked(['data: x\n\n']), { signal: controller.signal }))).toEqual([])
  })

  it('names a failed request instead of parsing its error page', async () => {
    await expect(collect(new Response('nope', { status: 500, statusText: 'Server Error' }))).rejects.toThrow(/500/u)
  })

  it('passes a read error through', async () => {
    const failing = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error('connection reset')) },
    }))
    await expect(collect(failing)).rejects.toThrow('connection reset')
  })
})

async function collect2(source: AsyncIterable<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const event of source) events.push(event)
  return events
}

describe('readSSE against streamSSE', () => {
  it('reads what the server wrote, from a POST, in order, with the names', async () => {
    const app = new Acryl().post('/chat', c => streamSSE(c, async stream => {
      await stream.writeSSE({ event: 'meta', data: JSON.stringify({ conversation: 1 }) })
      for (const piece of ['Hel', 'lo ', 'there\nline']) await stream.writeSSE({ event: 'token', data: JSON.stringify(piece) })
      await stream.writeSSE({ event: 'done', data: '{}' })
    }))
    const events = await collect(await app.request('/chat', { method: 'POST' }))
    expect(events.map(event => event.event)).toEqual(['meta', 'token', 'token', 'token', 'done'])
    expect(events.filter(event => event.event === 'token').map(event => JSON.parse(event.data) as string).join('')).toBe('Hello there\nline')
  })
})
