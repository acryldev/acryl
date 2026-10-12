/**
 * The registry's view as a server-sent event stream, so every page follows a change it did not make (an agent's workspace tool, another
 * window). One `data:` message with the whole view on connect and after each change; a comment line keeps idle connections open.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isSameOriginLoopbackRequest } from 'acryl-loopback-http'
import type { ProjectRegistryView } from './contract.ts'
import type { ProjectRegistry } from './registry.ts'

const KEEP_ALIVE_MS = 25_000

export interface ProjectEvents {
  handle(req: IncomingMessage, res: ServerResponse): void
  /** End every open stream and stop following the registry. */
  close(): void
}

export function createProjectEvents(registry: ProjectRegistry, expectedOrigin: string): ProjectEvents {
  const clients = new Set<ServerResponse>()
  const send = (res: ServerResponse, view: ProjectRegistryView): void => { res.write(`data: ${JSON.stringify(view)}\n\n`) }
  const stopFollowing = registry.onChange((view) => { for (const res of clients) send(res, view) })
  const keepAlive = setInterval(() => { for (const res of clients) res.write(': keep-alive\n\n') }, KEEP_ALIVE_MS)
  keepAlive.unref()
  return {
    handle(req, res) {
      if (req.method !== 'GET') { finishJson(res, 405, error('method not allowed'), 'GET'); return }
      if (!isSameOriginLoopbackRequest(req, expectedOrigin, false)) { finishJson(res, 403, error('forbidden')); return }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      clients.add(res)
      res.on('close', () => { clients.delete(res) })
      send(res, registry.view())
    },
    close() {
      stopFollowing()
      clearInterval(keepAlive)
      for (const res of clients) res.end()
      clients.clear()
    },
  }
}
