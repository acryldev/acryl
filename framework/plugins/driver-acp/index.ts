/**
 * The ACP driver (M8, spec 046 T028): any agent that speaks the Agent Client Protocol (ACP v1 over stdio) as a chat driver of the agent panel, started in the app folder.
 * No agent gets code of its own here: an agent is a preset, a command line that starts its ACP server. `dsh` (DeepSeek Harness, `dsh --profile acp`) is the first preset;
 * other ACP agents are added by config.
 *
 * - The drivers are `chat` entries of the panel's `drivers` service (`acp:dsh`, ...). A panel without this plugin lists none; this plugin without a panel is pending.
 * - An agent whose command is not on the machine gets no driver, and the plugin says so in one line (as `driver-pty` does without node-pty).
 * - Every agent process is acquired inside one `ctx.effect`; its disposer ends the process. Unloading or reloading the plugin leaves no agent running.
 * - Development only, like the panel: with `NODE_ENV=production` (or `ACRYL_DOOR=off`) it starts nothing.
 */
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { onPath } from '../agent-panel/headless.ts'
import type {} from '../agent-panel/registry.ts'
import { type AcpPermissions, acpDriver, type OpenAgent } from './chat.ts'
import { type AcpAgent, AcpConnection } from './connection.ts'

export const name = 'driver-acp'
export const inject = ['drivers', 'appInstance']

export type { AcpPermissions } from './chat.ts'
export { acpDriver } from './chat.ts'
export { type AcpAgent, AcpConnection, AcpError } from './connection.ts'

/** The ACP agents this plugin knows by name: the command line that starts each one's ACP server. */
export const PRESETS: Readonly<Record<string, AcpAgent>> = {
  dsh: { command: 'dsh', args: ['--profile', 'acp'] },
}

export interface DriverAcpConfig {
  /** The agents to offer, by name (the driver is `acp:<name>`). Default: the presets whose command is on the machine. */
  agents?: Record<string, AcpAgent>
  /** The answer to an agent's permission request: its "allow once" or its "reject once" option. Default `reject`. */
  permissions?: AcpPermissions
}

export function apply(ctx: Context, config: DriverAcpConfig = {}): void {
  if (process.env.NODE_ENV === 'production' || process.env.ACRYL_DOOR === 'off') return
  const root = ctx.appInstance.root
  const open: OpenAgent = (agent, handle) => {
    let connection!: AcpConnection
    const close = ctx.effect(() => {
      connection = new AcpConnection(agent, root, handle)
      return () => connection.close()
    }) as () => Promise<void>
    // An agent that ended on its own gives its effect back at once instead of at unload.
    void connection.ended.then(() => close())
    return { connection, close }
  }
  for (const [agentName, agent] of Object.entries(config.agents ?? PRESETS)) {
    if (!(isAbsolute(agent.command) ? existsSync(agent.command) : onPath(agent.command))) {
      console.warn(`driver-acp: no acp:${agentName} driver, "${agent.command}" is not on the PATH`)
      continue
    }
    const driver = acpDriver({
      name: `acp:${agentName}`,
      agent,
      cwd: root,
      permissions: config.permissions ?? 'reject',
      open,
    })
    ctx.effect(() => ctx.drivers.register(driver))
  }
}
