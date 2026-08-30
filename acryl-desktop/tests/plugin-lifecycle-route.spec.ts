import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { PluginLifecycleReceipt, PluginLifecycleSnapshot } from '../src/plugin-lifecycle-contract.ts'
import { PluginLifecycleError } from '../src/plugin-lifecycle-controller.ts'
import {
  handlePluginLifecycleDisableRequest,
  handlePluginLifecycleEnableRequest,
  handlePluginLifecycleReloadRequest,
  handlePluginLifecycleSnapshotRequest,
  type PluginLifecycleRouteController,
} from '../src/plugin-lifecycle-route.ts'

const ORIGIN = 'http://127.0.0.1:43120'
const SNAPSHOT: PluginLifecycleSnapshot = { entries: [] }
const RECEIPT: PluginLifecycleReceipt = {
  accepted: true,
  action: 'reload',
  entryIds: ['include:desktop-development-canvas'],
  rendererReloadRequired: true,
  snapshot: SNAPSHOT,
}

function controller(): PluginLifecycleRouteController & {
  snapshot: ReturnType<typeof vi.fn>
  setEnabled: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
} {
  return {
    snapshot: vi.fn(() => SNAPSHOT),
    setEnabled: vi.fn(async (_entryId: string, enabled: boolean) => ({
      ...RECEIPT,
      action: enabled ? 'enable' as const : 'disable' as const,
    })),
    reload: vi.fn(async () => RECEIPT),
  }
}

function request(
  method: string,
  value?: unknown,
  overrides: { origin?: string; remoteAddress?: string; contentType?: string } = {},
): IncomingMessage {
  const body = value === undefined ? undefined : JSON.stringify(value)
  const req = Readable.from(body === undefined ? [] : [body]) as IncomingMessage
  req.method = method
  req.headers = {
    host: '127.0.0.1:43120',
    origin: overrides.origin ?? ORIGIN,
    'sec-fetch-site': 'same-origin',
    ...(body === undefined ? {} : {
      'content-type': overrides.contentType ?? 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    }),
  }
  Object.defineProperty(req, 'socket', {
    configurable: true,
    value: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
  })
  return req
}

function response(): ServerResponse & { body: string } {
  const res = {
    body: '',
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((body?: string) => { res.body = body ?? '' }),
  }
  return res as unknown as ServerResponse & typeof res
}

describe('plugin lifecycle private routes', () => {
  it('serves the snapshot only to same-origin loopback GET', async () => {
    const control = controller()
    const ok = response()
    await handlePluginLifecycleSnapshotRequest(request('GET'), ok, ORIGIN, control)
    expect(ok.statusCode).toBe(200)
    expect(JSON.parse(ok.body)).toEqual(SNAPSHOT)

    const forbidden = response()
    await handlePluginLifecycleSnapshotRequest(
      request('GET', undefined, { origin: 'http://evil.example' }),
      forbidden,
      ORIGIN,
      control,
    )
    expect(forbidden.statusCode).toBe(403)
  })

  it.each([
    ['enable', handlePluginLifecycleEnableRequest, true],
    ['disable', handlePluginLifecycleDisableRequest, false],
  ] as const)('validates and dispatches %s', async (_name, handler, enabled) => {
    const control = controller()
    const res = response()
    await handler(
      request('POST', { entryId: 'include:desktop-development-canvas' }),
      res,
      ORIGIN,
      control,
    )
    expect(res.statusCode).toBe(200)
    expect(control.setEnabled).toHaveBeenCalledWith('include:desktop-development-canvas', enabled)
  })

  it('accepts reload-all and exact-entry reload requests', async () => {
    const control = controller()
    const all = response()
    await handlePluginLifecycleReloadRequest(request('POST', {}), all, ORIGIN, control)
    expect(control.reload).toHaveBeenNthCalledWith(1, undefined)

    const one = response()
    await handlePluginLifecycleReloadRequest(
      request('POST', { entryId: 'include:desktop-development-canvas' }),
      one,
      ORIGIN,
      control,
    )
    expect(control.reload).toHaveBeenNthCalledWith(2, 'include:desktop-development-canvas')
  })

  it.each([
    ['enable', handlePluginLifecycleEnableRequest, { entryId: 'include:desktop-development-canvas' }],
    ['disable', handlePluginLifecycleDisableRequest, { entryId: 'include:desktop-development-canvas' }],
    ['reload', handlePluginLifecycleReloadRequest, { entryId: 'include:desktop-development-canvas' }],
  ] as const)('responds before requesting a Desktop generation restart after %s', async (_name, handler, body) => {
    const control = controller()
    const res = response()
    const requestRestart = vi.fn(() => {
      expect(res.end).toHaveBeenCalledOnce()
    })

    await handler(request('POST', body), res, ORIGIN, control, () => {}, requestRestart)

    expect(res.statusCode).toBe(200)
    expect(requestRestart).toHaveBeenCalledOnce()
  })

  it('rejects malformed, foreign, and unsupported requests before dispatch', async () => {
    const control = controller()
    const malformed = response()
    await handlePluginLifecycleEnableRequest(request('POST', { entryId: '', extra: true }), malformed, ORIGIN, control)
    expect(malformed.statusCode).toBe(400)

    const foreign = response()
    await handlePluginLifecycleReloadRequest(
      request('POST', {}, { remoteAddress: '10.0.0.2' }),
      foreign,
      ORIGIN,
      control,
    )
    expect(foreign.statusCode).toBe(403)

    const method = response()
    await handlePluginLifecycleReloadRequest(request('GET'), method, ORIGIN, control)
    expect(method.statusCode).toBe(405)
    expect(control.reload).not.toHaveBeenCalled()
  })

  it('maps controller rejection to a conflict without leaking a raw cause', async () => {
    const control = controller()
    control.reload.mockRejectedValueOnce(new PluginLifecycleError(
      'protected-entry',
      'private failure at /Users/example/secret',
    ))
    const res = response()
    const requestRestart = vi.fn()
    await handlePluginLifecycleReloadRequest(request('POST', {}), res, ORIGIN, control, () => {}, requestRestart)
    expect(res.statusCode).toBe(409)
    expect(requestRestart).not.toHaveBeenCalled()
    expect(JSON.parse(res.body)).toEqual({ error: 'The selected plugin is protected.' })
    expect(res.body).not.toContain('/Users/example')
  })
})
