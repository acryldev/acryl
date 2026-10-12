/**
 * Requests other parts of the workspace send to the tab sets through the shell (the tree, the Changes, Files and Checks tabs): close a tab, open a
 * diff, a file or a document, run a check in a terminal. Each acts on the named worktree's tab set, shown or not.
 */

import type { WorkspaceGroups } from './groups.ts'
import type { WorkspaceState } from './state.ts'
import type { WorkspaceShellState } from '../worktrees/shell-state.ts'
import type { TerminalRegistry } from '../terminal/terminal-session.ts'
import type { WorkspacePtyApi } from '../terminal/pty-api.ts'

export interface ShellRequestDeps {
  readonly shell: WorkspaceShellState
  readonly groups: WorkspaceGroups
  readonly terminals: Pick<TerminalRegistry, 'release'>
  readonly api: Pick<WorkspacePtyApi, 'start' | 'write' | 'close'>
}

/** Opened from the chat, a diff, file or document goes beside it so the conversation stays visible. */
function besideChat(state: WorkspaceState): boolean {
  const current = state.getSnapshot()
  return current.tiles.find(tile => tile.id === current.activeId)?.kind === 'chat'
}

/** Handle the shell's requests until the returned disposer runs. */
export function routeShellRequests({ shell, groups, terminals, api }: ShellRequestDeps): () => void {
  const stops = [
    // Through here rather than `closeTile` alone, so the tab's terminal process is released too.
    shell.onCloseTileRequest((request) => {
      const state = groups.stateFor(request.worktree)
      if (!state.getSnapshot().tiles.some(tile => tile.id === request.tileId)) return
      const removed = state.closeTile(request.tileId)
      if (removed?.terminalId !== undefined) {
        terminals.release(removed.terminalId)
        void api.close(removed.terminalId).catch(() => {})
      }
    }),
    shell.onOpenDiff((request) => {
      const state = groups.stateFor(request.worktree)
      state.openDiff(request.worktree, request.file, { beside: besideChat(state) })
    }),
    shell.onOpenFile((request) => {
      const state = groups.stateFor(request.worktree)
      state.openFile(request.worktree, request.file, { beside: besideChat(state) })
    }),
    shell.onOpenDoc((request) => {
      const state = groups.stateFor(request.worktree)
      state.openDoc(request.worktree, request.file, { beside: besideChat(state) })
    }),
    // A check: a terminal tab in that worktree that types the command for you.
    shell.onRunCheck((request) => {
      const state = groups.stateFor(request.worktree)
      const tile = state.addTile('pty', { commandId: 'shell', title: request.title })
      if (tile === undefined) return
      void (async () => {
        try {
          const view = await api.start('shell', request.worktree)
          state.updateTile(tile.id, { terminalId: view.id })
          await api.write(view.id, `${request.commandLine}\r`)
        } catch (cause) {
          state.updateTile(tile.id, { error: cause instanceof Error ? cause.message : 'spawn failed' })
        }
      })()
    }),
  ]
  return () => { for (const stop of stops) stop() }
}
