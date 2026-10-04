/** Same-origin browser client for the project registry (the Host owns the list; see `projects/contract.ts`). */

import {
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
