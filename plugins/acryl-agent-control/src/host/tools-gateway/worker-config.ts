/**
 * The MCP config a Claude worker is started with, so the agent the app runs for you can extend ACRYL through the same gateway an outside agent
 * uses. A file (private, `0600`) rather than a command line: the secret must not show in a process listing. Written when the gateway is up, removed
 * when it is not.
 */

import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function workerMcpConfigPath(appHome: string): string {
  return join(appHome, 'agent-workers', 'claude-mcp.json')
}

/** @returns the path to hand to `claude --mcp-config`. */
export function writeWorkerMcpConfig(appHome: string, url: string, secret: string): string {
  const path = workerMcpConfigPath(appHome)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify({ mcpServers: { acryl: { type: 'http', url, headers: { Authorization: `Bearer ${secret}` } } } }), { mode: 0o600 })
  chmodSync(path, 0o600)
  return path
}

export function removeWorkerMcpConfig(appHome: string): void {
  rmSync(workerMcpConfigPath(appHome), { force: true })
}

/** The arguments that give a Claude worker the gateway: the server is named `acryl`, and its tools are allowed (that is the point of the gateway). */
export function workerMcpArgs(configPath: string): readonly string[] {
  return ['--mcp-config', configPath, '--allowedTools', 'mcp__acryl']
}

/**
 * The folder holding the extension docs and examples, read off the gateway's own lookup answer (its paths are absolute, under `<package>/docs/`). A
 * worker works in its own folder and could not otherwise read what `acryl_extension_lookup` points it to. `undefined` when the lookup says nothing usable.
 */
export function docsRootFromLookup(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { docs?: Array<{ path?: unknown }> }
    const path = parsed.docs?.find(doc => typeof doc.path === 'string')?.path
    if (typeof path !== 'string') return undefined
    const marker = path.lastIndexOf('/docs/')
    return marker > 0 ? path.slice(0, marker) : undefined
  } catch {
    return undefined
  }
}
