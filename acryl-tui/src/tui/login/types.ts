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

/** Overlay-owned state for the `/login` sign-in screen. */
export interface LoginOverlayState {
  /** Joined flow list; `undefined` until the first load settles. */
  readonly flows: readonly AuthorizationFlowRow[] | undefined
  readonly selected: number
  /** The flow being signed into right now (spinner), or undefined. */
  readonly signingIn: string | undefined
  readonly busy: boolean
  readonly error: string | undefined
}
