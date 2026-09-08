import { describe, expect, it } from 'vitest'
import {
  computeCredentialProjection,
  type CredentialProjectionServices,
} from '../src/credential/projection.ts'
import type { AuthMethod, CredentialProjectionRow } from '../src/credential/types.ts'

function stubServices(overrides: Partial<{
  configurable: readonly { provider: string; displayName: string; settingsNs: string; settingsPath: readonly string[] }[]
  live: readonly { id: string }[]
  descriptors: readonly { ns: string; value: unknown; user?: unknown; revision?: number }[]
  credentialInfo: Record<string, { configured: boolean }>
  records: Record<string, { kind: string } | undefined>
  models: Record<string, readonly { id: string }[]>
}> = {}): CredentialProjectionServices {
  const configurable = overrides.configurable ?? [
    { provider: 'anthropic', displayName: 'Anthropic', settingsNs: 'llm', settingsPath: ['providers', 'anthropic'] },
  ]
  const live = overrides.live ?? []
  const descriptors = overrides.descriptors ?? []
  const credentialInfo = overrides.credentialInfo ?? {}
  const records = overrides.records ?? {}
  const models = overrides.models ?? {}
  return {
    llm: {
      listConfigurableProviders: () => configurable,
      listProviders: () => live,
      listModels: async provider => models[provider] ?? [],
    },
    settings: {
      describe: () => descriptors,
    },
    credentials: {
      describe: async ref => credentialInfo[ref] ?? { configured: false },
      readRecord: async key => records[key],
    },
  }
}

describe('CredentialProjection', () => {
  it('exports AuthMethod and CredentialProjectionRow with one field set', () => {
    const method: AuthMethod = 'oauth'
    const row: CredentialProjectionRow = {
      route: 'anthropic',
      displayName: 'Anthropic',
      settingsNs: 'llm',
      settingsPath: ['providers', 'anthropic'],
      hasSettingsProfile: false,
      hasCredential: true,
      isLive: false,
      authMethod: method,
      api: undefined,
      baseURL: undefined,
      apiKeyRef: 'ANTHROPIC_API_KEY',
      models: [],
      revision: undefined,
    }
    expect(row.hasCredential).toBe(true)
  })

  it('returns a joined row with authMethod/isLive and configured appearing once per row', async () => {
    const services = stubServices({
      descriptors: [{ ns: 'llm', value: { providers: { anthropic: { displayName: 'Anthropic Claude' } } }, user: { providers: { anthropic: { displayName: 'Anthropic Claude' } } }, revision: 3 }],
      live: [{ id: 'anthropic' }],
      records: { 'llm-pi-ai/anthropic': { kind: 'grant' } },
      models: { anthropic: [{ id: 'claude-opus' }] },
    })
    const rows = await computeCredentialProjection(services, { deriveApiKeyRef: route => `${route.toUpperCase()}_API_KEY` })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.route).toBe('anthropic')
    expect(row.displayName).toBe('Anthropic Claude')
    expect(row.hasSettingsProfile).toBe(true)
    expect(row.hasCredential).toBe(true)
    expect(row.isLive).toBe(true)
    expect(row.authMethod).toBe('oauth')
    expect(row.models).toEqual([{ id: 'claude-opus' }])
    expect(row.revision).toBe(3)
  })

  it('derives authMethod as api-key from an apiKeyEnv credential when no login record exists', async () => {
    const services = stubServices({
      credentialInfo: { ANTHROPIC_API_KEY: { configured: true } },
    })
    const rows = await computeCredentialProjection(services, { deriveApiKeyRef: route => `${route.toUpperCase()}_API_KEY` })
    const [row] = rows
    expect(row?.authMethod).toBe('api-key')
    expect(row?.hasCredential).toBe(true)
  })

  it('reports no credential and undefined authMethod for an unconfigured route', async () => {
    const services = stubServices()
    const rows = await computeCredentialProjection(services, { deriveApiKeyRef: route => `${route.toUpperCase()}_API_KEY` })
    const [row] = rows
    expect(row?.hasCredential).toBe(false)
    expect(row?.authMethod).toBeUndefined()
    expect(row?.isLive).toBe(false)
  })
})
