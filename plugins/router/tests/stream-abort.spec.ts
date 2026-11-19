/**
 * Two ways to notice that a client left a stream, and where they differ (spec 047 T023). Under `app.request` (in-process, no socket) aborting
 * the request fires `c.req.raw.signal` but does not touch the response body, so `stream.aborted` and `stream.onAbort` stay quiet until
 * the body is cancelled. That is how the upstream behaves at the pinned commit (`StreamingApi` marks itself aborted only when its response
 * readable is cancelled, which a socket adapter does when the connection closes), so it is documented, not changed. A handler that must
 * stop on either listens to the request signal as well.
 */

import { describe, expect, it } from 'vitest'
import { streamSSE } from '../src/core/helper/streaming/index.ts'
import { Acryl } from '../src/index.ts'

interface Seen { aborted: boolean, onAbort: boolean, signalAborted: boolean }

function app(): { app: Acryl, ready: Promise<{ seen: Seen, finish: () => void }> } {
  let ready!: (value: { seen: Seen, finish: () => void }) => void
  const promise = new Promise<{ seen: Seen, finish: () => void }>(resolve => { ready = resolve })
  const instance = new Acryl().get('/events', c => streamSSE(c, async stream => {
    const seen: Seen = { aborted: false, onAbort: false, signalAborted: false }
    stream.onAbort(() => { seen.onAbort = true })
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    ready({ seen: new Proxy(seen, { get: (target, key: keyof Seen) => key === 'aborted' ? stream.aborted : key === 'signalAborted' ? c.req.raw.signal.aborted : target[key] }), finish })
    await stream.writeSSE({ data: 'hello' })
    await finished
  }))
  return { app: instance, ready: promise }
}

describe('leaving a stream under app.request', () => {
  it('aborting the request fires the request signal but not stream.aborted or stream.onAbort', async () => {
    const { app: instance, ready } = app()
    const client = new AbortController()
    const response = await instance.request('/events', { signal: client.signal })
    const { seen, finish } = await ready
    await response.body!.getReader().read()
    client.abort()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(seen.signalAborted).toBe(true)
    expect(seen.aborted).toBe(false)
    expect(seen.onAbort).toBe(false)
    finish()
  })

  it('cancelling the response body sets stream.aborted and fires stream.onAbort, which is what a socket adapter does when the connection closes', async () => {
    const { app: instance, ready } = app()
    const response = await instance.request('/events')
    const { seen, finish } = await ready
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(seen.aborted).toBe(true)
    expect(seen.onAbort).toBe(true)
    expect(seen.signalAborted).toBe(false)
    finish()
  })
})
