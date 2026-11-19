/** Typed authorization use-case contract: `/login`'s `beginAuthorization` action. */

/** A question the running flow needs answered before it can continue (opaque pass-through). */
export interface AuthorizationInteraction {
  notify(notice: { readonly message: string; readonly url?: string; readonly code?: string }): void
  prompt(prompt: {
    readonly kind: 'text' | 'secret' | 'select'
    readonly message: string
    readonly options?: readonly { readonly id: string; readonly label: string; readonly description?: string }[]
    readonly placeholder?: string
    readonly signal?: AbortSignal
  }): Promise<string>
}

export interface AuthorizationBeginRequest {
  /** The credential record key this flow writes (`<scope>/<id>`). */
  readonly key: string
  readonly method: string | undefined
  readonly interaction: AuthorizationInteraction
  /** Withdraws the attempt (a Cancel button on a surface that is not the one holding the flow). */
  readonly signal?: AbortSignal
}

export interface AuthorizationOutcome {
  readonly status: string
  readonly [extra: string]: unknown
}

/** The underlying pi-ai (or equivalent) authorization flow runner. */
export interface AuthorizationPort {
  begin(request: AuthorizationBeginRequest): Promise<AuthorizationOutcome>
}

/**
 * Make a route usable from `/model` after a successful sign-in: `dsh-llm-pi-ai`
 * only registers a route as live once its settings section names it (even an
 * empty profile — "use the installed catalog's defaults" — counts), so a
 * signed-in-but-never-configured route stays credentialed but absent from
 * `ctx.llm`'s live directory otherwise. A no-op when the route already has a
 * settings profile, so it never clobbers one the user already configured.
 */
export interface RouteActivationPort {
  ensureRouteActivated(providerId: string, method: string | undefined): Promise<void>
}

/**
 * Point new sessions at a just-signed-in provider when the current default
 * cannot answer, so a first sign-in with anything but the composition's default
 * provider does not leave the first message failing. A no-op when the current
 * default works.
 */
export interface DefaultModelAdoptionPort {
  adoptIfDefaultUnusable(providerId: string): Promise<void>
}

export type CredentialChangedListener = (key: string) => void

/** The service name of {@link AccountSignInPort}. */
export const ACCOUNT_SIGN_IN_SERVICE = 'acrylAccountSignIn'

/**
 * The key DeepSeek's account flow registers on `ctx.authorization` (`dsh-deepseek-account-platform`). It runs only once
 * DeepSeek's account service has opened an attempt, so a surface never starts it through `begin`.
 */
export const DEEPSEEK_ACCOUNT_FLOW_KEY = 'deepseek-account-platform/default'

export type AccountSignInOutcome =
  | { readonly status: 'authorized' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed', readonly error: string }

/**
 * `acrylAccountSignIn`: DeepSeek account sign-in on a surface without a web server of its own (the terminal), provided by
 * `acryl-sign-in/account-callback`. DeepSeek's account flow is registered on `ctx.authorization` as `key`, but it can only
 * be started here; a surface lists it under that key and signs in through this port instead of `begin`.
 */
export interface AccountSignInPort {
  /** The authorization flow key the sign-in writes ({@link DEEPSEEK_ACCOUNT_FLOW_KEY}). */
  readonly key: string
  /** The model route a successful sign-in makes usable (`deepseek-account`). */
  readonly route: string
  /** Start a sign-in and settle when it ends; `notify` receives the page to open in a browser. Aborting cancels it. */
  signIn(request: {
    readonly locale?: string
    readonly signal?: AbortSignal
    notify(url: string): void
  }): Promise<AccountSignInOutcome>
}
