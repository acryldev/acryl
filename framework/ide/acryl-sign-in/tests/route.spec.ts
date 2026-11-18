import { describe, expect, it, vi } from 'vitest'
import { SignInAttemptError } from 'acryl-control'
import { SignInRequestError, type SignInController } from '../src/controller.ts'
import { SIGN_IN_ANSWER_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_CANCEL_PATH, SIGN_IN_PROVIDERS_PATH } from '../src/contract.ts'
import { signInRoutes } from '../src/route.ts'

const PORT = 43120
const ORIGIN = `http://127.0.0.1:${String(PORT)}`
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

interface CallOptions {
  readonly method?: string
  /** Replaces a default header; `undefined` removes it. */
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly body?: string
  readonly remoteAddress?: string
}

/** The routes called as the Host's Web adapter calls them: the page's own request by default, with the socket's peer and local port. */
async function call(routes: SignInController | ReturnType<typeof signInRoutes>, path: string, options: CallOptions = {}): Promise<Response> {
  const app = 'fetch' in routes ? routes : signInRoutes(routes)
  const headers = new Headers()
  for (const [key, value] of Object.entries({ host: `127.0.0.1:${String(PORT)}`, origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...options.headers })) {
    if (value !== undefined) headers.set(key, value)
  }
  const request = new Request(`${ORIGIN}${path}`, { method: options.method ?? 'GET', headers, ...(options.body === undefined ? {} : { body: options.body }) })
  return await app.fetch(request, { connection: { remoteAddress: options.remoteAddress ?? '127.0.0.1', localPort: PORT } })
}

function post(routes: SignInController | ReturnType<typeof signInRoutes>, path: string, value: unknown, options: CallOptions = {}): Promise<Response> {
  return call(routes, path, { ...options, method: 'POST', body: JSON.stringify(value), headers: { 'content-type': 'application/json', ...options.headers } })
}

