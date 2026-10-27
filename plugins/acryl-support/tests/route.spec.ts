import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticsArchive } from 'acryl-diagnostics'
import { SUPPORT_DIAGNOSTICS_PATH } from '../src/contract.ts'
import { supportRoutes } from '../src/route.ts'
import { ORIGIN, call } from './call.ts'

const archive: DiagnosticsArchive = { zip: Buffer.from('PK-zip-bytes'), fileName: 'acryl-diagnostics-2026.zip', includedLogFiles: 1, skippedLogFiles: 0 }
/** A download is a same-origin navigation: fetch metadata and a Referer, no Origin. */
const download = { origin: undefined, referer: `${ORIGIN}/settings` }

describe('diagnostics download route', () => {
  it('answers a same-origin GET with the zip as an attachment', async () => {
    const res = await call(supportRoutes(() => archive), SUPPORT_DIAGNOSTICS_PATH, { headers: download })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="acryl-diagnostics-2026.zip"')
    expect(res.headers.get('content-length')).toBe(String(archive.zip.byteLength))
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(archive.zip)
  })

  it('refuses a foreign origin or peer, and any method but GET, without building anything', async () => {
    const build = vi.fn(() => archive)
    const app = supportRoutes(build)
    for (const [options, status] of [
      [{ headers: { ...download, referer: 'http://evil.example/x' } }, 403],
      [{ headers: download, remoteAddress: '10.0.0.2' }, 403],
      [{ headers: { ...download, 'sec-fetch-site': 'cross-site' } }, 403],
      [{ method: 'POST' }, 405],
    ] as const) {
      expect((await call(app, SUPPORT_DIAGNOSTICS_PATH, options)).status).toBe(status)
    }
    expect(build).not.toHaveBeenCalled()
  })

  it('reports a build failure as a plain 500 without leaking the cause', async () => {
    const reported: unknown[] = []
    const app = supportRoutes(() => { throw new Error('/Users/secret/path exploded') }, (_op, cause) => { reported.push(cause) })
    const res = await call(app, SUPPORT_DIAGNOSTICS_PATH, { headers: download })
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('/Users/secret')
    expect(reported).toHaveLength(1)
  })

  it('cleans a file name so it cannot break out of the header', async () => {
    const res = await call(supportRoutes(() => ({ ...archive, fileName: 'a"; x=y\r\nSet-Cookie: 1.zip' })), SUPPORT_DIAGNOSTICS_PATH, { headers: download })
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="[A-Za-z0-9._-]+"$/)
  })
})
