/**
 * `missingCredentialAdvice`: what a chat says when the chosen model's provider has no key to send.
 *
 * The harness fails such a request with code `MISSING_CREDENTIAL` and a message for whoever configures it ("its profile
 * resolves ANTHROPIC_API_KEY, which is not set; store it through the credentials service..."). A person reads that as
 * "not signed in" and is not told either way out. This says both: add an API key, or, when the provider offers an
 * account sign-in, sign in with that account.
 *
 * Framework-free like the rest of this folder: plain values, no Cordis `Context`.
 */
import { ROUTE_NAMES } from './route-activation.ts'

/** The harness's failure code for a request whose provider route has no credential to send. */
export const MISSING_CREDENTIAL = 'MISSING_CREDENTIAL'

export interface MissingCredentialRoute {
  /** The provider route the request was for (`anthropic`). */
  readonly provider: string
  /** The name the model picker shows for it, when the route is live. */
  readonly name: string | undefined
  /** Whether the provider can be signed into with an account (an `oauth` sign-in flow). */
  readonly accountSignIn: boolean
}

/** The sentence the chat shows in place of the harness's configuration message. */
export function missingCredentialAdvice(route: MissingCredentialRoute): string {
  const name = route.name ?? ROUTE_NAMES[route.provider] ?? route.provider
  const account = ROUTE_NAMES[route.provider] ?? name
  return route.accountSignIn
    ? `${name} has no API key on this computer. Add an API key in Settings > Models, or sign in with ${account} under Settings > Models > Sign in with an account.`
    : `${name} has no API key on this computer. Add one in Settings > Models.`
}
