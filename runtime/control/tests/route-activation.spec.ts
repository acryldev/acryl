import { describe, expect, it } from 'vitest'
import { createRouteActivation, type RouteActivationPathOp, type RouteActivationPorts } from '../src/credential/route-activation.ts'

function ports(section: unknown, extra: Partial<RouteActivationPorts> = {}, stored: readonly string[] = []) {
  const updates: Array<{ ns: string; patch: Record<string, unknown>; revision: number | undefined }> = []
  const mutations: Array<{ ns: string; ops: readonly RouteActivationPathOp[]; revision: number | undefined }> = []
  const value: RouteActivationPorts = {
    llm: { listConfigurableProviders: () => [
      { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'] },
      { provider: 'kimi-coding', displayName: 'kimi-coding', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'kimi-coding'] },
    ] },
    settings: {
      describe: () => [{ ns: 'llm-pi-ai', value: section, user: {}, revision: 7 }],
      update: async (ns, patch, revision) => { updates.push({ ns, patch, revision }) },
      mutate: async (ns, ops, revision) => { mutations.push({ ns, ops, revision }) },
    },
    credentials: { describe: async ref => ({ configured: stored.includes(ref) }) },
    ...extra,
  }
  return { value, updates, mutations }
}

describe('createRouteActivation', () => {
  it('gives a route with no profile one, shown as Claude rather than the route key', async () => {
    const { value, updates } = ports({})
    await createRouteActivation(value).ensureRouteActivated('anthropic', 'oauth')
    expect(updates).toEqual([{ ns: 'llm-pi-ai', patch: { providers: { anthropic: { displayName: 'Claude' } } }, revision: 7 }])
  })

  it('gives a provider it has no name for an empty profile (the catalog defaults)', async () => {
    const { value, updates } = ports({})
    await createRouteActivation(value).ensureRouteActivated('kimi-coding', 'oauth')
    expect(updates).toEqual([{ ns: 'llm-pi-ai', patch: { providers: { 'kimi-coding': {} } }, revision: 7 }])
  })

  it('leaves a profile the user configured alone', async () => {
    const { value, updates, mutations } = ports({ providers: { anthropic: { baseURL: 'https://proxy.test', displayName: 'Anthropic' } } })
    await createRouteActivation(value).ensureRouteActivated('anthropic', 'api-key')
    expect(updates).toEqual([])
    expect(mutations).toEqual([])
  })

  it('removes an apiKeyEnv naming a key that is not stored, so the sign-in authenticates the route', async () => {
    const { value, updates, mutations } = ports({ providers: { anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', displayName: 'Anthropic' } } })
    await createRouteActivation(value).ensureRouteActivated('anthropic', 'oauth')
    expect(updates).toEqual([])
    expect(mutations).toEqual([{ ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', 'anthropic', 'apiKeyEnv'] }], revision: 7 }])
  })

  it('keeps an apiKeyEnv whose key is stored: the key the person typed still wins', async () => {
    const { value, mutations } = ports({ providers: { anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY' } } }, {}, ['ANTHROPIC_API_KEY'])
    await createRouteActivation(value).ensureRouteActivated('anthropic', 'oauth')
    expect(mutations).toEqual([])
  })

  it('ignores a provider that is not configurable', async () => {
    const { value, updates } = ports({})
    await createRouteActivation(value).ensureRouteActivated('unknown', undefined)
    expect(updates).toEqual([])
  })

  it('waits for the settings watchers after writing', async () => {
    const order: string[] = []
    const { value } = ports({}, { settled: async () => { order.push('settled') } })
    const wrapped = { ...value, settings: { ...value.settings, update: async () => { order.push('update') } } }
    await createRouteActivation(wrapped).ensureRouteActivated('anthropic', undefined)
    expect(order).toEqual(['update', 'settled'])
  })
})
