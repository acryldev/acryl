import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { SignInAttemptError } from 'acryl-control'
import { SignInRequestError, type SignInController } from '../src/controller.ts'
import { handleAnswerRequest, handleAttemptRequest, handleBeginRequest, handleCancelRequest, handleProvidersRequest } from '../src/route.ts'

const ORIGIN = 'http://127.0.0.1:43120'
const ATTEMPT = { id: 'a1', key: 'llm-pi-ai/anthropic', method: 'oauth', phase: 'running', notices: [] } as const

function controller(overrides: Partial<Record<keyof SignInController, unknown>> = {}): SignInController {
  return {
    providers: vi.fn(async () => ({ providers: [], signedIn: false })),
    attempt: vi.fn(async () => null),
    begin: vi.fn(async () => ATTEMPT),
    answer: vi.fn(() => ATTEMPT),
    cancel: vi.fn(() => ({ ...ATTEMPT, phase: 'cancelled' })),
    ...overrides,
  } as unknown as SignInController
}

function request(method: string, value?: unknown, overrides: { origin?: string; remoteAddress?: string } = {}): IncomingMessage {
  const body = value === undefined ? undefined : JSON.stringify(value)
  const req = Readable.from(body === undefined ? [] : [body]) as IncomingMessage
  req.method = method
  req.headers = {
    host: '127.0.0.1:43120',
    origin: overrides.origin ?? ORIGIN,
    'sec-fetch-site': 'same-origin',
    ...body === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
  }
  Object.defineProperty(req, 'socket', { configurable: true, value: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' } })
  return req
}

function response(): ServerResponse & { body: string } {
  const res = { body: '', statusCode: 200, setHeader: vi.fn(), end: vi.fn((body?: string) => { res.body = body ?? '' }) }
  return res as unknown as ServerResponse & typeof res
}

const json = (res: { body: string }): unknown => JSON.parse(res.body)

describe('sign-in routes', () => {
  it('serves providers and the current attempt to a same-origin GET', async () => {
    const providers = response()
    await handleProvidersRequest(request('GET'), providers, ORIGIN, controller())
    expect(providers.statusCode).toBe(200)
    expect(json(providers)).toEqual({ providers: [], signedIn: false })
    const attempt = response()
    await handleAttemptRequest(request('GET'), attempt, ORIGIN, controller())
    expect(json(attempt)).toEqual({ attempt: null })
  })

  it('refuses a foreign origin, a wrong method and a non-loopback peer', async () => {
    const foreign = response()
    await handleProvidersRequest(request('GET', undefined, { origin: 'http://evil.test' }), foreign, ORIGIN, controller())
    expect(foreign.statusCode).toBe(403)
    const wrongMethod = response()
    await handleBeginRequest(request('GET'), wrongMethod, ORIGIN, controller())
    expect(wrongMethod.statusCode).toBe(405)
    const remote = response()
    await handleBeginRequest(request('POST', { key: 'k' }, { remoteAddress: '10.0.0.5' }), remote, ORIGIN, controller())
    expect(remote.statusCode).toBe(403)
  })

  it('begins a sign-in with a provider key and an optional method', async () => {
    const c = controller()
    const res = response()
    await handleBeginRequest(request('POST', { key: 'llm-pi-ai/anthropic', method: 'oauth' }), res, ORIGIN, c)
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ attempt: ATTEMPT })
    expect(c.begin).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth', {})
    await handleBeginRequest(request('POST', { key: 'deepseek-account-platform/default', locale: 'zh-CN' }), response(), ORIGIN, c)
    expect(c.begin).toHaveBeenLastCalledWith('deepseek-account-platform/default', undefined, { locale: 'zh-CN' })
    const odd = response()
    await handleBeginRequest(request('POST', { key: 'k', locale: 'en US; drop' }), odd, ORIGIN, c)
    expect(odd.statusCode).toBe(400)
  })

  it('rejects malformed bodies without calling the controller', async () => {
    const c = controller()
    for (const [handler, body] of [
      [handleBeginRequest, {}], [handleBeginRequest, { key: 'k', extra: 1 }], [handleBeginRequest, { key: 'k', method: '' }],
      [handleAnswerRequest, { attemptId: 'a' }], [handleAnswerRequest, { attemptId: 'a', promptId: 'p', value: '' }],
      [handleCancelRequest, {}], [handleCancelRequest, { attemptId: 'a', x: 1 }],
    ] as const) {
      const res = response()
      await handler(request('POST', body), res, ORIGIN, c)
      expect(res.statusCode).toBe(400)
    }
    expect(c.begin).not.toHaveBeenCalled()
    expect(c.answer).not.toHaveBeenCalled()
    expect(c.cancel).not.toHaveBeenCalled()
  })

  it('hands an answer to the flow and never echoes it', async () => {
    const c = controller()
    const res = response()
    await handleAnswerRequest(request('POST', { attemptId: 'a1', promptId: 'p1', value: 'sk-secret' }), res, ORIGIN, c)
    expect(c.answer).toHaveBeenCalledWith('a1', 'p1', 'sk-secret')
    expect(res.body).not.toContain('sk-secret')
  })

  it('answers a stale question or an unknown provider with 409 and the reason', async () => {
    const stale = response()
    await handleAnswerRequest(request('POST', { attemptId: 'a1', promptId: 'old', value: 'x' }), stale, ORIGIN,
      controller({ answer: vi.fn(() => { throw new SignInAttemptError('unknown-prompt', 'That question is no longer being asked.') }) }))
    expect(stale.statusCode).toBe(409)
    expect(json(stale)).toEqual({ error: 'That question is no longer being asked.' })
    const unknown = response()
    await handleBeginRequest(request('POST', { key: 'nope' }), unknown, ORIGIN,
      controller({ begin: vi.fn(() => { throw new SignInRequestError('That provider cannot be signed into.') }) }))
    expect(unknown.statusCode).toBe(409)
  })

  it('reports an unexpected failure without leaking its message', async () => {
    const report = vi.fn()
    const res = response()
    await handleCancelRequest(request('POST', { attemptId: 'a1' }), res, ORIGIN,
      controller({ cancel: vi.fn(() => { throw new Error('boom with sk-secret inside') }) }), report)
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('sk-secret')
    expect(report).toHaveBeenCalledWith('cancel sign-in', expect.any(Error))
  })
})
