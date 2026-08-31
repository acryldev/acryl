/**
 * Data shapes for the `/login` authorization overlay: the read model that joins
 * `ctx.authorization`'s registered flows with the surface that renders them.
 * @module @tomowang/dsh-tui/tui/login/types
 */

/** One method a flow offers (e.g. `oauth`, `api-key`). */
export interface AuthorizationMethodRow {
  readonly id: string
  readonly label: string
}

/** One registered authorization flow as the overlay shows it. */
export interface AuthorizationFlowRow {
  /** The credential record key this flow writes (`<scope>/<id>`). */
  readonly key: string
  /** User-facing provider name (e.g. "Anthropic (Claude Pro/Max)"). */
  readonly label: string
  /** The methods offered, most preferred first. */
  readonly methods: readonly AuthorizationMethodRow[]
  /** Whether an attempt is already running for this key. */
  readonly inFlight: boolean
}

/** One choice offered by a `select` authorization prompt. */
export interface LoginPromptOption {
  readonly id: string
  readonly label: string
  readonly description?: string
}

/** A question the running flow needs answered before it can continue. */
export type LoginPromptState =
  | { readonly kind: 'text'; readonly message: string; readonly placeholder?: string }
  | { readonly kind: 'secret'; readonly message: string; readonly placeholder?: string }
  | { readonly kind: 'select'; readonly message: string; readonly options: readonly LoginPromptOption[] }

/** Overlay-owned state for the `/login` sign-in screen. */
export interface LoginOverlayState {
  /** Joined flow list; `undefined` until the first load settles. */
  readonly flows: readonly AuthorizationFlowRow[] | undefined
  readonly selected: number
  /** The flow being signed into right now (spinner), or undefined. */
  readonly signingIn: string | undefined
  /** The prompt the running flow is waiting on, or undefined outside a flow. */
  readonly prompt: LoginPromptState | undefined
  readonly busy: boolean
  readonly error: string | undefined
}
