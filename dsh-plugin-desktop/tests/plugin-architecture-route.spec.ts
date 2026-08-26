import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { CordisPlaneSnapshot } from '../src/plugin-architecture-contract.ts'
import {
  handlePluginArchitectureSnapshotRequest,
  type PluginArchitectureRouteController,
} from '../src/plugin-architecture-route.ts'

const ORIGIN = 'http://127.0.0.1:43120'
const SNAPSHOT: CordisPlaneSnapshot = { plane: 'host', fibers: [], services: [] }

function request(method: string, origin = ORIGIN): IncomingMessage {
  const req = Readable.from([]) as IncomingMessage
  req.method = method
  req.headers = { host: '127.0.0.1:43120', origin, 'sec-fetch-site': 'same-origin' }
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
  return res as unknown as ServerResponse & typeof res
}

describe('Cordis architecture private route', () => {
  it('serves only same-origin loopback GET requests', async () => {
    const controller: PluginArchitectureRouteController = { snapshot: () => SNAPSHOT }
    const ok = response()
    await handlePluginArchitectureSnapshotRequest(request('GET'), ok, ORIGIN, controller)
    expect(ok.statusCode).toBe(200)
    expect(JSON.parse(ok.body)).toEqual(SNAPSHOT)

    const foreign = response()
    await handlePluginArchitectureSnapshotRequest(
      request('GET', 'http://evil.example'), foreign, ORIGIN, controller,
    )
    expect(foreign.statusCode).toBe(403)

    const method = response()
    await handlePluginArchitectureSnapshotRequest(request('POST'), method, ORIGIN, controller)
    expect(method.statusCode).toBe(405)
  })

  it('contains projection failures and reports them to the Host logger', async () => {
    const report = vi.fn()
    const controller: PluginArchitectureRouteController = {
      snapshot: () => { throw new Error('/private/path') },
    }
    const res = response()
    await handlePluginArchitectureSnapshotRequest(request('GET'), res, ORIGIN, controller, report)
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('/private/path')
    expect(report).toHaveBeenCalledWith('read Cordis architecture', expect.any(Error))
  })
})
