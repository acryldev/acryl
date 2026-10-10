import { describe, expect, it } from 'vitest'
import type { AuthorizationBeginRequest, AuthorizationOutcome } from 'acryl-control'
import { SignInController, SignInRequestError, type SignInPorts } from '../src/controller.ts'

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

  it('has no attempt before one starts, then runs the named provider and method', () => {
    const { controller, requests } = build()
    expect(controller.attempt()).toBeNull()
    const view = controller.begin('llm-pi-ai/anthropic', 'api-key')
    expect(view).toMatchObject({ key: 'llm-pi-ai/anthropic', method: 'api-key', phase: 'running' })
    expect(requests[0]).toMatchObject({ key: 'llm-pi-ai/anthropic', method: 'api-key' })
  })

  it('refuses an unknown provider and a method the provider does not offer', () => {
    const { controller } = build()
    expect(() => controller.begin('llm-pi-ai/nope', undefined)).toThrow(SignInRequestError)
    expect(() => controller.begin('llm-pi-ai/openai-codex', 'api-key')).toThrow('not offered')
  })

  it('activates the provider route when the sign-in succeeds', async () => {
    const activated: string[] = []
    const { controller, finish } = build({}, { routeActivation: { ensureRouteActivated: async providerId => { activated.push(providerId) } } })
    controller.begin('llm-pi-ai/anthropic', 'oauth')
    finish({ status: 'authorized' })
    await tick()
    expect(controller.attempt()).toMatchObject({ phase: 'authorized' })
    expect(activated).toEqual(['anthropic'])
  })

  it('does not activate a route that was cancelled', async () => {
    const activated: string[] = []
    const { controller } = build({}, { routeActivation: { ensureRouteActivated: async providerId => { activated.push(providerId) } } })
    const view = controller.begin('llm-pi-ai/anthropic', 'oauth')
    controller.cancel(view.id)
    await tick()
    expect(controller.attempt()).toMatchObject({ phase: 'cancelled' })
    expect(activated).toEqual([])
  })
})
