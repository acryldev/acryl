/**
 * `AuthorizationService`: the `beginAuthorization` use-case, owned outside
 * the terminal surface (finding R1). Forwards to the underlying
 * `AuthorizationPort`, activates the route on success (no display-name
 * encoding — the `-oauth` suffix hack is deleted, not moved; see finding R2),
 * and emits `credential.changed` so subscribers can invalidate a targeted
 * projection instead of a shotgun dual reload (finding R4).
 *
 * Framework-free: every dependency is a plain port, so this is directly
 * unit-testable with stubs — no Cordis boot required.
 */
import type {
  AuthorizationBeginRequest,
  AuthorizationOutcome,
  AuthorizationPort,
  CredentialChangedListener,
  RouteActivationPort,
} from './types.ts'

export interface AuthorizationServiceDeps {
  readonly authorization: AuthorizationPort
  /** Optional: absent profiles degrade to "not available" (matches the surface's own optional-service pattern). */
  readonly routeActivation?: RouteActivationPort
  readonly onCredentialChanged: CredentialChangedListener
}

export class AuthorizationService {
  constructor(private readonly deps: AuthorizationServiceDeps) {}

  async begin(request: AuthorizationBeginRequest): Promise<AuthorizationOutcome> {
    const outcome = await this.deps.authorization.begin(request)
    if (outcome.status === 'authorized') {
      const slash = request.key.indexOf('/')
      const providerId = slash === -1 ? request.key : request.key.slice(slash + 1)
      if (this.deps.routeActivation !== undefined) {
        await this.deps.routeActivation.ensureRouteActivated(providerId, request.method)
      }
      this.deps.onCredentialChanged(request.key)
    }
    return outcome
  }
}
