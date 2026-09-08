/**
 * Data shapes for the `/model` provider-profile overlay: the read model that
 * joins `ctx.llm`'s provider directory with `ctx.settings`' stored sections,
 * the raw shape stored at each provider's settings path, and the mutable
 * draft one add/edit form works with before a save round-trips it back.
 * @module @tomowang/dsh-tui/tui/modelProfile/types
 */
import type { AuthMethod } from 'acryl-control'

/**
 * The `apiKeyEnv` reference a provider route falls back to when its settings
 * profile names none, e.g. `my-proxy` -> `MY_PROXY_API_KEY`. Shared between
 * the overlay (recomputing it for a just-typed custom route before save) and
 * the host wiring (deriving it for every already-configured row), so the
 * naming rule lives in exactly one place.
 */
export function deriveApiKeyRef(route: string): string {
  const upper = route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const identifier = /^[A-Z_]/.test(upper) ? upper : `P_${upper}`
  return `${identifier}_API_KEY`
}

/**
 * A short, identifying (never full) preview of a stored secret — first 4 and
 * last 4 characters, so the API-key field isn't blank-looking when a key is
 * already set and the user can tell *which* key it is without ever seeing
 * enough of it to be usable on its own. Short values (<= 10 chars, where that
 * split would show most of the string anyway) mask everything but the first
 * and last single character instead.
 */
export function maskKeyPreview(value: string): string {
  if (value.length <= 10) {
    return value.length <= 2 ? '*'.repeat(value.length) : `${value[0]}${'*'.repeat(value.length - 2)}${value.at(-1)}`
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

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
  /** How the credential behind `apiKeyConfigured` was obtained, or `undefined` when none is configured. */
  readonly authMethod: AuthMethod | undefined
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
  /** How the credential behind `apiKeyConfigured` was obtained, or `undefined` when none is configured. */
  readonly authMethod: AuthMethod | undefined
  /** Local-only plaintext key entered in this session; empty means "keep current". */
  readonly apiKeyDraft: string
  /** First/last few characters of the currently-stored key (e.g. `sk-p…9sZ4`), so the field isn't blank-looking when one is already set; `undefined` when none is configured. */
  readonly apiKeyPreview: string | undefined
  readonly models: readonly ModelEntry[]
  readonly revision: number | undefined
}
