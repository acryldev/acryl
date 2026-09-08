/**
 * `CredentialProjection`: the one join of `ctx.llm` + `ctx.settings` +
 * `ctx.credentials` into provider rows. Replaces the surface's own
 * `computeProviderRows`/`loadAuthorizationFlows` duplicate joins (finding R1)
 * so `/login` and `/model` read the same projection instead of two
 * independently-fetched pictures of the same state.
 *
 * Framework-free: takes plain service ports (not a Cordis `Context`), so it
 * is directly unit-testable with stubs — no Cordis boot required. The
 * surface wires these ports from `host.ctx.get(...)`.
 */
import type { AuthMethod, CredentialModelEntry, CredentialProjectionRow } from './types.ts'

export interface CredentialProjectionConfigurableProvider {
  readonly provider: string
  readonly displayName: string
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
}

export interface CredentialProjectionLlmPort {
  listConfigurableProviders(): readonly CredentialProjectionConfigurableProvider[]
  listProviders(): readonly { readonly id: string }[]
  listModels(provider: string): Promise<readonly CredentialModelEntry[]>
}

export interface CredentialProjectionSettingsDescriptor {
  readonly ns: string
  readonly value: unknown
  readonly user?: unknown
  readonly revision?: number
}

export interface CredentialProjectionSettingsPort {
  describe(options: { readonly redactSecrets: boolean }): readonly CredentialProjectionSettingsDescriptor[]
}

export interface CredentialProjectionRecord {
  readonly kind: string
}

export interface CredentialProjectionCredentialsPort {
  describe(ref: string): Promise<{ readonly configured: boolean }>
  readRecord?(key: string): Promise<CredentialProjectionRecord | undefined>
}

export interface CredentialProjectionServices {
  readonly llm: CredentialProjectionLlmPort
  readonly settings: CredentialProjectionSettingsPort
  readonly credentials: CredentialProjectionCredentialsPort
}

export interface CredentialProjectionOptions {
  /** Derive the settings-fallback `apiKeyEnv` reference for a route with no stored profile. */
  readonly deriveApiKeyRef: (route: string) => string
  /**
   * The scope a `/login` sign-in's own credential record lives under
   * (`dsh-llm-pi-ai`'s `credentialKey(scope, providerId)`), separate from the
   * `apiKeyEnv` reference a manually configured provider's settings profile
   * points at. Defaults to `'llm-pi-ai'`.
   */
  readonly loginRecordScope?: string
}

/** Read a nested value out of an untyped resolved/raw settings section. */
function getAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

interface StoredProviderProfileLike {
  readonly displayName?: string
  readonly api?: string
  readonly baseURL?: string
  readonly apiKeyEnv?: string
  readonly models?: readonly CredentialModelEntry[]
}

/** Compute every provider route's joined credential/settings/live-registration row. */
export async function computeCredentialProjection(
  services: CredentialProjectionServices,
  options: CredentialProjectionOptions,
): Promise<readonly CredentialProjectionRow[]> {
  const scope = options.loginRecordScope ?? 'llm-pi-ai'
  const configurable = services.llm.listConfigurableProviders()
  const live = new Set(services.llm.listProviders().map(provider => provider.id))
  const descriptors = services.settings.describe({ redactSecrets: true })
  const byNs = new Map(descriptors.map(descriptor => [descriptor.ns, descriptor]))

  const rows: CredentialProjectionRow[] = []
  for (const entry of configurable) {
    const descriptor = byNs.get(entry.settingsNs)
    const value = (descriptor === undefined ? undefined : getAtPath(descriptor.value, entry.settingsPath)) as StoredProviderProfileLike | undefined
    const userValue = descriptor === undefined ? undefined : getAtPath(descriptor.user, entry.settingsPath)
    const apiKeyRef = value?.apiKeyEnv ?? options.deriveApiKeyRef(entry.provider)
    const info = await services.credentials.describe(apiKeyRef)
    // A `/login` sign-in never sets `apiKeyEnv` — it writes the login scope's
    // own record instead — so `info.configured` alone reads "no key" for a
    // route the user just signed into via OAuth or a catalog API key. Check
    // that record too before reporting "no credential".
    const loginRecord = await services.credentials.readRecord?.(`${scope}/${entry.provider}`)
    // A login record's `kind` names the actual method used ('grant' is an
    // OAuth token, anything else is catalog-flow-typed key); the ref-based
    // path (`apiKeyEnv`) only ever comes from typing a key into `/model`
    // directly, so it's unambiguously 'api-key' too. A row is one or the
    // other in practice — `/login` and `/model` write to different storage.
    const authMethod: AuthMethod | undefined = loginRecord !== undefined
      ? (loginRecord.kind === 'grant' ? 'oauth' : 'api-key')
      : info.configured ? 'api-key' : undefined
    const isLive = live.has(entry.provider)
    // `value?.models` only reflects a settings-document override; omitting it
    // (the normal case) means "use the installed catalog's own models",
    // which only a live registration can actually answer.
    const models = isLive
      ? await services.llm.listModels(entry.provider).catch(() => value?.models ?? [])
      : value?.models ?? []
    rows.push({
      route: entry.provider,
      displayName: value?.displayName ?? entry.displayName,
      settingsNs: entry.settingsNs,
      settingsPath: entry.settingsPath,
      hasSettingsProfile: userValue !== undefined,
      hasCredential: info.configured || loginRecord !== undefined,
      isLive,
      authMethod,
      api: value?.api,
      baseURL: value?.baseURL,
      apiKeyRef,
      models,
      revision: descriptor?.revision,
    })
  }
  return rows
}
