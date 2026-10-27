/**
 * What Desktop's own private routes share, on the router: the private-route rules of `acryl-loopback-http/router` under Desktop's two
 * prefixes, and an answer whose follow-up (a restart) must wait until the answer itself has gone out. Each context folder (settings,
 * startup, workspaces) builds its routes with these and the shared rules; `plugin.ts` serves them.
 */

import type { Acryl } from 'acrylblends'
import { privateApi } from 'acryl-loopback-http/router'

/** The prefixes Desktop's renderer calls its Host on: settings and preferences, and the boot report and directory picker. */
export const DESKTOP_API_PREFIXES = Object.freeze(['/api/desktop', '/_dsh/desktop'] as const)

/** Desktop's routes as one app, the shared private-route rules scoped to {@link DESKTOP_API_PREFIXES}. */
export function desktopApi(...routes: readonly Acryl[]): Acryl {
  return privateApi(DESKTOP_API_PREFIXES, ...routes)
}

/**
 * The same answer, with `after` run once its body has been handed to the connection (or the client went away first): a restart that
 * follows a "restart required" answer must not cut that answer off. The adapter writes the body as it reads it, so the last read is the
 * moment the old `res.end()` was; `after` runs on the next turn, as it did then.
 */
export function afterBody(response: Response, after: () => void): Response {
  let pending = true
  const finish = (): void => {
    if (!pending) return
    pending = false
    setImmediate(after)
  }
  const body = response.body
  if (body === null) {
    finish()
    return response
  }
  const reader = body.getReader()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read()
      if (chunk.done) {
        controller.close()
        finish()
      } else {
        controller.enqueue(chunk.value)
      }
    },
    async cancel(reason) {
      finish()
      await reader.cancel(reason)
    },
  })
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers })
}
