/** Same-origin route for a workspace's brief (spec 043 T011): GET `?id=` reads it, POST `{ id, text }` saves it and rewrites the context document. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest, readJsonBody } from 'acryl-loopback-http'
import { MAX_BRIEF_CHARS, type SharedContext } from './service.ts'

export const WORKSPACE_BRIEF_PATH = '/api/acryl-workspace/brief'

export type BriefResponse =
  | { readonly ok: true, readonly id: string, readonly text: string }
  | { readonly ok: false, readonly message: string }

const ID = /^[A-Za-z0-9_-]{1,64}$/u

export async function handleBriefRequest(req: IncomingMessage, res: ServerResponse, expectedOrigin: string, shared: SharedContext): Promise<void> {
  if (req.method === 'GET') {
    if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) return finishJson(res, 403, error('forbidden'))
    const id = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('id') ?? ''
    if (!ID.test(id)) return finishJson(res, 400, { ok: false, message: 'a workspace id is required' } satisfies BriefResponse)
    return finishJson(res, 200, { ok: true, id, text: shared.brief(id) } satisfies BriefResponse, 'GET')
  }
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try { body = await readJsonBody(req, MAX_BRIEF_CHARS * 4 + 1024) } catch { return finishJson(res, 400, { ok: false, message: 'invalid request body' } satisfies BriefResponse) }
  const { id, text } = (typeof body === 'object' && body !== null ? body : {}) as { id?: unknown, text?: unknown }
  if (typeof id !== 'string' || !ID.test(id) || typeof text !== 'string') return finishJson(res, 400, { ok: false, message: 'send { id, text }' } satisfies BriefResponse)
  try {
    shared.setBrief(id, text)
    return finishJson(res, 200, { ok: true, id, text } satisfies BriefResponse)
  } catch (cause) {
    return finishJson(res, 400, { ok: false, message: cause instanceof Error ? cause.message : String(cause) } satisfies BriefResponse)
  }
}
