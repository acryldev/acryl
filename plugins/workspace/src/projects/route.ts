/** The project registry, for the app's own page only: the list, its changes, and a stream of the list as it changes. */

import { Acryl } from 'acrylblends'
import { streamSSE } from 'acrylblends/streaming'
import { INVALID_JSON, failure, jsonBody, ownPage, readJson, type ReportError } from '../private-route.ts'
import {
  ProjectRequestError,
  WORKSPACE_PROJECTS_EVENTS_PATH,
  WORKSPACE_PROJECTS_PATH,
  parseProjectRequest,
  type ProjectRegistryView,
  type ProjectRequest,
  type ProjectResponse,
} from './contract.ts'
import { ProjectFolderError, WorkspaceError, type ProjectRegistry } from './registry.ts'

/** A comment line this often keeps an idle event stream open through proxies and the browser's own timeout. */
const KEEP_ALIVE_MS = 25_000

/** One timer for every open stream, owned by the plugin's effect rather than by a request: `stop()` is its disposer. */
export interface KeepAlive {
  onBeat(listener: () => void): () => void
  stop(): void
}

export function createKeepAlive(intervalMs: number = KEEP_ALIVE_MS): KeepAlive {
  const listeners = new Set<() => void>()
  const timer = setInterval(() => { for (const listener of listeners) listener() }, intervalMs)
  timer.unref()
  return {
    onBeat(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    stop() {
      clearInterval(timer)
      listeners.clear()
    },
  }
}

function change(registry: ProjectRegistry, request: ProjectRequest): Promise<ProjectRegistryView> {
  switch (request.op) {
    case 'add': return registry.add(request.path)
    case 'remove': return registry.remove(request.path)
    case 'adopt': return registry.adopt(request.paths)
    case 'create-workspace': return registry.createWorkspace(request)
    case 'switch-workspace': return registry.switchWorkspace(request.id)
    case 'rename-workspace': return registry.renameWorkspace(request.id, request.name)
    case 'delete-workspace': return registry.deleteWorkspace(request.id)
  }
}

/**
 * GET `projects` (the list) and POST `{ op, ... }` to add, remove or adopt, a refusal being a 400 whose message says what to fix. GET
 * `projects/events` is a server-sent event stream, so every page follows a change it did not make (an agent's workspace tool, another window):
 * one `data:` message with the whole view on connect and after each change. A stream ends when its page goes away or this plugin unloads.
 */
export function projectRoutes(registry: ProjectRegistry, keepAlive: KeepAlive, reportError: ReportError): Acryl {
  return new Acryl()
    .get(WORKSPACE_PROJECTS_PATH, ownPage, c => c.json({ ok: true, view: registry.view() } satisfies ProjectResponse))
    .post(WORKSPACE_PROJECTS_PATH, ownPage, jsonBody(), async (c) => {
      const body = await readJson(c)
      if (body === INVALID_JSON) return c.json({ ok: false, code: 'invalid', message: 'invalid request body' } satisfies ProjectResponse, 400)
      try {
        const view = await change(registry, parseProjectRequest(body))
        return c.json({ ok: true, view } satisfies ProjectResponse)
      } catch (cause) {
        if (cause instanceof ProjectRequestError) return c.json({ ok: false, code: 'invalid', message: cause.message } satisfies ProjectResponse, 400)
        if (cause instanceof ProjectFolderError) return c.json({ ok: false, code: 'not-a-folder', message: cause.message } satisfies ProjectResponse, 400)
        if (cause instanceof WorkspaceError) return c.json({ ok: false, code: 'workspace', message: cause.message } satisfies ProjectResponse, 400)
        reportError('change the project list', cause)
        return c.json(failure('the project list could not be saved'), 500)
      }
    })
    .get(WORKSPACE_PROJECTS_EVENTS_PATH, ownPage, c => streamSSE(c, async (stream) => {
      const ended = new Promise<void>(resolve => { stream.onAbort(resolve) })
      // Writes are asynchronous; chaining them keeps messages in the order the list changed.
      let queue: Promise<unknown> = Promise.resolve()
      const enqueue = (write: () => Promise<unknown>): void => { queue = queue.then(write).catch(() => {}) }
      const send = (view: ProjectRegistryView): void => { enqueue(() => stream.writeSSE({ data: JSON.stringify(view) })) }
      send(registry.view())
      const stopFollowing = registry.onChange(send)
      const stopBeating = keepAlive.onBeat(() => { enqueue(() => stream.write(': keep-alive\n\n')) })
      try {
        await ended
      } finally {
        stopBeating()
        stopFollowing()
      }
    }))
}
