/** What the Host composition can do for the page, so the page offers only what will work. */

export const WORKSPACE_CAPABILITIES_PATH = '/api/acryl-workspace/capabilities'

export interface WorkspaceCapabilities {
  /** The DeepSeek Harness chat (its agent) is running, so "AcrylDSH Chat" tabs can be opened and sent from. */
  readonly chat: boolean
  /**
   * Where the Host serves this app's own page, as a path on the frame's origin (`/app` in the ACRYL frame). Present only when the Host hosts an
   * app: the frame then opens that page in a browser tile on first run, instead of an empty canvas.
   */
  readonly appPage?: string
  /** The app's folder: the worktree the frame opens on first run, so the app and its chats share one tab set. */
  readonly appRoot?: string
  /** The app's name, used as the tile's title (`my-app`), instead of the address's host. */
  readonly appName?: string
}

/** @throws when the body is not exactly the capabilities this page understands. */
export function parseWorkspaceCapabilities(value: unknown): WorkspaceCapabilities {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('capabilities must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.chat !== 'boolean') throw new Error('capabilities.chat must be true or false')
  const appPage = record.appPage
  if (appPage !== undefined && (typeof appPage !== 'string' || !appPage.startsWith('/'))) throw new Error('capabilities.appPage must be an absolute path')
  const appRoot = record.appRoot
  if (appRoot !== undefined && (typeof appRoot !== 'string' || appRoot.length === 0)) throw new Error('capabilities.appRoot must be a non-empty path')
  const appName = record.appName
  if (appName !== undefined && (typeof appName !== 'string' || appName.length === 0)) throw new Error('capabilities.appName must be a non-empty name')
  return {
    chat: record.chat,
    ...(appPage === undefined ? {} : { appPage }),
    ...(appRoot === undefined ? {} : { appRoot }),
    ...(appName === undefined ? {} : { appName }),
  }
}
