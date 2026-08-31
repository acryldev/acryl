/**
 * Data shapes for the `/model` provider-profile overlay: the read model that
 * joins `ctx.llm`'s provider directory with `ctx.settings`' stored sections,
 * the raw shape stored at each provider's settings path, and the mutable
 * draft one add/edit form works with before a save round-trips it back.
 * @module @tomowang/dsh-tui/tui/modelProfile/types
 */

import type { OAuthProviderMetadata } from '../oauth/metadata.js'

/** One model entry within a provider's catalog. */
export interface ModelEntry {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
}

/** One model an endpoint reported during discovery, not yet added to a draft. */
export interface DiscoveredModel {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
}

/** Raw shape stored at a provider's settings path (subset of `PiAiProviderProfile`). */
export interface StoredProviderProfile {
  readonly displayName?: string
  readonly api?: string
  readonly baseURL?: string
  readonly apiKeyEnv?: string
  readonly models?: readonly ModelEntry[]
}

/** One provider route as shown in the overlay's list view. */
export interface ProviderRow {
  readonly route: string
  readonly displayName: string
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
  /** Whether the user's settings document has an override for this route. */
  readonly configured: boolean
  /** Whether the route is currently registered/live in `ctx.llm`. */
  readonly live: boolean
  readonly api: string | undefined
  readonly baseURL: string | undefined
  readonly apiKeyRef: string
  readonly apiKeyConfigured: boolean
  /** OAuth metadata when this route is OAuth-capable. */
  readonly oauth: OAuthProviderMetadata | undefined
  /** Whether an OAuth grant is currently stored for this route. */
  readonly grantConfigured: boolean
  readonly models: readonly ModelEntry[]
  /** Settings revision this row was read at; replayed as `expectedRevision` on write. */
  readonly revision: number | undefined
}

/** Editable draft for the add/edit form; never carries the raw API key once saved. */
export interface ProviderDraft {
  readonly route: string
  readonly isNew: boolean
  readonly settingsNs: string
  readonly settingsPath: readonly string[]
  readonly displayName: string
  readonly api: string
  readonly baseURL: string
  readonly apiKeyRef: string
  readonly apiKeyConfigured: boolean
  /** Local-only plaintext key entered in this session; empty means "keep current". */
  readonly apiKeyDraft: string
  readonly models: readonly ModelEntry[]
  readonly revision: number | undefined
}
