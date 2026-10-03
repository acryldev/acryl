/** What the Host composition can do for the page, so the page offers only what will work. */

export const WORKSPACE_CAPABILITIES_PATH = '/api/acryl-workspace/capabilities'

export interface WorkspaceCapabilities {
  /** The DeepSeek Harness chat (its agent) is running, so "AcrylDSH Chat" tabs can be opened and sent from. */
  readonly chat: boolean
}

/** @throws when the body is not exactly the capabilities this page understands. */
export function parseWorkspaceCapabilities(value: unknown): WorkspaceCapabilities {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('capabilities must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.chat !== 'boolean') throw new Error('capabilities.chat must be true or false')
  return { chat: record.chat }
}
