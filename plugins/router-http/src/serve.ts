import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendResponse, toRequest } from './bridge.ts'

/** The slice of the router this adapter needs; `acryl-router`'s `Router` satisfies it. */
export interface FetchRouter {
  fetch(request: Request, connection?: { readonly remoteAddress?: string | undefined, readonly localPort?: number | undefined }): Promise<Response>
}

/** How long a refusal waits for a request body the handler never read. */
export const REQUEST_BODY_SETTLE_MS = 1_000

/**
 * Read and discard a request body the handler left unread (a guard's 403, a 415, a body over its limit), so the client can finish sending and
 * read the answer. Ending a response while request data is still arriving makes Node close the socket with that data pending, and the peer sees a
 * reset instead of the answer: reliably on Windows (the workspace git worktree test's read ECONNRESET) and on other systems under load. Bounded:
 * a client that stops sending waits at most `ms`, then loses the socket as before.
 */
export function settleRequestBody(req: IncomingMessage, ms: number = REQUEST_BODY_SETTLE_MS): Promise<void> {
  if (req.readableEnded || req.destroyed) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      req.off('end', done)
      req.off('close', done)
      req.off('error', done)
      resolve()
    }
    timer = setTimeout(done, ms)
    timer.unref?.()
    req.once('end', done)
    req.once('close', done)
    req.once('error', done)
    req.resume()
  })
}

/**
 * Serve one node request through the router and write the result. The request's abort signal fires when the client
 * disconnects before the response finished; the socket's peer address and local port travel as connection info, never in the request.
 */
export async function serve(router: FetchRouter, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const controller = new AbortController()
  res.once('close', () => { if (!res.writableFinished) controller.abort() })
  const method = (req.method ?? 'GET').toUpperCase()
  let response: Response
  try {
    response = await router.fetch(toRequest(req, controller.signal), { remoteAddress: req.socket.remoteAddress, localPort: req.socket.localPort })
  } catch {
    response = new Response('Internal Server Error', { status: 500 })
  }
  // The handler may have answered without reading the body; let the client finish sending before the answer ends the connection.
  if (method !== 'GET' && method !== 'HEAD') await settleRequestBody(req)
  await sendResponse(res, response, method)
}
