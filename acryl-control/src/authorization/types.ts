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

export type CredentialChangedListener = (key: string) => void
