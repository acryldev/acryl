// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuditApi } from '../../src/client/audit-api.ts'
import { AuditSection } from '../../src/client/AuditSection.tsx'
import { en } from '../../src/client/locales.ts'
import type { AuditEntry } from '../../src/contract.ts'
import { AuditLog } from '../../src/host/audit.ts'
import { createAuditRequestHandler } from '../../src/host/audit-route.ts'

afterEach(cleanup)
const t = (key: keyof typeof en): string => en[key]
const entry = (over: Partial<AuditEntry>): AuditEntry => ({ at: '2026-09-27T10:00:00.000Z', tool: 'ui_click', outcome: 'ok', approval: 'asked', ...over })
const section = (api: ReturnType<typeof createAuditApi>) => ({ api, t }) as unknown as Parameters<typeof AuditSection>[0]

describe('audit viewer', () => {
  it('lists the newest first with the control touched and how each call ended', async () => {
    const api = { recent: vi.fn(async () => [entry({ tool: 'ui_snapshot', approval: 'not-needed' }), entry({ target: { role: 'button', name: 'Add project' } }), entry({ outcome: 'refused', detail: 'protected' })]) }
    render(<AuditSection {...section(api)} />)
    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]!.textContent).toContain('refused (protected)')
    expect(rows[2]!.textContent).toContain('button "Add project"')
    expect(rows[3]!.textContent).toContain('snapshot')
  })

  it('says when there is nothing yet, or why it could not load, and can be refreshed', async () => {
    const recent = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('The activity list could not be loaded (HTTP 500).'))
    render(<AuditSection {...section({ recent })} />)
    expect(await screen.findByText('Nothing yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 500')
    await waitFor(() => { expect(recent).toHaveBeenCalledTimes(2) })
  })
})

describe('audit route and client', () => {
  const ORIGIN = 'http://127.0.0.1:43120'
  const request = (method: string, headers: Record<string, string>, remote = '127.0.0.1'): IncomingMessage => {
    const req = Readable.from([]) as IncomingMessage
    req.method = method
    req.headers = { host: '127.0.0.1:43120', ...headers }
    Object.defineProperty(req, 'socket', { configurable: true, value: { remoteAddress: remote } })
    return req
  }
  const response = () => { const r = { statusCode: 0, body: '', setHeader: vi.fn(), end: vi.fn((b?: string) => { r.body = b ?? '' }) }; return r }

  it('serves the recent entries to the same-origin page only', () => {
    const log = { recent: () => [entry({})] } as unknown as AuditLog
    const handle = createAuditRequestHandler(log)
    const ok = response()
    handle(request('GET', { 'sec-fetch-site': 'same-origin', referer: `${ORIGIN}/` }), ok as unknown as ServerResponse, ORIGIN)
    expect(ok.statusCode).toBe(200)
    expect(JSON.parse(ok.body)).toEqual({ entries: [entry({})] })
    for (const [req, status] of [[request('GET', { 'sec-fetch-site': 'cross-site', referer: 'http://evil.example/' }), 403], [request('POST', {}), 405], [request('GET', { 'sec-fetch-site': 'same-origin', referer: `${ORIGIN}/` }, '10.0.0.2'), 403]] as const) {
      const r = response()
      handle(req, r as unknown as ServerResponse, ORIGIN)
      expect(r.statusCode).toBe(status)
    }
  })

  it('the client keeps only well-formed entries and reports a failed load', async () => {
    const good = entry({})
    const ok = createAuditApi(async () => new Response(JSON.stringify({ entries: [good, { junk: true }, 5] }), { status: 200 }))
    expect(await ok.recent()).toEqual([good])
    await expect(createAuditApi(async () => new Response('x', { status: 500 })).recent()).rejects.toThrow('HTTP 500')
    await expect(createAuditApi(async () => new Response('{}', { status: 200 })).recent()).rejects.toThrow('not understood')
  })
})
