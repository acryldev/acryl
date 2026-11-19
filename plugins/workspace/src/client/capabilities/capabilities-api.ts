/** Same-origin browser client for what the Host composition offers. */

import { WORKSPACE_CAPABILITIES_PATH, parseWorkspaceCapabilities, type WorkspaceCapabilities } from '../../capabilities/contract.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** What a page assumes when the Host cannot say (an older Host, a failed request): everything the product always had. */
export const DEFAULT_WORKSPACE_CAPABILITIES: WorkspaceCapabilities = Object.freeze({ chat: true })

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export async function loadWorkspaceCapabilities(fetchImpl: FetchLike = (input, init) => fetch(input, init)): Promise<WorkspaceCapabilities> {
  try {
    const response = await fetchImpl(WORKSPACE_CAPABILITIES_PATH, { credentials: 'same-origin' })
    if (response.status !== 200) return DEFAULT_WORKSPACE_CAPABILITIES
    return parseWorkspaceCapabilities(await response.json())
  } catch {
    return DEFAULT_WORKSPACE_CAPABILITIES
  }
}
