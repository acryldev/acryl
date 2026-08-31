/**
 * OAuth provider metadata (L009): the static config that parameterizes one
 * provider's authorization-code flow. A code table, not a runtime schema —
 * a real provider (Anthropic, OpenAI, …) becomes one entry here.
 * @module @tomowang/dsh-tui/tui/oauth/metadata
 */

/** Owner scope for ACRYL OAuth grants until a real LLM provider owns them. */
export const OAUTH_OWNER_SCOPE = 'acryl-tui'

/** One provider's OAuth authorization-code configuration. */
export interface OAuthProviderMetadata {
  /** Provider route key (matches `ctx.llm` provider id). */
  readonly route: string
  /** OAuth2 authorization endpoint. */
  readonly authorizeUrl: string
  /** OAuth2 token endpoint. */
  readonly tokenUrl: string
  /** Public client id (PKCE public client; no secret). */
  readonly clientId: string
  /** Requested scopes. */
  readonly scopes: readonly string[]
  /** Whether the provider uses PKCE (S256). */
  readonly pkce: boolean
  /** CredentialKey owner scope for the stored grant (defaults to ACRYL's). */
  readonly ownerScope?: string
  /** Optional audience claim for the token request. */
  readonly audience?: string
}

/**
 * The durable grant payload. Owner-defined and opaque to the credentials seam
 * (`GrantRecord.payload`); the OAuth owner writes and reads this shape.
 */
export interface OAuthGrantPayload {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly tokenType?: string
  /** Epoch milliseconds when the access token expires. */
  readonly expiresAt?: number
}

/** The DSH credential-key segment grammar: lowercase hyphenated identifier. */
const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Build the `<scope>/<id>` CredentialKey address for one provider's grant
 * record. Mirrors the DSH `credentialKey` grammar so the record space stays
 * valid without a runtime dependency on `@deepseek-ai/dsh-credentials`.
 */
export function grantKey(meta: OAuthProviderMetadata): string {
  const scope = meta.ownerScope ?? OAUTH_OWNER_SCOPE
  for (const segment of [scope, meta.route]) {
    if (!KEY_SEGMENT_PATTERN.test(segment)) {
      throw new TypeError(`credential key segment "${segment}" must be a lowercase hyphenated identifier`)
    }
  }
  return `${scope}/${meta.route}`
}

/** The OAuth-capable providers shipped with ACRYL. Empty until a real provider is wired. */
export const OAUTH_PROVIDERS: readonly OAuthProviderMetadata[] = []

/** Resolve metadata for a provider route, or undefined when it is not OAuth-capable. */
export function oauthProviderFor(route: string): OAuthProviderMetadata | undefined {
  return OAUTH_PROVIDERS.find(entry => entry.route === route)
}