describe('sign-in routes', () => {
  it('serves providers and the current attempt to a same-origin GET', async () => {
    const providers = await call(controller(), SIGN_IN_PROVIDERS_PATH)
    expect(providers.status).toBe(200)
    expect(await providers.json()).toEqual({ providers: [], signedIn: false })
    expect(providers.headers.get('cache-control')).toBe('no-store')
    expect(await (await call(controller(), SIGN_IN_ATTEMPT_PATH)).json()).toEqual({ attempt: null })
    // A browser may leave Origin off a same-origin read; its fetch metadata and Referer then stand for it.
    const noOrigin = await call(controller(), SIGN_IN_ATTEMPT_PATH, { headers: { origin: undefined, referer: `${ORIGIN}/` } })
    expect(noOrigin.status).toBe(200)
  })

  it('refuses a foreign origin, a wrong method, a non-loopback peer and a change without the exact Origin', async () => {
    const c = controller()
    expect((await call(c, SIGN_IN_PROVIDERS_PATH, { headers: { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    const wrongMethod = await call(c, SIGN_IN_BEGIN_PATH)
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
    const getOnly = await call(c, SIGN_IN_PROVIDERS_PATH, { method: 'POST' })
    expect(getOnly.status).toBe(405)
    expect(getOnly.headers.get('allow')).toBe('GET, HEAD')
    expect((await post(c, SIGN_IN_BEGIN_PATH, { key: 'k' }, { remoteAddress: '10.0.0.5' })).status).toBe(403)
    expect((await post(c, SIGN_IN_BEGIN_PATH, { key: 'k' }, { headers: { origin: undefined, referer: `${ORIGIN}/` } })).status).toBe(403)
    expect((await post(c, SIGN_IN_BEGIN_PATH, { key: 'k' }, { headers: { host: 'evil.test' } })).status).toBe(403)
    expect(c.begin).not.toHaveBeenCalled()
    expect(c.providers).not.toHaveBeenCalled()
  })

  it('begins a sign-in with a provider key and an optional method', async () => {
    const c = controller()
    const res = await post(c, SIGN_IN_BEGIN_PATH, { key: 'llm-pi-ai/anthropic', method: 'oauth' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ attempt: ATTEMPT })
    expect(c.begin).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth', {})
    await post(c, SIGN_IN_BEGIN_PATH, { key: 'deepseek-account-platform/default', locale: 'zh-CN' })
    expect(c.begin).toHaveBeenLastCalledWith('deepseek-account-platform/default', undefined, { locale: 'zh-CN' })
    expect((await post(c, SIGN_IN_BEGIN_PATH, { key: 'k', locale: 'en US; drop' })).status).toBe(400)
  })

  it('rejects malformed bodies without calling the controller', async () => {
    const c = controller()
    for (const [path, body] of [
      [SIGN_IN_BEGIN_PATH, {}], [SIGN_IN_BEGIN_PATH, { key: 'k', extra: 1 }], [SIGN_IN_BEGIN_PATH, { key: 'k', method: '' }],
      [SIGN_IN_ANSWER_PATH, { attemptId: 'a' }], [SIGN_IN_ANSWER_PATH, { attemptId: 'a', promptId: 'p', value: '' }],
      [SIGN_IN_CANCEL_PATH, {}], [SIGN_IN_CANCEL_PATH, { attemptId: 'a', x: 1 }],
    ] as const) {
      expect((await post(c, path, body)).status).toBe(400)
    }
    expect(await (await call(c, SIGN_IN_CANCEL_PATH, { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } })).json())
      .toEqual({ error: 'invalid JSON request' })
    expect((await call(c, SIGN_IN_CANCEL_PATH, { method: 'POST', body: '{"attemptId":"a1"}', headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    const tooLarge = await post(c, SIGN_IN_ANSWER_PATH, { attemptId: 'a1', promptId: 'p1', value: 'x'.repeat(17 * 1024) })
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.json()).toEqual({ error: 'request body is too large' })
    expect(c.begin).not.toHaveBeenCalled()
    expect(c.answer).not.toHaveBeenCalled()
    expect(c.cancel).not.toHaveBeenCalled()
  })

  it('hands an answer to the flow and never echoes it', async () => {
    const c = controller()
    const res = await post(c, SIGN_IN_ANSWER_PATH, { attemptId: 'a1', promptId: 'p1', value: 'sk-secret' })
    expect(c.answer).toHaveBeenCalledWith('a1', 'p1', 'sk-secret')
    expect(await res.text()).not.toContain('sk-secret')
  })

  it('answers a stale question or an unknown provider with 409 and the reason', async () => {
    const stale = await post(controller({ answer: vi.fn(() => { throw new SignInAttemptError('unknown-prompt', 'That question is no longer being asked.') }) }),
      SIGN_IN_ANSWER_PATH, { attemptId: 'a1', promptId: 'old', value: 'x' })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ error: 'That question is no longer being asked.' })
    const unknown = await post(controller({ begin: vi.fn(() => { throw new SignInRequestError('That provider cannot be signed into.') }) }),
      SIGN_IN_BEGIN_PATH, { key: 'nope' })
    expect(unknown.status).toBe(409)
  })

  it('reports an unexpected failure without leaking its message', async () => {
    const report = vi.fn()
    const routes = signInRoutes(controller({ cancel: vi.fn(() => { throw new Error('boom with sk-secret inside') }) }), report)
    const res = await post(routes, SIGN_IN_CANCEL_PATH, { attemptId: 'a1' })
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('sk-secret')
    expect(report).toHaveBeenCalledWith('cancel sign-in', expect.any(Error))
    const reads = signInRoutes(controller({ providers: vi.fn(async () => { throw new Error('private') }) }), report)
    const failed = await call(reads, SIGN_IN_PROVIDERS_PATH)
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'sign-in unavailable' })
    expect(report).toHaveBeenCalledWith('list sign-in providers', expect.any(Error))
  })
})
