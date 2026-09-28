// A real http.Server on the loopback interface (spec 041 TB30): proves the auth gate against a real socket,
// not a faked one - the same convention `plugins/acryl-workspace/tests/agents/route.spec.ts` already uses.
import { createServer, request, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UiControlError, type UiRequest, type UiResult } from '../../src/contract.ts'
import { handleOnlineCallRequest, ONLINE_CALL_PATH } from '../../src/host/online-route.ts'

const SECRET = 'the-real-secret'
const calls: UiRequest[] = []
let nextResult: UiResult | UiControlError = { generation: 1, title: 'ACRYL', nodes: [], total: 0 }

const run = async (request: UiRequest): Promise<UiResult> => {
  calls.push(request)
  if (nextResult instanceof UiControlError) throw nextResult
  return nextResult
}

let server: Server
let port = 0
const errors: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleOnlineCallRequest(req, res, SECRET, run, (op, cause) => { errors.push(`${op}: ${String(cause)}`) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

function call(body: unknown, options: { method?: string; token?: string } = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const text = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string | number> = {}
  if (text !== undefined) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(text) }
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: ONLINE_CALL_PATH, method: options.method ?? 'POST', headers }, (res) => {
      let out = ''
      res.on('data', (c: Buffer) => { out += c.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
    })
    req.on('error', reject)
    req.end(text)
  })
}

describe('the online channel route (TB30)', () => {
  it('refuses a missing, wrong, or malformed token, and a non-POST method, before ever running anything', async () => {
    calls.length = 0
    expect((await call({ op: 'snapshot' })).status).toBe(403)
    expect((await call({ op: 'snapshot' }, { token: 'nope' })).status).toBe(403)
    expect((await call({ op: 'snapshot' }, { token: `${SECRET}x` })).status).toBe(403)
    expect((await call(undefined, { method: 'GET', token: SECRET })).status).toBe(405)
    expect(calls).toEqual([])
  })

  it('runs a valid request with the right token and returns its result', async () => {
    calls.length = 0
    nextResult = { generation: 5, title: 'ACRYL', nodes: [{ ref: '5.1', role: 'button', name: 'Send', depth: 0, states: [] }], total: 1 }
    const { status, json } = await call({ op: 'snapshot', maxNodes: 10 }, { token: SECRET })
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, result: { total: 1 } })
    expect(calls).toEqual([{ op: 'snapshot', maxNodes: 10 }])
  })

  it('maps a UiControlError to a structured, still-200 refusal, not a server error', async () => {
    nextResult = new UiControlError('no-window', 'no ACRYL window is open to control')
    const { status, json } = await call({ op: 'click', ref: '1.1' }, { token: SECRET })
    expect(status).toBe(200)
    expect(json).toEqual({ ok: false, code: 'no-window', message: 'no ACRYL window is open to control' })
  })

  it('refuses a malformed request body without ever calling run', async () => {
    calls.length = 0
    const { status, json } = await call({ op: 'click' }, { token: SECRET }) // missing ref
    expect(status).toBe(400)
    expect(json.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('refuses invalid JSON with a plain 400, not a crash', async () => {
    const response = await new Promise<{ status: number }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: ONLINE_CALL_PATH, method: 'POST', headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json', 'content-length': 9 } }, (res) => {
        res.resume()
        res.on('end', () => { resolve({ status: res.statusCode ?? 0 }) })
      })
      req.on('error', reject)
      req.end('{not json')
    })
    expect(response.status).toBe(400)
  })
})
