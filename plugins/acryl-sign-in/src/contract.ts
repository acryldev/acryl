/** The wire contract of the sign-in routes; the Welcome window of the Desktop shell is its client. */
import type { SignInAttemptView } from 'acryl-control'

export const SIGN_IN_PROVIDERS_PATH = '/api/acryl-sign-in/providers'
export const SIGN_IN_ATTEMPT_PATH = '/api/acryl-sign-in/attempt'
export const SIGN_IN_BEGIN_PATH = '/api/acryl-sign-in/begin'
export const SIGN_IN_ANSWER_PATH = '/api/acryl-sign-in/answer'
export const SIGN_IN_CANCEL_PATH = '/api/acryl-sign-in/cancel'

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
}

export interface SignInAnswerRequest {
  readonly attemptId: string
  readonly promptId: string
  readonly value: string
}

export interface SignInCancelRequest {
  readonly attemptId: string
}
