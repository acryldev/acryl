/**
 * What a terminal tab actually runs for an agent: the command, the arguments and the environment, from the
 * agent's own definition, the user's overrides and the permission mode. Pure: no disk, no process table.
 */

import type { KnownAgent, PermissionMode } from './known-agents.ts'

/** What the user changed for one agent in Settings. */
export interface AgentOverride {
  /** Listed in the "+" menu. Off hides it; it can still be opened from an existing tab. */
  readonly enabled: boolean
  /** Replaces the agent's own executable (an absolute path or a bare name). */
  readonly command?: string
  /** Added after the permission flags, one argument per entry. */
  readonly args: readonly string[]
}

export const DEFAULT_OVERRIDE: AgentOverride = { enabled: true, args: [] }

export interface AgentLaunch {
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  /** This launch reports its state through hooks of this kind; the Host adds the reporting at start. */
  readonly statusHooks?: 'claude'
}

/** @returns the launch for a known agent: `yolo` adds the agent's own skip-approvals flags first. */
export function planKnownLaunch(agent: KnownAgent, override: AgentOverride, mode: PermissionMode, statusHooks = false): AgentLaunch {
  const yolo = mode === 'yolo'
  const env = yolo ? agent.yoloEnv : undefined
  return {
    command: override.command ?? agent.command,
    args: [...(yolo ? agent.yoloArgs : []), ...override.args],
    ...(env === undefined ? {} : { env }),
    ...(statusHooks && agent.statusHooks !== undefined ? { statusHooks: agent.statusHooks } : {}),
  }
}

/** The command line for a person to read, with any environment first (`GOOSE_MODE=auto goose`). */
export function describeLaunch(launch: AgentLaunch): string {
  const quote = (part: string): string => (/^[A-Za-z0-9._@+:%~/=,*-]+$/.test(part) ? part : JSON.stringify(part))
  const env = Object.entries(launch.env ?? {}).map(([name, value]) => `${name}=${quote(value)}`)
  return [...env, launch.command, ...launch.args].map(quote).join(' ')
}
