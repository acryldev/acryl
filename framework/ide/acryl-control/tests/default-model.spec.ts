import { describe, expect, it } from 'vitest'
import { createDefaultModelAdoption, startingModel, type DefaultModelAdoptionPorts, type DefaultModelSelection } from '../src/credential/default-model.ts'
import { isRouteUsable, type RouteUsabilityServices } from '../src/credential/projection.ts'
import { AuthorizationService } from '../src/authorization/service.ts'

function adoption(current: DefaultModelSelection, usable: readonly string[], models: Record<string, readonly string[]>) {
  const saved: DefaultModelSelection[] = []
  const ports: DefaultModelAdoptionPorts = {
    defaultModel: { currentSelection: () => current, saveSelection: async next => { saved.push(next) } },
    isUsable: async provider => usable.includes(provider),
    listModels: async provider => (models[provider] ?? []).map(id => ({ id })),
  }
  return { port: createDefaultModelAdoption(ports), saved }
}

describe('createDefaultModelAdoption', () => {
  it('points new sessions at the signed-in provider when the current default cannot answer', async () => {
    const { port, saved } = adoption({ provider: 'deepseek', model: 'deepseek-v4-pro' }, ['anthropic'], { anthropic: ['claude-fable-5', 'claude-sonnet-5'] })
    await port.adoptIfDefaultUnusable('anthropic')
    expect(saved).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-5' }])
  })

  it('keeps a default whose provider works', async () => {
    const { port, saved } = adoption({ provider: 'deepseek', model: 'deepseek-v4-pro' }, ['deepseek', 'anthropic'], { anthropic: ['claude-sonnet-5'] })
    await port.adoptIfDefaultUnusable('anthropic')
    expect(saved).toEqual([])
  })

  it('keeps the default when the signed-in provider already is the default provider', async () => {
    const { port, saved } = adoption({ provider: 'anthropic', model: 'claude-opus-5' }, [], { anthropic: ['claude-sonnet-5'] })
    await port.adoptIfDefaultUnusable('anthropic')
    expect(saved).toEqual([])
  })

  it('keeps the default when the signed-in route lists no models', async () => {
    const { port, saved } = adoption({ provider: 'deepseek', model: 'deepseek-v4-pro' }, [], {})
    await port.adoptIfDefaultUnusable('github-copilot')
    expect(saved).toEqual([])
  })
})

describe('startingModel', () => {
  it('prefers the listed starting model over the catalog order', () => {
    expect(startingModel('openai-codex', [{ id: 'gpt-5.3-codex-spark' }, { id: 'gpt-5.5' }])).toBe('gpt-5.5')
  })

  it('falls back to the first catalog entry for a provider without a preference or after a catalog update', () => {
    expect(startingModel('github-copilot', [{ id: 'claude-fable-5' }, { id: 'gpt-5.5' }])).toBe('claude-fable-5')
    expect(startingModel('anthropic', [{ id: 'claude-next' }])).toBe('claude-next')
  })
})

function usability(overrides: Partial<{ live: readonly string[]; apiKeyEnv: string; secrets: readonly string[]; records: readonly string[] }> = {}): RouteUsabilityServices {
  return {
    llm: {
      listConfigurableProviders: () => [{ provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'deepseek'] }],
      listProviders: () => (overrides.live ?? ['deepseek']).map(id => ({ id })),
    },
    settings: {
      describe: () => [{ ns: 'llm-pi-ai', value: { providers: { deepseek: overrides.apiKeyEnv === undefined ? {} : { apiKeyEnv: overrides.apiKeyEnv } } } }],
    },
    credentials: {
      describe: async ref => ({ configured: (overrides.secrets ?? []).includes(ref) }),
      describeRecord: async key => ({ configured: (overrides.records ?? []).includes(key) }),
    },
  }
}

describe('isRouteUsable', () => {
  it('is false for a route that is not live', async () => {
    expect(await isRouteUsable(usability({ live: [], secrets: ['DEEPSEEK_API_KEY'] }), 'deepseek')).toBe(false)
  })

  it('is false for a live route without any credential', async () => {
    expect(await isRouteUsable(usability(), 'deepseek')).toBe(false)
  })

  it('reads the profile\'s own apiKeyEnv reference before the derived one', async () => {
    expect(await isRouteUsable(usability({ apiKeyEnv: 'DSH_DEEPSEEK_KEY', secrets: ['DSH_DEEPSEEK_KEY'] }), 'deepseek')).toBe(true)
    expect(await isRouteUsable(usability({ apiKeyEnv: 'DSH_DEEPSEEK_KEY', secrets: ['DEEPSEEK_API_KEY'] }), 'deepseek')).toBe(false)
  })

  it('counts a sign-in record', async () => {
    expect(await isRouteUsable(usability({ records: ['llm-pi-ai/deepseek'] }), 'deepseek')).toBe(true)
  })
})

describe('AuthorizationService with default-model adoption', () => {
  const interaction = { notify() {}, async prompt() { return '' } }

  it('adopts after the route is active, and only on success', async () => {
    const order: string[] = []
    const service = (status: string) => new AuthorizationService({
      authorization: { begin: async () => ({ status }) },
      routeActivation: { ensureRouteActivated: async () => { order.push('activate') } },
      defaultModel: { adoptIfDefaultUnusable: async provider => { order.push(`adopt ${provider}`) } },
      onCredentialChanged: () => {},
    })
    await service('cancelled').begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })
    expect(order).toEqual([])
    await service('authorized').begin({ key: 'llm-pi-ai/anthropic', method: 'oauth', interaction })
    expect(order).toEqual(['activate', 'adopt anthropic'])
  })
})
