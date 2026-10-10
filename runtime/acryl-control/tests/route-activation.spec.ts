import { describe, expect, it } from 'vitest'
import { createRouteActivation, type RouteActivationPorts } from '../src/credential/route-activation.ts'

function ports(user: unknown, extra: Partial<RouteActivationPorts> = {}) {
  const updates: Array<{ ns: string; patch: Record<string, unknown>; revision: number | undefined }> = []
  const value: RouteActivationPorts = {
    llm: { listConfigurableProviders: () => [{ provider: 'anthropic', displayName: 'Anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'] }] },
    settings: {
      describe: () => [{ ns: 'llm-pi-ai', value: {}, user, revision: 7 }],
      update: async (ns, patch, revision) => { updates.push({ ns, patch, revision }) },
    },
    ...extra,
  }
  return { value, updates }
}

describe('createRouteActivation', () => {
  it('names the route in settings with an empty profile when it has none', async () => {
    const { value, updates } = ports({})
    await createRouteActivation(value).ensureRouteActivated('anthropic', 'oauth')
    expect(updates).toEqual([{ ns: 'llm-pi-ai', patch: { providers: { anthropic: {} } }, revision: 7 }])
  })

  it('leaves a profile the user configured alone', async () => {
    const { value, updates } = ports({ providers: { anthropic: { baseURL: 'https://proxy.test' } } })
    await createRouteActivation(value).ensureRouteActivated('anthropic', 'api-key')
    expect(updates).toEqual([])
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
