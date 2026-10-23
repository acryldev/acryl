import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendResponse, toRequest } from './bridge.ts'

/** The slice of the router this adapter needs; `acryl-router`'s `Router` satisfies it. */
export interface FetchRouter {
  fetch(request: Request, connection?: { readonly remoteAddress?: string | undefined }): Promise<Response>
}

/**
 * Serve one node request through the router and write the result. The request's abort signal fires when the client
 * disconnects before the response finished; the socket's peer address travels as connection info, never in the request.
 */
export async function serve(router: FetchRouter, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const controller = new AbortController()
  res.once('close', () => { if (!res.writableFinished) controller.abort() })
  const method = (req.method ?? 'GET').toUpperCase()
  let response: Response
  try {
    response = await router.fetch(toRequest(req, controller.signal), { remoteAddress: req.socket.remoteAddress })
  } catch {
    response = new Response('Internal Server Error', { status: 500 })
  }
  await sendResponse(res, response, method)
}
