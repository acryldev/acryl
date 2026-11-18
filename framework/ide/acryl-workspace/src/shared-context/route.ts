/** A workspace's brief (spec 043 T011), for the app's own page only: GET `?id=` reads it, POST `{ id, text }` saves it and rewrites the context document. */

import { Acryl } from 'acrylblends'
import { bodyLimit } from 'acrylblends/body-limit'
import { INVALID_JSON, ownPage, readJson, WORKSPACE_API_PREFIX } from '../private-route.ts'
import { MAX_BRIEF_CHARS, type SharedContext } from './service.ts'

export const WORKSPACE_BRIEF_PATH = `${WORKSPACE_API_PREFIX}/brief`

export type BriefResponse =
  | { readonly ok: true, readonly id: string, readonly text: string }
  | { readonly ok: false, readonly message: string }

const ID = /^[A-Za-z0-9_-]{1,64}$/u

export function briefRoutes(shared: SharedContext): Acryl {
  return new Acryl()
    .get(WORKSPACE_BRIEF_PATH, ownPage, (c) => {
      const id = c.req.query('id') ?? ''
      if (!ID.test(id)) return c.json({ ok: false, message: 'a workspace id is required' } satisfies BriefResponse, 400)
      return c.json({ ok: true, id, text: shared.brief(id) } satisfies BriefResponse)
    })
    .post(
      WORKSPACE_BRIEF_PATH,
      ownPage,
      bodyLimit({ maxSize: MAX_BRIEF_CHARS * 4 + 1024, onError: c => c.json({ ok: false, message: 'the brief is too long' } satisfies BriefResponse, 413) }),
      async (c) => {
        const body = await readJson(c)
        if (body === INVALID_JSON) return c.json({ ok: false, message: 'invalid request body' } satisfies BriefResponse, 400)
        const { id, text } = (typeof body === 'object' && body !== null ? body : {}) as { id?: unknown, text?: unknown }
        if (typeof id !== 'string' || !ID.test(id) || typeof text !== 'string') return c.json({ ok: false, message: 'send { id, text }' } satisfies BriefResponse, 400)
        try {
          shared.setBrief(id, text)
          return c.json({ ok: true, id, text } satisfies BriefResponse)
        } catch (cause) {
          return c.json({ ok: false, message: cause instanceof Error ? cause.message : String(cause) } satisfies BriefResponse, 400)
        }
      },
    )
}
