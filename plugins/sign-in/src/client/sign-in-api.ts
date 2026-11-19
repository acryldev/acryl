/** Same-origin browser client for the sign-in routes (`../contract.ts`). */

import type { SignInAttemptView } from 'acryl-control'
import {
  SIGN_IN_ANSWER_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_CANCEL_PATH, SIGN_IN_PROVIDERS_PATH,
  type SignInAttemptResponse, type SignInProvidersResponse,
} from '../contract.ts'

export interface SignInApi {
  providers(): Promise<SignInProvidersResponse>
  attempt(): Promise<SignInAttemptView | null>
  begin(key: string, method: string | undefined, locale?: string): Promise<SignInAttemptView>
  answer(attemptId: string, promptId: string, value: string): Promise<SignInAttemptView>
  cancel(attemptId: string): Promise<SignInAttemptView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** The Host's refusal in words (`{ error }`), or the status when it gave none. */
async function failure(response: Response): Promise<Error> {
  let said: unknown
  try { said = ((await response.json()) as { error?: unknown }).error } catch { said = undefined }
  return new Error(typeof said === 'string' && said !== '' ? said : `The sign-in service answered HTTP ${String(response.status)}.`)
}

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createSignInApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): SignInApi {
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetchImpl(path, { method: 'GET', credentials: 'same-origin' })
    if (!response.ok) throw await failure(response)
    return await response.json() as T
  }
  const post = async (path: string, body: unknown): Promise<SignInAttemptView> => {
    const response = await fetchImpl(path, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) throw await failure(response)
    return (await response.json() as SignInAttemptResponse).attempt as SignInAttemptView
  }
  return {
    providers: () => get<SignInProvidersResponse>(SIGN_IN_PROVIDERS_PATH),
    attempt: async () => (await get<SignInAttemptResponse>(SIGN_IN_ATTEMPT_PATH)).attempt,
    begin: (key, method, locale) => post(SIGN_IN_BEGIN_PATH, { key, ...method === undefined ? {} : { method }, ...locale === undefined ? {} : { locale } }),
    answer: (attemptId, promptId, value) => post(SIGN_IN_ANSWER_PATH, { attemptId, promptId, value }),
    cancel: attemptId => post(SIGN_IN_CANCEL_PATH, { attemptId }),
  }
}
