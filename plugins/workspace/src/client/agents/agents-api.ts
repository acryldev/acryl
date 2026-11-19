/** Same-origin browser client for the custom agent catalog. */

import {
  WORKSPACE_AGENT_SETTINGS_PATH,
  WORKSPACE_AGENTS_PATH,
  WORKSPACE_AGENTS_REMOVE_PATH,
  parseAgentSettingsView,
  parseAgentsView,
  type AgentSettingsView,
} from '../../agents/contract.ts'
import type { CustomAgent } from '../../agents/definition.ts'
import type { PreferencesPatch } from '../../agents/preferences.ts'

export interface WorkspaceAgentsApi {
  list(): Promise<readonly CustomAgent[]>
  /** @throws an Error whose message says what to fix (the Host's own refusal text). */
  add(agent: CustomAgent): Promise<readonly CustomAgent[]>
  remove(id: string): Promise<readonly CustomAgent[]>
  /** The settings view, with a fresh check of which programs are installed. */
  settings(): Promise<AgentSettingsView>
  /** @throws an Error whose message says what to fix. */
  change(patch: PreferencesPatch): Promise<AgentSettingsView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createWorkspaceAgentsApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): WorkspaceAgentsApi {
  async function sendJson(path: string, init: RequestInit): Promise<unknown> {
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
    return body
  }
  const send = async (path: string, init: RequestInit): Promise<readonly CustomAgent[]> => parseAgentsView(await sendJson(path, init)).agents
  const post = (path: string, payload: object): Promise<readonly CustomAgent[]> =>
    send(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })

  return {
    list: () => send(WORKSPACE_AGENTS_PATH, { method: 'GET' }),
    add: agent => post(WORKSPACE_AGENTS_PATH, { agent }),
    remove: id => post(WORKSPACE_AGENTS_REMOVE_PATH, { id }),
    settings: async () => parseAgentSettingsView(await sendJson(WORKSPACE_AGENT_SETTINGS_PATH, { method: 'GET' })),
    change: async patch => parseAgentSettingsView(await sendJson(WORKSPACE_AGENT_SETTINGS_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })),
  }
}
