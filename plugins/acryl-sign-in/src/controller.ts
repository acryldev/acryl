/**
 * `SignInController`: the use-cases behind the sign-in routes, over plain ports.
 *
 * It lists the providers a surface can sign into, runs one conversation at a time (`SignInAttempts`), and activates the
 * provider's route once a sign-in succeeds (`AuthorizationService`). It holds no Cordis `Context`, so it is unit-testable
 * with stubs; `index.ts` wires the harness services to these ports.
 */
import {
  AuthorizationService,
  SignInAttempts,
  type AuthorizationBeginRequest,
  type AuthorizationOutcome,
  type RouteActivationPort,
  type SignInAttemptView,
} from 'acryl-control'
import type { SignInProviderView, SignInProvidersResponse } from './contract.ts'

/** A request for a provider or method that does not exist (a stale screen, not a failure of the harness). */
export class SignInRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignInRequestError'
  }
}

export interface SignInPorts {
  readonly authorization: {
    list(): readonly { readonly key: string; readonly label: string; readonly methods: readonly { readonly id: string; readonly label: string }[] }[]
    begin(request: AuthorizationBeginRequest): Promise<AuthorizationOutcome>
  }
  readonly credentials: { describeRecord(key: string): Promise<{ readonly configured: boolean }> }
  readonly routeActivation?: RouteActivationPort
  readonly newId: () => string
}

export class SignInController {
  private readonly attempts: SignInAttempts

  constructor(private readonly ports: SignInPorts) {
    const authorization = new AuthorizationService({
      authorization: ports.authorization,
      ...ports.routeActivation === undefined ? {} : { routeActivation: ports.routeActivation },
      onCredentialChanged: () => {},
    })
    this.attempts = new SignInAttempts({ begin: request => authorization.begin(request), newId: ports.newId })
  }

  async providers(): Promise<SignInProvidersResponse> {
    const providers: SignInProviderView[] = []
    for (const entry of this.ports.authorization.list()) {
      const stored = await this.ports.credentials.describeRecord(entry.key)
      providers.push({ key: entry.key, label: entry.label, methods: entry.methods.map(({ id, label }) => ({ id, label })), configured: stored.configured })
    }
    return { providers, signedIn: providers.some(provider => provider.configured) }
  }

  attempt(): SignInAttemptView | null {
    return this.attempts.current() ?? null
  }

  begin(key: string, method: string | undefined): SignInAttemptView {
    const flow = this.ports.authorization.list().find(entry => entry.key === key)
    if (flow === undefined) throw new SignInRequestError('That provider cannot be signed into.')
    if (method !== undefined && !flow.methods.some(candidate => candidate.id === method)) throw new SignInRequestError('That way of signing in is not offered for this provider.')
    return this.attempts.begin(key, method)
  }

  answer(attemptId: string, promptId: string, value: string): SignInAttemptView {
    return this.attempts.answer(attemptId, promptId, value)
  }

  cancel(attemptId: string): SignInAttemptView {
    return this.attempts.cancel(attemptId)
  }
}
