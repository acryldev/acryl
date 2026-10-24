import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadWorkspaceCapabilities } from '../../src/client/capabilities/capabilities-api.ts'
import { parseWorkspaceCapabilities, WORKSPACE_CAPABILITIES_PATH } from '../../src/capabilities/contract.ts'
import { capabilityRoutes } from '../../src/capabilities/route.ts'
import { serveApi, type ServedApi } from '../serve-api.ts'

describe('capabilities contract', () => {
  it('accepts exactly a boolean chat flag', () => {
    expect(parseWorkspaceCapabilities({ chat: false })).toEqual({ chat: false })
    expect(() => parseWorkspaceCapabilities({ chat: 'no' })).toThrow()
    expect(() => parseWorkspaceCapabilities(null)).toThrow()
    expect(() => parseWorkspaceCapabilities([])).toThrow()
  })
})

describe('capabilities client', () => {
  const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status })

  it('reads what the Host says', async () => {
    expect(await loadWorkspaceCapabilities(answer(200, { chat: false }))).toEqual({ chat: false })
  })

  it('assumes everything when the Host cannot say: an older Host, a refusal, a broken body or a network failure', async () => {
    expect(await loadWorkspaceCapabilities(answer(404, { error: 'not found' }))).toEqual({ chat: true })
    expect(await loadWorkspaceCapabilities(answer(200, { chat: 'maybe' }))).toEqual({ chat: true })
    expect(await loadWorkspaceCapabilities(async () => { throw new Error('offline') })).toEqual({ chat: true })
  })
})

describe('capabilities route', () => {
  let api: ServedApi
  let origin = ''
  let port = 0
  const state = { chat: true }

  beforeAll(async () => {
    api = await serveApi(capabilityRoutes(() => ({ chat: state.chat })))
    ;({ origin, port } = api)
  })
  afterAll(async () => { await api.close() })

  function call(method: string, sameOrigin: boolean): Promise<{ status: number, json: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = sameOrigin ? { origin, 'sec-fetch-site': 'same-origin' } : {}
      const req = request({ host: '127.0.0.1', port, path: WORKSPACE_CAPABILITIES_PATH, method, headers }, (res) => {
        let out = ''
        res.on('data', (chunk: Buffer) => { out += chunk.toString('utf8') })
        res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('answers a same-origin GET with the composition as it is now, and refuses everything else', async () => {
    expect(await call('GET', true)).toEqual({ status: 200, json: { chat: true } })
    state.chat = false
    expect(await call('GET', true)).toEqual({ status: 200, json: { chat: false } })
    expect((await call('GET', false)).status).toBe(403)
    expect((await call('POST', true)).status).toBe(405)
  })
})
