/**
 * DeepSeek account sign-in through the harness's `deepseekAccount` service (`dsh-deepseek-account-platform`).
 *
 * DeepSeek's own account dialog registers only inside DeepSeek's Desktop window, so ACRYL's surfaces drive the service
 * here and show its attempt in the same form as the harness authorization flows (`SignInAttemptView`). The browser
 * returns to the Host's own `/oauth/callback`, served on the origin the routes are served on.
 */
import { DEEPSEEK_ACCOUNT_FLOW_KEY, type SignInAttemptView } from 'acryl-control'

/** The flow key DeepSeek's account registers on `ctx.authorization`; also the id the routes use for it. */
export const DEEPSEEK_ACCOUNT_KEY = DEEPSEEK_ACCOUNT_FLOW_KEY
/** The model route a DeepSeek account sign-in makes usable (`dsh-llm-deepseek-account`). */
export const DEEPSEEK_ACCOUNT_ROUTE = 'deepseek-account'

type AccountPhase = 'initializing' | 'waiting-browser' | 'exchanging' | 'committing' | 'succeeded' | 'cancelled' | 'expired' | 'failed'

export interface DeepSeekAccountView {
  readonly status: 'signed-out' | 'credential-stored'
  readonly attempt: {
    readonly id: string
    readonly phase: AccountPhase
    readonly authorizeUrl?: string
    readonly errorCode?: 'network' | 'protocol' | 'expired' | 'storage'
  } | null
}

export interface DeepSeekAccountClient {
  readonly version: string
  readonly locale: string
  readonly timezoneOffsetSeconds: number
}

/** The narrow share of `deepseekAccount` this plugin uses. */
export interface DeepSeekAccountPort {
  getState(): Promise<DeepSeekAccountView>
  startSignIn(client: DeepSeekAccountClient, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<DeepSeekAccountView>
  cancelSignIn(id: string): Promise<DeepSeekAccountView>
}

const FAILURES: Readonly<Record<NonNullable<NonNullable<DeepSeekAccountView['attempt']>['errorCode']>, string>> = {
  network: 'DeepSeek could not be reached. Check the connection and try again.',
  protocol: 'DeepSeek answered in a way ACRYL did not expect. Try again.',
  expired: 'The sign-in link expired. Try again.',
  storage: 'The DeepSeek sign-in could not be saved on this computer.',
}

/** The routes' attempt id for one account attempt; prefixed so it never collides with a flow attempt id. */
export const accountAttemptId = (id: string): string => `deepseek-account:${id}`

/** One account attempt in the form the sign-in routes return. */
export function accountAttemptView(attempt: NonNullable<DeepSeekAccountView['attempt']>): SignInAttemptView {
  const base = { id: accountAttemptId(attempt.id), key: DEEPSEEK_ACCOUNT_KEY, method: 'oauth' }
  const notices = attempt.authorizeUrl === undefined ? [] : [{ message: 'Continue in your browser', url: attempt.authorizeUrl }]
  switch (attempt.phase) {
    case 'initializing':
    case 'waiting-browser':
    case 'exchanging':
    case 'committing':
      return { ...base, phase: 'running', notices }
    case 'succeeded':
      return { ...base, phase: 'authorized', notices: [] }
    case 'cancelled':
      return { ...base, phase: 'cancelled', notices: [] }
    case 'expired':
      return { ...base, phase: 'failed', notices: [], error: FAILURES.expired }
    case 'failed':
      return { ...base, phase: 'failed', notices: [], error: FAILURES[attempt.errorCode ?? 'protocol'] }
  }
}
