/**
 * The tool gateway's wire contract: the ACRYL extension tools (verify, install, list, remove a plugin, look up the docs) offered to agents that
 * are not the DSH chat. Two faces over one gateway: plain JSON for `acryl control tool ...` and any agent with a shell, and MCP over HTTP for
 * agents that speak it (Claude Code, Codex). Both need the instance secret.
 */

export const TOOLS_PATH = '/api/acryl-agent-control/online/tools'
export const MCP_PATH = '/api/acryl-agent-control/mcp'

/** The tools exposed unless the profile says otherwise: extending ACRYL, never the shell or the file system. */
export const DEFAULT_EXPOSED_TOOLS: readonly string[] = [
  'acryl_extension_lookup',
  'acryl_verify_plugin',
  'acryl_install_plugin',
  'acryl_list_plugins',
  'acryl_remove_plugin',
  'acryl_prepare_publish',
  'acryl_plugin_list',
  'acryl_plugin_set_enabled',
]

export interface GatewayTool {
  readonly name: string
  readonly description: string
  /** JSON Schema of the arguments, as the tool declares it. */
  readonly inputSchema: Readonly<Record<string, unknown>>
}

export type GatewayListResponse = { readonly ok: true; readonly tools: readonly GatewayTool[] }

export type GatewayCallResponse =
  | { readonly ok: true; readonly isError: boolean; readonly text: string }
  | { readonly ok: false; readonly code: 'not-exposed' | 'unknown-tool' | 'invalid'; readonly message: string }

export class GatewayRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatewayRequestError'
  }
}

/** @throws GatewayRequestError unless the body is exactly `{ name, arguments? }`. */
export function parseGatewayCall(value: unknown): { readonly name: string; readonly arguments: Record<string, unknown> } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GatewayRequestError('the request must be an object with a name')
  const record = value as Record<string, unknown>
  const extra = Object.keys(record).find(key => key !== 'name' && key !== 'arguments')
  if (extra !== undefined) throw new GatewayRequestError(`unknown field "${extra}"`)
  if (typeof record.name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(record.name)) throw new GatewayRequestError('name must be a tool name')
  const args = record.arguments ?? {}
  if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new GatewayRequestError('arguments must be an object')
  return { name: record.name, arguments: args as Record<string, unknown> }
}
