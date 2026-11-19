/**
 * The private Versions routes: the log, a save, a restore and a share, for the app's own page only.
 *
 * Every route answers the shared error mapping: a bad request is 400, a directory that is not a repository
 * 404, a refusal by the current state 409, and an unexpected git failure 500 with a fixed reason.
 */

import { Acryl, type Context } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, ownPage, privateApi, readJson, type ReportError } from 'acryl-loopback-http/router'
import {
  MAX_LOG_LIMIT,
  VERSIONS_LOG_PATH,
  VERSIONS_RESTORE_PATH,
  VERSIONS_SAVE_PATH,
  VERSIONS_SHARE_PATH,
  VERSIONS_SHARE_PLAN_PATH,
  VERSIONS_API_PREFIX,
  parseSharePlan,
  type VersionsSharePlan,
} from './contract.ts'
import { VersionsGitError } from './git/errors.ts'
import type { Versions } from './versions.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The `limit` query value: absent is the default, and anything but a whole number in 1..200 is refused. */
export function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  if (!/^\d+$/.test(value)) return Number.NaN
  const limit = Number(value)
  return limit >= 1 && limit <= MAX_LOG_LIMIT ? limit : Number.NaN
}

interface SaveRequest {
  readonly path: string
  readonly message: string
}

interface RestoreRequest {
  readonly path: string
  readonly hash: string
  readonly message?: string
}

interface ShareRequest {
  readonly path: string
  readonly confirmed: VersionsSharePlan
}

function parseSave(body: Record<string, unknown>): SaveRequest | undefined {
  if (Object.keys(body).length !== 2 || typeof body.path !== 'string' || body.path === '' || typeof body.message !== 'string') {
    return undefined
  }
  return { path: body.path, message: body.message }
}

function parseRestore(body: Record<string, unknown>): RestoreRequest | undefined {
  const keys = Object.keys(body)
  if (
    keys.length !== (body.message === undefined ? 2 : 3) ||
    typeof body.path !== 'string' ||
    body.path === '' ||
    typeof body.hash !== 'string' ||
    (body.message !== undefined && typeof body.message !== 'string')
  ) {
    return undefined
  }
  return body.message === undefined
    ? { path: body.path, hash: body.hash }
    : { path: body.path, hash: body.hash, message: body.message }
}

function parseSharePlanRequest(body: Record<string, unknown>): { path: string } | undefined {
  if (Object.keys(body).length !== 1 || typeof body.path !== 'string' || body.path === '') return undefined
  return { path: body.path }
}

/** A share carries the plan the person confirmed; a request without one is refused, so nothing is pushed in one call. */
function parseShare(body: Record<string, unknown>): ShareRequest | undefined {
  if (Object.keys(body).length !== 2 || typeof body.path !== 'string' || body.path === '') return undefined
  const confirmed = parseSharePlan(body.confirmed)
  return confirmed === undefined ? undefined : { path: body.path, confirmed }
}

/**
 * The Versions app, under the shared private-route rules: a read only from the app's own page, a change only
 * with a small JSON body, and 405 with `Allow` for another method.
 */
export function versionsRoutes(versions: Versions, report: ReportError = () => {}): Acryl {
  const answer = async (c: Context, operation: string, compute: () => Promise<object>): Promise<Response> => {
    try {
      return c.json(await compute())
    } catch (cause) {
      if (cause instanceof VersionsGitError) {
        if (cause.kind === 'invalid') return c.json(error(cause.message), 400)
        if (cause.kind === 'not-repo') return c.json(error('not a git repository'), 404)
        if (cause.kind === 'conflict') return c.json(error(cause.message), 409)
      }
      report(operation, cause)
      return c.json(error('git request failed'), 500)
    }
  }
  /** A small JSON body, parsed strictly, then one git operation answered with its result. */
  const write = <T>(operation: string, invalid: string, parse: (body: Record<string, unknown>) => T | undefined, compute: (input: T) => Promise<object>) =>
    async (c: Context): Promise<Response> => {
      const body = await readJson(c)
      const input = body === INVALID_JSON || !isRecord(body) ? undefined : parse(body)
      if (input === undefined) return c.json(error(invalid), 400)
      return answer(c, operation, () => compute(input))
    }

  const app = new Acryl()
  app.get(VERSIONS_LOG_PATH, ownPage, (c) => {
    const path = c.req.query('path')
    if (path === undefined || path === '') return c.json(error('missing path'), 400)
    const limit = parseLimit(c.req.query('limit'))
    if (limit !== undefined && Number.isNaN(limit)) return c.json(error('limit must be a whole number from 1 to 200'), 400)
    return answer(c, 'read versions log', () => versions.log(path, limit))
  })
  app.post(VERSIONS_SAVE_PATH, ownPage, jsonBody(), write('save a version', 'invalid save request', parseSave,
    input => versions.save(input.path, input.message)))
  app.post(VERSIONS_RESTORE_PATH, ownPage, jsonBody(), write('restore a version', 'invalid restore request', parseRestore,
    input => versions.restore(input.path, input.hash, input.message)))
  app.post(VERSIONS_SHARE_PLAN_PATH, ownPage, jsonBody(), write('plan a share', 'invalid share plan request', parseSharePlanRequest,
    input => versions.planShare(input.path)))
  app.post(VERSIONS_SHARE_PATH, ownPage, jsonBody(), write('share the branch', 'a share is sent only after the person confirms its plan', parseShare,
    input => versions.share(input.path, input.confirmed)))
  return privateApi(VERSIONS_API_PREFIX, app)
}
