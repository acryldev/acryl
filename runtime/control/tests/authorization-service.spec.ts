import { describe, expect, it } from 'vitest'
import { AuthorizationService } from '../src/authorization/service.ts'
import type { AuthorizationBeginRequest, AuthorizationOutcome } from '../src/authorization/types.ts'

const interaction: AuthorizationBeginRequest['interaction'] = {
  notify() {},
  async prompt() { return '' },
}

describe('AuthorizationService', () => {
  it('forwards {key, method, interaction} to the authorization port and returns its outcome', async () => {
    let received: unknown
    const outcome: AuthorizationOutcome = { status: 'authorized' }
    const service = new AuthorizationService({
      authorization: { begin: async request => { received = request; return outcome } },
      onCredentialChanged: () => {},
    })

    const result = await service.begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })

    expect(received).toEqual({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })
    expect(result).toBe(outcome)
  })

  it('emits credential.changed for the signed-in key on a successful authorization', async () => {
    const changed: string[] = []
    const service = new AuthorizationService({
      authorization: { begin: async () => ({ status: 'authorized' }) },
      onCredentialChanged: key => changed.push(key),
    })

    await service.begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })

    expect(changed).toEqual(['llm-pi-ai/anthropic'])
  })

  it('does not emit credential.changed when authorization is cancelled', async () => {
    const changed: string[] = []
    const service = new AuthorizationService({
      authorization: { begin: async () => ({ status: 'cancelled' }) },
      onCredentialChanged: key => changed.push(key),
    })

    await service.begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })

    expect(changed).toEqual([])
  })

  it('activates the route (without touching displayName) on a successful authorization', async () => {
    const activated: Array<{ providerId: string; method: string | undefined }> = []
    const service = new AuthorizationService({
      authorization: { begin: async () => ({ status: 'authorized' }) },
      routeActivation: { ensureRouteActivated: async (providerId, method) => { activated.push({ providerId, method }) } },
      onCredentialChanged: () => {},
    })

    await service.begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })

    expect(activated).toEqual([{ providerId: 'anthropic', method: 'oauth' }])
  })

  it('does not activate a route when authorization was not successful', async () => {
    const activated: unknown[] = []
    const service = new AuthorizationService({
      authorization: { begin: async () => ({ status: 'cancelled' }) },
      routeActivation: { ensureRouteActivated: async () => { activated.push(true) } },
      onCredentialChanged: () => {},
    })

    await service.begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })

    expect(activated).toEqual([])
  })
})
