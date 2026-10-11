import { describe, expect, it, vi } from 'vitest'
import type { AuthorizationBeginRequest, AuthorizationOutcome } from 'acryl-control'
import { SignInController, SignInRequestError, type SignInPorts } from '../src/controller.ts'
import type { DeepSeekAccountPort, DeepSeekAccountView } from '../src/deepseek-account.ts'

const tick = () => new Promise<void>(resolve => { setTimeout(resolve, 0) })

function build(configured: Record<string, boolean> = {}, extra: Partial<SignInPorts> = {}) {
  let ids = 0
  const requests: AuthorizationBeginRequest[] = []
  let finish: (outcome: AuthorizationOutcome) => void = () => {}
  const controller = new SignInController({
    newId: () => `id-${String(++ids)}`,
    authorization: {
      list: () => [
        { key: 'llm-pi-ai/anthropic', label: 'Anthropic', methods: [{ id: 'oauth', label: 'Sign in with Claude' }, { id: 'api-key', label: 'API key' }] },
        { key: 'llm-pi-ai/openai-codex', label: 'ChatGPT (Codex)', methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }] },
        { key: 'deepseek-account-platform/default', label: 'DeepSeek', methods: [{ id: 'browser', label: 'DeepSeek' }] },
      ],
      begin: request => {
        requests.push(request)
        return new Promise<AuthorizationOutcome>(resolve => { finish = resolve })
      },
    },
    credentials: { describeRecord: async key => ({ configured: configured[key] === true }) },
    ...extra,
  })
  return { controller, requests, finish: (outcome: AuthorizationOutcome) => { finish(outcome) } }
}

describe('SignInController', () => {
  it('lists the providers with their methods and whether each is signed in', async () => {
    const { controller } = build({ 'llm-pi-ai/anthropic': true })
    const listed = await controller.providers()
    expect(listed.signedIn).toBe(true)
    expect(listed.providers).toEqual([
      { key: 'llm-pi-ai/anthropic', label: 'Anthropic', methods: [{ id: 'oauth', label: 'Sign in with Claude' }, { id: 'api-key', label: 'API key' }], configured: true },
      { key: 'llm-pi-ai/openai-codex', label: 'ChatGPT (Codex)', methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }], configured: false },
    ])
  })

  it('reports nothing signed in when no provider has a credential', async () => {
    expect((await build().controller.providers()).signedIn).toBe(false)
  })

  it('has no attempt before one starts, then runs the named provider and method', async () => {
    const { controller, requests } = build()
    expect(await controller.attempt()).toBeNull()
    const view = await controller.begin('llm-pi-ai/anthropic', 'api-key')
    expect(view).toMatchObject({ key: 'llm-pi-ai/anthropic', method: 'api-key', phase: 'running' })
    expect(requests[0]).toMatchObject({ key: 'llm-pi-ai/anthropic', method: 'api-key' })
  })

  it('never starts DeepSeek\'s account as a flow; without the account service it is not offered at all', async () => {
    const { controller, requests } = build()
    expect((await controller.providers()).providers.map(provider => provider.key)).not.toContain('deepseek-account-platform/default')
    await expect(controller.begin('deepseek-account-platform/default', 'browser')).rejects.toThrow(SignInRequestError)
    expect(requests).toEqual([])
  })

  it('refuses an unknown provider and a method the provider does not offer', async () => {
    const { controller } = build()
    await expect(controller.begin('llm-pi-ai/nope', undefined)).rejects.toThrow(SignInRequestError)
    await expect(controller.begin('llm-pi-ai/openai-codex', 'api-key')).rejects.toThrow('not offered')
  })

  it('activates the provider route when the sign-in succeeds', async () => {
    const activated: string[] = []
    const { controller, finish } = build({}, { routeActivation: { ensureRouteActivated: async providerId => { activated.push(providerId) } } })
    await controller.begin('llm-pi-ai/anthropic', 'oauth')
    finish({ status: 'authorized' })
    await tick()
    expect(await controller.attempt()).toMatchObject({ phase: 'authorized' })
    expect(activated).toEqual(['anthropic'])
  })

  it('does not activate a route that was cancelled', async () => {
    const activated: string[] = []
    const { controller } = build({}, { routeActivation: { ensureRouteActivated: async providerId => { activated.push(providerId) } } })
    const view = await controller.begin('llm-pi-ai/anthropic', 'oauth')
    await controller.cancel(view.id)
    await tick()
    expect(await controller.attempt()).toMatchObject({ phase: 'cancelled' })
    expect(activated).toEqual([])
  })
})

