/**
 * Typed read-model for a provider route's credential/authorization state.
 * `/login` and `/model` (in `acryl-cli`) both consume the *same* projection —
 * this is the one place `hasCredential`/`hasSettingsProfile`/`isLive`/
 * `authMethod` are defined, so no field means two different things across
 * the two overlays (see `specs/001-acryl-refactor-improvements-and-tech-debt`,
 * finding R3).
 */

/** How a stored credential was obtained. */
export type AuthMethod = 'oauth' | 'api-key'

/** One model entry within a provider's catalog (subset shared with the surface's own `ModelEntry`). */
export interface CredentialModelEntry {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
}

/** One provider route, joined from `ctx.llm` + `ctx.settings` + `ctx.credentials`. */
export interface CredentialProjectionRow {
  readonly route: string
  readonly displayName: string
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
  /** Whether the user's settings document has an override for this route (a `/model` save, not a `/login` sign-in). */
  readonly hasSettingsProfile: boolean
  /** Whether a credential — an `apiKeyEnv` secret or a `/login` record — is stored for this route. */
  readonly hasCredential: boolean
  /** Whether the route is currently registered/live in `ctx.llm`. */
  readonly isLive: boolean
  /** How the credential behind `hasCredential` was obtained, or `undefined` when none is configured. */
  readonly authMethod: AuthMethod | undefined
  readonly api: string | undefined
  readonly baseURL: string | undefined
  readonly apiKeyRef: string
  readonly models: readonly CredentialModelEntry[]
  /** Settings revision this row was read at; replay as `expectedRevision` on write. */
  readonly revision: number | undefined
}
