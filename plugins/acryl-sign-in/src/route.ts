/** Strict same-origin loopback routes for signing in. No response carries a secret; an answer is handed to the flow and dropped. */
import { Acryl } from 'acrylblends'
import { SignInAttemptError } from 'acryl-control'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, jsonContent, ownPage, privateApi, readJson, type ReportError } from 'acryl-loopback-http/router'
import type { SignInController } from './controller.ts'
import { SignInRequestError } from './controller.ts'
import {
  SIGN_IN_ANSWER_PATH, SIGN_IN_API_PREFIX, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_CANCEL_PATH, SIGN_IN_PROVIDERS_PATH,
  type SignInAnswerRequest, type SignInBeginRequest, type SignInCancelRequest,
} from './contract.ts'

const MAX_FIELD_LENGTH = 512
/** An API key, a pasted authorization code or a redirect URL; far below the body limit, far above any real one. */
const MAX_ANSWER_LENGTH = 8192

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function parseBegin(value: unknown): SignInBeginRequest | undefined {
  const body = record(value)
  if (body === undefined || !onlyKeys(body, ['key', 'method', 'locale'])) return undefined
  const key = text(body.key, MAX_FIELD_LENGTH)
  if (key === undefined) return undefined
  const method = body.method === undefined ? undefined : text(body.method, MAX_FIELD_LENGTH)
  if (body.method !== undefined && method === undefined) return undefined
  // A BCP 47 tag, for the language of DeepSeek's sign-in page.
  const locale = body.locale === undefined ? undefined : typeof body.locale === 'string' && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,4}$/u.test(body.locale) ? body.locale : null
  if (locale === null) return undefined
  return { key, ...method === undefined ? {} : { method }, ...locale === undefined ? {} : { locale } }
}

function parseAnswer(value: unknown): SignInAnswerRequest | undefined {
  const body = record(value)
  if (body === undefined || !onlyKeys(body, ['attemptId', 'promptId', 'value'])) return undefined
  const attemptId = text(body.attemptId, MAX_FIELD_LENGTH)
  const promptId = text(body.promptId, MAX_FIELD_LENGTH)
  const answer = text(body.value, MAX_ANSWER_LENGTH)
  return attemptId === undefined || promptId === undefined || answer === undefined ? undefined : { attemptId, promptId, value: answer }
}

function parseCancel(value: unknown): SignInCancelRequest | undefined {
  const body = record(value)
  if (body === undefined || !onlyKeys(body, ['attemptId'])) return undefined
  const attemptId = text(body.attemptId, MAX_FIELD_LENGTH)
  return attemptId === undefined ? undefined : { attemptId }
}

function refusal(cause: unknown): string | undefined {
  return cause instanceof SignInAttemptError || cause instanceof SignInRequestError ? cause.message : undefined
}

/**
 * The five sign-in routes as one app, under the shared private-route rules: only the app's own page (a read may carry same-origin fetch
 * metadata instead of `Origin`, a change must carry the exact `Origin`), 405 with `Allow` for another method, and for a change a JSON
 * body (415 otherwise) of at most 16 KiB (413). A refusal the harness explains is 409 with its reason; anything else is reported and 500.
 */
export function signInRoutes(controller: SignInController, report: ReportError = () => {}): Acryl {
  const app = new Acryl()
  app.get(SIGN_IN_PROVIDERS_PATH, ownPage, async (c) => {
    try {
      return c.json(await controller.providers())
    } catch (cause) {
      report('list sign-in providers', cause)
      return c.json(error('sign-in unavailable'), 500)
    }
  })
  app.get(SIGN_IN_ATTEMPT_PATH, ownPage, async (c) => {
    try {
      return c.json({ attempt: await controller.attempt() })
    } catch (cause) {
      report('read the sign-in', cause)
      return c.json(error('sign-in unavailable'), 500)
    }
  })

  /** A change: same-origin JSON in, the attempt out. `run` throws a refusal for a request the harness cannot honour. */
  const change = <T>(path: string, parse: (value: unknown) => T | undefined, run: (request: T) => unknown, operation: string): void => {
    app.post(path, ownPage, jsonContent, jsonBody(), async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return c.json(error('invalid JSON request'), 400)
      const request = parse(value)
      if (request === undefined) return c.json(error(`invalid ${operation} request`), 400)
      try {
        return c.json({ attempt: await run(request) })
      } catch (cause) {
        const reason = refusal(cause)
        if (reason !== undefined) return c.json(error(reason), 409)
        report(operation, cause)
        return c.json(error('sign-in unavailable'), 500)
      }
    })
  }
  change(SIGN_IN_BEGIN_PATH, parseBegin, request => controller.begin(request.key, request.method, request.locale === undefined ? {} : { locale: request.locale }), 'begin sign-in')
  change(SIGN_IN_ANSWER_PATH, parseAnswer, request => controller.answer(request.attemptId, request.promptId, request.value), 'answer sign-in')
  change(SIGN_IN_CANCEL_PATH, parseCancel, request => controller.cancel(request.attemptId), 'cancel sign-in')

  return privateApi(SIGN_IN_API_PREFIX, app)
}