describe('SignInController with DeepSeek\'s account', () => {
  function account(initial: DeepSeekAccountView = { status: 'signed-out', attempt: null }) {
    let state = initial
    const started: unknown[] = []
    const port: DeepSeekAccountPort = {
      getState: async () => state,
      startSignIn: async (client, callbackOrigin, loginSource) => {
        started.push({ client, callbackOrigin, loginSource })
        state = { status: 'signed-out', attempt: { id: 'x1', phase: 'waiting-browser', authorizeUrl: 'https://platform.deepseek.com/dsh/authorize?authorize_id=1' } }
        return state
      },
      cancelSignIn: async () => { state = { status: 'signed-out', attempt: { id: 'x1', phase: 'cancelled' } }; return state },
    }
    return { port, started, set: (next: DeepSeekAccountView) => { state = next } }
  }
  const binding = (port: DeepSeekAccountPort) => () => ({ port, callbackOrigin: 'http://127.0.0.1:3290', loginSource: 'web' as const, version: '0.1.0' })

  it('lists DeepSeek with whether the account is signed in', async () => {
    const { port } = account({ status: 'credential-stored', attempt: null })
    const { controller } = build({}, { deepseekAccount: binding(port) })
    expect((await controller.providers()).providers.at(-1)).toEqual({
      key: 'deepseek-account-platform/default', label: 'DeepSeek', methods: [{ id: 'oauth', label: 'DeepSeek account' }], configured: true,
    })
  })

  it('starts the account sign-in with the Host origin as the callback, shows the browser step, and adopts the default once on success', async () => {
    const { port, started, set } = account()
    const adopted: string[] = []
    const { controller } = build({}, { deepseekAccount: binding(port), defaultModel: { adoptIfDefaultUnusable: async route => { adopted.push(route) } } })
    const view = await controller.begin('deepseek-account-platform/default', 'oauth', { locale: 'zh-CN' })
    expect(view).toMatchObject({ id: 'deepseek-account:x1', phase: 'running', notices: [{ url: 'https://platform.deepseek.com/dsh/authorize?authorize_id=1' }] })
    expect(started).toEqual([{ client: expect.objectContaining({ locale: 'zh-CN', version: '0.1.0' }), callbackOrigin: 'http://127.0.0.1:3290', loginSource: 'web' }])
    set({ status: 'credential-stored', attempt: { id: 'x1', phase: 'succeeded' } })
    expect(await controller.attempt()).toMatchObject({ phase: 'authorized' })
    expect(await controller.attempt()).toMatchObject({ phase: 'authorized' })
    expect(adopted).toEqual(['deepseek-account'])
  })

  it('cancels the account attempt, and reads a failure in words', async () => {
    const { port, set } = account()
    const { controller } = build({}, { deepseekAccount: binding(port) })
    const view = await controller.begin('deepseek-account-platform/default', undefined)
    expect(await controller.cancel(view.id)).toMatchObject({ phase: 'cancelled' })
    await controller.begin('deepseek-account-platform/default', undefined)
    set({ status: 'signed-out', attempt: { id: 'x1', phase: 'failed', errorCode: 'network' } })
    expect(await controller.attempt()).toMatchObject({ phase: 'failed', error: expect.stringContaining('could not be reached') })
  })

  it('a flow sign-in withdraws a running account attempt', async () => {
    const { port } = account()
    const cancelSignIn = vi.spyOn(port, 'cancelSignIn')
    const { controller } = build({}, { deepseekAccount: binding(port) })
    await controller.begin('deepseek-account-platform/default', undefined)
    await controller.begin('llm-pi-ai/anthropic', 'oauth')
    expect(cancelSignIn).toHaveBeenCalledWith('x1')
    expect(await controller.attempt()).toMatchObject({ key: 'llm-pi-ai/anthropic' })
  })
})
