// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuditApi } from '../../src/client/audit-api.ts'
import { AuditSection } from '../../src/client/AuditSection.tsx'
import { en } from '../../src/client/locales.ts'
import { AuditLog } from 'acryl-door/host'
import type { AuditEntry } from 'acryl-door/protocol'
import { auditRoutes, UI_CONTROL_AUDIT_PATH } from '../../src/host/audit-route.ts'
import { privateApi } from '../../src/host/http.ts'

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
  const log = { recent: () => [entry({})] } as unknown as AuditLog
  const api = privateApi(auditRoutes(log))
  /** One request as the Host's adapter hands it over: the peer and the local port from the socket, the rest from the request. */
  const call = (method: string, headers: Record<string, string>, remoteAddress = '127.0.0.1') =>
    Promise.resolve(api.fetch(new Request(`${ORIGIN}${UI_CONTROL_AUDIT_PATH}`, { method, headers: { host: '127.0.0.1:43120', ...headers } }), { connection: { remoteAddress, localPort: 43120 } }))
  const page = { 'sec-fetch-site': 'same-origin', referer: `${ORIGIN}/` }

  it('serves the recent entries to the same-origin page only', async () => {
    const ok = await call('GET', page)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ entries: [entry({})] })
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect((await call('GET', { 'sec-fetch-site': 'cross-site', referer: 'http://evil.example/' })).status).toBe(403)
    expect((await call('GET', {})).status).toBe(403)
    expect((await call('GET', page, '10.0.0.2')).status).toBe(403)
    const post = await call('POST', page)
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET, HEAD')
  })

  it('the client keeps only well-formed entries and reports a failed load', async () => {
    const good = entry({})
    const ok = createAuditApi(async () => new Response(JSON.stringify({ entries: [good, { junk: true }, 5] }), { status: 200 }))
    expect(await ok.recent()).toEqual([good])
    await expect(createAuditApi(async () => new Response('x', { status: 500 })).recent()).rejects.toThrow('HTTP 500')
    await expect(createAuditApi(async () => new Response('{}', { status: 200 })).recent()).rejects.toThrow('not understood')
  })
})
