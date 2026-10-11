/** Strict same-origin loopback routes for signing in. No response carries a secret; an answer is handed to the flow and dropped. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SignInAttemptError } from 'acryl-control'
import { INVALID_BODY, error, finishJson, isSameOriginLoopbackRequest, parseJsonPostBody } from 'acryl-loopback-http'
import type { SignInController } from './controller.ts'
import { SignInRequestError } from './controller.ts'
import type { SignInAnswerRequest, SignInBeginRequest, SignInCancelRequest } from './contract.ts'

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

type Reporter = (operation: string, cause: unknown) => void

function refusal(cause: unknown): string | undefined {
  return cause instanceof SignInAttemptError || cause instanceof SignInRequestError ? cause.message : undefined
}

export async function handleProvidersRequest(req: IncomingMessage, res: ServerResponse, origin: string, controller: SignInController, report: Reporter = () => {}): Promise<void> {
  if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
  if (!isSameOriginLoopbackRequest(req, origin, false)) return finishJson(res, 403, error('forbidden'))
  try {
    finishJson(res, 200, await controller.providers())
  } catch (cause) {
    report('list sign-in providers', cause)
    finishJson(res, 500, error('sign-in unavailable'))
  }
}

export async function handleAttemptRequest(req: IncomingMessage, res: ServerResponse, origin: string, controller: SignInController, report: Reporter = () => {}): Promise<void> {
  if (req.method !== 'GET') return finishJson(res, 405, error('method not allowed'), 'GET')
  if (!isSameOriginLoopbackRequest(req, origin, false)) return finishJson(res, 403, error('forbidden'))
  try {
    finishJson(res, 200, { attempt: await controller.attempt() })
  } catch (cause) {
    report('read the sign-in', cause)
    finishJson(res, 500, error('sign-in unavailable'))
  }
}

/** A POST route: same-origin JSON in, the attempt out. `run` throws a refusal for a request the harness cannot honour. */
function postRoute<T>(
  parse: (value: unknown) => T | undefined,
  run: (controller: SignInController, request: T) => unknown,
  operation: string,
) {
  return async (req: IncomingMessage, res: ServerResponse, origin: string, controller: SignInController, report: Reporter = () => {}): Promise<void> => {
    if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
    if (!isSameOriginLoopbackRequest(req, origin, true)) return finishJson(res, 403, error('forbidden'))
    const value = await parseJsonPostBody(req, res)
    if (value === INVALID_BODY) return
    const request = parse(value)
    if (request === undefined) return finishJson(res, 400, error(`invalid ${operation} request`))
    try {
      finishJson(res, 200, { attempt: await run(controller, request) })
    } catch (cause) {
      const reason = refusal(cause)
      if (reason !== undefined) return finishJson(res, 409, error(reason))
      report(operation, cause)
      finishJson(res, 500, error('sign-in unavailable'))
    }
  }
}

export const handleBeginRequest = postRoute(parseBegin, (controller, request) => controller.begin(request.key, request.method, request.locale === undefined ? {} : { locale: request.locale }), 'begin sign-in')
export const handleAnswerRequest = postRoute(parseAnswer, (controller, request) => controller.answer(request.attemptId, request.promptId, request.value), 'answer sign-in')
export const handleCancelRequest = postRoute(parseCancel, (controller, request) => controller.cancel(request.attemptId), 'cancel sign-in')
