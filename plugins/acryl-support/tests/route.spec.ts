import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticsArchive } from 'acryl-diagnostics'
import { createDiagnosticsRequestHandler } from '../src/route.ts'

const ORIGIN = 'http://127.0.0.1:43120'
const archive: DiagnosticsArchive = { zip: Buffer.from('PK-zip-bytes'), fileName: 'acryl-diagnostics-2026.zip', includedLogFiles: 1, skippedLogFiles: 0 }

function request(method: string, headers: Record<string, string> = {}, remoteAddress = '127.0.0.1'): IncomingMessage {
  const req = Readable.from([]) as IncomingMessage
  req.method = method
  req.headers = { host: '127.0.0.1:43120', 'sec-fetch-site': 'same-origin', referer: `${ORIGIN}/settings`, ...headers }
  Object.defineProperty(req, 'socket', { configurable: true, value: { remoteAddress } })
  return req
}

function response() {
  const headers: Record<string, string> = {}
  const res = { statusCode: 0, body: undefined as unknown, setHeader: vi.fn((name: string, value: string) => { headers[name.toLowerCase()] = value }), end: vi.fn((body?: unknown) => { res.body = body }) }
  return { res: res as unknown as ServerResponse, raw: res, headers }
}

describe('diagnostics download route', () => {
  it('answers a same-origin GET with the zip as an attachment', async () => {
    const handle = createDiagnosticsRequestHandler(() => archive)
    const { res, raw, headers } = response()
    await handle(request('GET'), res, ORIGIN, () => {})
    expect(raw.statusCode).toBe(200)
    expect(headers['content-type']).toBe('application/zip')
    expect(headers['content-disposition']).toBe('attachment; filename="acryl-diagnostics-2026.zip"')
    expect(headers['content-length']).toBe(String(archive.zip.byteLength))
    expect(headers['cache-control']).toBe('no-store')
    expect(raw.body).toBe(archive.zip)
  })

  it('refuses a foreign origin or peer, and any method but GET, without building anything', async () => {
    const build = vi.fn(() => archive)
    const handle = createDiagnosticsRequestHandler(build)
    for (const [req, status] of [
      [request('GET', { referer: 'http://evil.example/x' }), 403],
      [request('GET', {}, '10.0.0.2'), 403],
      [request('GET', { 'sec-fetch-site': 'cross-site' }), 403],
      [request('POST', { origin: ORIGIN }), 405],
    ] as const) {
      const { res, raw } = response()
      await handle(req, res, ORIGIN, () => {})
      expect(raw.statusCode).toBe(status)
    }
    expect(build).not.toHaveBeenCalled()
  })

  it('reports a build failure as a plain 500 without leaking the cause', async () => {
    const reported: unknown[] = []
    const handle = createDiagnosticsRequestHandler(() => { throw new Error('/Users/secret/path exploded') })
    const { res, raw } = response()
    await handle(request('GET'), res, ORIGIN, (_op, cause) => { reported.push(cause) })
    expect(raw.statusCode).toBe(500)
    expect(String(raw.body)).not.toContain('/Users/secret')
    expect(reported).toHaveLength(1)
  })

  it('cleans a file name so it cannot break out of the header', async () => {
    const handle = createDiagnosticsRequestHandler(() => ({ ...archive, fileName: 'a"; x=y\r\nSet-Cookie: 1.zip' }))
    const { res, headers } = response()
    await handle(request('GET'), res, ORIGIN, () => {})
    expect(headers['content-disposition']).toMatch(/^attachment; filename="[A-Za-z0-9._-]+"$/)
  })
})
