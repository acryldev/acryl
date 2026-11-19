/**
 * The terminals the whole workspace shares: the Host connection, the live terminal registry, and the dock that
 * uses them. Created once at the composition root and owned by one effect, so the canvas's terminal tabs and the
 * dock's terminals share streams and end together when the plugin does.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { WorkspacePtyClient } from '../sessions/session-client.ts'
import { createWorkspacePtyApi } from '../terminal/pty-api.ts'
import { TerminalRegistry } from '../terminal/terminal-session.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import { DockController } from './dock-controller.ts'
import type { DockHost } from './dock-host.ts'

export interface TerminalStack {
  readonly ptyClient: WorkspacePtyClient
  readonly terminals: TerminalRegistry
  readonly dock: DockController
  readonly host: DockHost
}

/** @param storage - where the dock's layout and tabs are remembered (undefined when blocked). */
export function createTerminalStack(ctx: ClientContext, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, shell: WorkspaceShellState): TerminalStack {
  const ptyClient = new WorkspacePtyClient(createWorkspacePtyApi())
  const terminals = new TerminalRegistry()
  const dock = new DockController({ api: ptyClient, terminals, storage })
  ctx.effect(() => {
    const disconnect = dock.connect()
    return async () => {
      disconnect()
      terminals.disposeAll()
      await ptyClient.dispose()
    }
  }, 'acryl-workspace: terminals and dock')
  return { ptyClient, terminals, dock, host: { controller: dock, terminals, shell } }
}
