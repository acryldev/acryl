/** Same-origin browser client for the custom agent catalog. */

import {
  WORKSPACE_AGENTS_PATH,
  WORKSPACE_AGENTS_REMOVE_PATH,
  parseAgentsView,
} from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'

export interface WorkspaceAgentsApi {
  list(): Promise<readonly CustomAgent[]>
  /** @throws an Error whose message says what to fix (the Host's own refusal text). */
  add(agent: CustomAgent): Promise<readonly CustomAgent[]>
  remove(id: string): Promise<readonly CustomAgent[]>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createWorkspaceAgentsApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): WorkspaceAgentsApi {
  async function send(path: string, init: RequestInit): Promise<readonly CustomAgent[]> {
    const response = await fetchImpl(path, { credentials: 'same-origin', ...init })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    if (response.status !== 200) {
      throw new Error(typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `the request failed (HTTP ${String(response.status)})`)
    }
    return parseAgentsView(body).agents
  }
  const post = (path: string, payload: object): Promise<readonly CustomAgent[]> =>
    send(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })

  return {
    list: () => send(WORKSPACE_AGENTS_PATH, { method: 'GET' }),
    add: agent => post(WORKSPACE_AGENTS_PATH, { agent }),
    remove: id => post(WORKSPACE_AGENTS_REMOVE_PATH, { id }),
  }
}
