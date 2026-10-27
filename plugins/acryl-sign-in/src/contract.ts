/** The wire contract of the sign-in routes; the account sign-in card on Settings > Models is its client. */
import type { SignInAttemptView } from 'acryl-control'

/** Every sign-in route lives under this prefix, the one the Host's Web adapter mounts for this plugin. */
export const SIGN_IN_API_PREFIX = '/api/acryl-sign-in'
export const SIGN_IN_PROVIDERS_PATH = `${SIGN_IN_API_PREFIX}/providers`
export const SIGN_IN_ATTEMPT_PATH = `${SIGN_IN_API_PREFIX}/attempt`
export const SIGN_IN_BEGIN_PATH = `${SIGN_IN_API_PREFIX}/begin`
export const SIGN_IN_ANSWER_PATH = `${SIGN_IN_API_PREFIX}/answer`
export const SIGN_IN_CANCEL_PATH = `${SIGN_IN_API_PREFIX}/cancel`

export interface SignInMethodView {
  readonly id: string
  readonly label: string
}

/** One provider that can be signed into. */
export interface SignInProviderView {
  /** The credential record the sign-in writes; the id every other route takes. */
  readonly key: string
  readonly label: string
  /** Most preferred first. */
  readonly methods: readonly SignInMethodView[]
  /** A credential is stored for this provider. */
  readonly configured: boolean
}

export interface SignInProvidersResponse {
  readonly providers: readonly SignInProviderView[]
  /** At least one provider is signed into (the Welcome window is not needed). */
  readonly signedIn: boolean
}

export interface SignInAttemptResponse {
  readonly attempt: SignInAttemptView | null
}

export interface SignInBeginRequest {
  readonly key: string
  readonly method?: string
  /** The UI's language (BCP 47), for a provider page that is localized (DeepSeek's). */
  readonly locale?: string
}

export interface SignInAnswerRequest {
  readonly attemptId: string
  readonly promptId: string
  readonly value: string
}

export interface SignInCancelRequest {
  readonly attemptId: string
}
