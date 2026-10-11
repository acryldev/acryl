/**
 * `SignInController`: the use-cases behind the sign-in routes, over plain ports.
 *
 * It lists the providers a surface can sign into, runs one conversation at a time (`SignInAttempts`), and activates the
 * provider's route once a sign-in succeeds (`AuthorizationService`). DeepSeek's account is a provider too, driven through
 * DeepSeek's own account service (`deepseek-account.ts`). It holds no Cordis `Context`, so it is unit-testable with stubs;
 * `index.ts` wires the harness services to these ports.
 */
import {
  AuthorizationService,
  SignInAttempts,
  type AuthorizationBeginRequest,
  type AuthorizationOutcome,
  type DefaultModelAdoptionPort,
  type RouteActivationPort,
  type SignInAttemptView,
} from 'acryl-control'
import type { SignInProviderView, SignInProvidersResponse } from './contract.ts'
import {
  DEEPSEEK_ACCOUNT_KEY, DEEPSEEK_ACCOUNT_ROUTE, accountAttemptId, accountAttemptView,
  type DeepSeekAccountClient, type DeepSeekAccountPort,
} from './deepseek-account.ts'

/** A request for a provider or method that does not exist (a stale screen, not a failure of the harness). */
export class SignInRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignInRequestError'
  }
}

/**
 * DeepSeek's account flow is registered on `ctx.authorization` too, but it runs only once DeepSeek's account service has
 * opened an attempt, so it is never started as a flow; the `deepseekAccount` port starts it instead.
 */
const STARTED_ELSEWHERE = new Set([DEEPSEEK_ACCOUNT_KEY])

export interface SignInPorts {
  readonly authorization: {
    list(): readonly { readonly key: string; readonly label: string; readonly methods: readonly { readonly id: string; readonly label: string }[] }[]
    begin(request: AuthorizationBeginRequest): Promise<AuthorizationOutcome>
  }
  readonly credentials: { describeRecord(key: string): Promise<{ readonly configured: boolean }> }
  readonly routeActivation?: RouteActivationPort
  readonly defaultModel?: DefaultModelAdoptionPort
  /**
   * DeepSeek's account service and where its browser step returns to, read at each call (the service may load after this
   * plugin); `undefined` means DeepSeek's account is not offered.
   */
  readonly deepseekAccount?: () => DeepSeekAccountBinding | undefined
  readonly newId: () => string
}

export interface DeepSeekAccountBinding {
  readonly port: DeepSeekAccountPort
  readonly callbackOrigin: string
  readonly loginSource: 'web' | 'desktop'
  readonly version: string
}

/** The UI's language, for DeepSeek's sign-in page. */
export interface SignInClient {
  readonly locale?: string
}

export class SignInController {
  private readonly attempts: SignInAttempts
  /** The DeepSeek account attempt the routes started, while it is the current conversation. */
  private account: { readonly id: string; adopted: boolean } | undefined

  constructor(private readonly ports: SignInPorts) {
    const authorization = new AuthorizationService({
      authorization: ports.authorization,
      ...ports.routeActivation === undefined ? {} : { routeActivation: ports.routeActivation },
      ...ports.defaultModel === undefined ? {} : { defaultModel: ports.defaultModel },
      onCredentialChanged: () => {},
    })
    this.attempts = new SignInAttempts({ begin: request => authorization.begin(request), newId: ports.newId })
  }

  async providers(): Promise<SignInProvidersResponse> {
    const providers: SignInProviderView[] = []
    for (const entry of this.flows()) {
      const stored = await this.ports.credentials.describeRecord(entry.key)
      providers.push({ key: entry.key, label: entry.label, methods: entry.methods.map(({ id, label }) => ({ id, label })), configured: stored.configured })
    }
    const account = this.ports.deepseekAccount?.()
    if (account !== undefined) {
      const state = await account.port.getState()
      providers.push({ key: DEEPSEEK_ACCOUNT_KEY, label: 'DeepSeek', methods: [{ id: 'oauth', label: 'DeepSeek account' }], configured: state.status === 'credential-stored' })
    }
    return { providers, signedIn: providers.some(provider => provider.configured) }
  }

  private flows() {
    return this.ports.authorization.list().filter(entry => !STARTED_ELSEWHERE.has(entry.key))
  }

  async attempt(): Promise<SignInAttemptView | null> {
    const account = this.ports.deepseekAccount?.()
    if (this.account === undefined || account === undefined) return this.attempts.current() ?? null
    const attempt = (await account.port.getState()).attempt
    if (attempt === null || accountAttemptId(attempt.id) !== this.account.id) return null
    const view = accountAttemptView(attempt)
    if (view.phase === 'authorized' && !this.account.adopted) {
      this.account.adopted = true
      await this.ports.defaultModel?.adoptIfDefaultUnusable(DEEPSEEK_ACCOUNT_ROUTE)
    }
    return view
  }

  async begin(key: string, method: string | undefined, client: SignInClient = {}): Promise<SignInAttemptView> {
    const account = this.ports.deepseekAccount?.()
    if (key === DEEPSEEK_ACCOUNT_KEY && account !== undefined) {
      if (method !== undefined && method !== 'oauth') throw new SignInRequestError('That way of signing in is not offered for this provider.')
      const running = this.attempts.current()
      if (running?.phase === 'running') this.attempts.cancel(running.id)
      const state = await account.port.startSignIn(this.accountClient(client), account.callbackOrigin, account.loginSource)
      if (state.attempt === null) throw new SignInRequestError('DeepSeek did not start a sign-in. Try again.')
      this.account = { id: accountAttemptId(state.attempt.id), adopted: false }
      return accountAttemptView(state.attempt)
    }
    const flow = this.flows().find(entry => entry.key === key)
    if (flow === undefined) throw new SignInRequestError('That provider cannot be signed into.')
    if (method !== undefined && !flow.methods.some(candidate => candidate.id === method)) throw new SignInRequestError('That way of signing in is not offered for this provider.')
    await this.cancelAccount()
    return this.attempts.begin(key, method)
  }

  answer(attemptId: string, promptId: string, value: string): SignInAttemptView {
    return this.attempts.answer(attemptId, promptId, value)
  }

  async cancel(attemptId: string): Promise<SignInAttemptView> {
    const account = this.ports.deepseekAccount?.()
    if (this.account?.id === attemptId && account !== undefined) {
      const raw = attemptId.slice(attemptId.indexOf(':') + 1)
      const state = await account.port.cancelSignIn(raw)
      this.account = undefined
      if (state.attempt === null) throw new SignInRequestError('That sign-in is no longer running.')
      return accountAttemptView(state.attempt)
    }
    return this.attempts.cancel(attemptId)
  }

  /** A flow sign-in replaces a running DeepSeek account attempt, as a new flow replaces a running flow. */
  private async cancelAccount(): Promise<void> {
    const account = this.ports.deepseekAccount?.()
    const current = this.account
    this.account = undefined
    if (current === undefined || account === undefined) return
    const attempt = (await account.port.getState()).attempt
    if (attempt !== null && accountAttemptId(attempt.id) === current.id && accountAttemptView(attempt).phase === 'running') await account.port.cancelSignIn(attempt.id)
  }

  private accountClient(client: SignInClient): DeepSeekAccountClient {
    return {
      version: this.ports.deepseekAccount?.()?.version ?? '0.0.0',
      locale: client.locale ?? 'en',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
  }
}
