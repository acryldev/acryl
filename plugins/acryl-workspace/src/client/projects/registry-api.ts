/** Same-origin browser client for the project registry (the Host owns the list; see `projects/contract.ts`). */

import {
  WORKSPACE_PROJECTS_EVENTS_PATH,
  WORKSPACE_PROJECTS_PATH,
  parseProjectRegistryView,
  type ProjectRegistryView,
  type ProjectRequest,
  type ProjectResponse,
} from '../../projects/contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ProjectRegistryApi {
  load(): Promise<ProjectRegistryView>
  /** @throws an Error whose message says what to fix (the Host's own refusal text). */
  send(request: ProjectRequest): Promise<ProjectRegistryView>
}

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createProjectRegistryApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): ProjectRegistryApi {
  async function read(response: Response): Promise<ProjectRegistryView> {
    let body: unknown = null
    try { body = await response.json() } catch { body = null }
    const answer = body as Partial<ProjectResponse> | null
    if (answer?.ok === true && answer.view !== undefined) return parseProjectRegistryView(answer.view)
    if (answer?.ok === false && typeof answer.message === 'string') throw new Error(answer.message)
    throw new Error(`the request failed (HTTP ${String(response.status)})`)
  }
  return {
    load: async () => read(await fetchImpl(WORKSPACE_PROJECTS_PATH, { credentials: 'same-origin' })),
    send: async request => read(await fetchImpl(WORKSPACE_PROJECTS_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })),
  }
}

/** What the page needs of `EventSource` (injectable for tests). */
export interface EventSourceLike {
  addEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void
  close(): void
}

/**
 * Follow the Host's registry as it changes: every view it pushes goes to `receive`; a message that does not validate is ignored. The
 * browser reconnects a dropped stream by itself.
 * @returns disposer, for one owning effect.
 */
export function followProjectRegistry(
  receive: (view: ProjectRegistryView) => void,
  open: (url: string) => EventSourceLike = url => new EventSource(url),
): () => void {
  const source = open(WORKSPACE_PROJECTS_EVENTS_PATH)
  source.addEventListener('message', (event) => {
    let view: ProjectRegistryView
    try { view = parseProjectRegistryView(JSON.parse(event.data)) } catch { return }
    receive(view)
  })
  return () => { source.close() }
}
