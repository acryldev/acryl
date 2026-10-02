import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { handleDesktopPreferencesRequest, type DesktopPreferencesStore } from '../../src/settings/desktop-preferences-route.ts'

const ORIGIN = 'http://127.0.0.1:43120'

function request(method: string, body?: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const text = body === undefined ? undefined : JSON.stringify(body)
  const req = Readable.from(text === undefined ? [] : [text]) as IncomingMessage
  req.method = method
  req.headers = {
    host: '127.0.0.1:43120',
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    ...(text === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) }),
    ...headers,
  }
  Object.defineProperty(req, 'socket', { configurable: true, value: { remoteAddress: '127.0.0.1' } })
  return req
}

function response(): ServerResponse & { body: string } {
  const res = {
    body: '',
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((body?: string) => { res.body = body ?? '' }),
  }
  return res as unknown as ServerResponse & { body: string }
}

function store(): DesktopPreferencesStore & { update: ReturnType<typeof vi.fn> } {
  const values: Record<string, unknown> = {
    'dsh-desktop': { mode: 'advanced', port: 3080 },
    'dsh-desktop-notifications': { enabled: true },
  }
  return {
    get: (namespace: string) => values[namespace],
    update: vi.fn(async (namespace: string, patch: Readonly<Record<string, unknown>>) => {
      if (patch.port === 'bad') throw new Error('schema refused')
      values[namespace] = { ...(values[namespace] as object), ...patch }
    }),
  }
}

describe('desktop preferences route', () => {
  it('reads the two allowed namespaces', async () => {
    const res = response()
    await handleDesktopPreferencesRequest(request('GET'), res, ORIGIN, store())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      'dsh-desktop': { mode: 'advanced', port: 3080 },
      'dsh-desktop-notifications': { enabled: true },
    })
  })

  it('applies a validated patch and answers the new values', async () => {
    const s = store()
    const res = response()
    await handleDesktopPreferencesRequest(request('POST', { namespace: 'dsh-desktop-notifications', patch: { enabled: false } }), res, ORIGIN, s)
    expect(res.statusCode).toBe(200)
    expect(s.update).toHaveBeenCalledWith('dsh-desktop-notifications', { enabled: false })
    expect(JSON.parse(res.body)['dsh-desktop-notifications']).toEqual({ enabled: false })
  })

  it.each([
    ['another namespace', { namespace: 'market', patch: { enabled: false } }],
    ['an empty patch', { namespace: 'dsh-desktop', patch: {} }],
    ['a nested value', { namespace: 'dsh-desktop', patch: { mode: { a: 1 } } }],
    ['an extra key', { namespace: 'dsh-desktop', patch: { mode: 'advanced' }, extra: 1 }],
  ])('refuses %s without touching the store', async (_label, body) => {
    const s = store()
    const res = response()
    await handleDesktopPreferencesRequest(request('POST', body), res, ORIGIN, s)
    expect(res.statusCode).toBe(400)
    expect(s.update).not.toHaveBeenCalled()
  })

  it('reports a schema refusal as 422 and reports the cause', async () => {
    const report = vi.fn()
    const res = response()
    await handleDesktopPreferencesRequest(request('POST', { namespace: 'dsh-desktop', patch: { port: 'bad' } }), res, ORIGIN, store(), report)
    expect(res.statusCode).toBe(422)
    expect(report).toHaveBeenCalledOnce()
  })

  it('refuses a cross-origin write and other methods', async () => {
    const cross = response()
    await handleDesktopPreferencesRequest(
      request('POST', { namespace: 'dsh-desktop', patch: { mode: 'advanced' } }, { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' }),
      cross, ORIGIN, store(),
    )
    expect(cross.statusCode).toBe(403)
    const put = response()
    await handleDesktopPreferencesRequest(request('PUT'), put, ORIGIN, store())
    expect(put.statusCode).toBe(405)
  })
})
