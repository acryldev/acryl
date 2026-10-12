import { describe, expect, it, vi } from 'vitest'
import { WorkspaceGroups } from '../../src/client/canvas/groups.ts'
import { routeShellRequests } from '../../src/client/canvas/shell-requests.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

function world() {
  const shell = new WorkspaceShellState({} as WorkspaceGitApi)
  const groups = new WorkspaceGroups()
  const terminals = { release: vi.fn() }
  const api = { start: vi.fn(async () => ({ id: 't9' })), write: vi.fn(async () => {}), close: vi.fn(async () => {}) }
  const stop = routeShellRequests({ shell, groups, terminals, api: api as never })
  return { shell, groups, terminals, api, stop }
}

describe('routeShellRequests', () => {
  it('closes the named tab in any worktree and releases its terminal', () => {
    const w = world()
    const tile = w.groups.stateFor('/a').addTile('pty', { commandId: 'shell', title: 'Terminal' })!
    w.groups.stateFor('/a').updateTile(tile.id, { terminalId: 't1' })
    w.shell.requestCloseTile({ worktree: '/a', tileId: tile.id })
    expect(w.groups.stateFor('/a').getSnapshot().tiles.some(candidate => candidate.id === tile.id)).toBe(false)
    expect(w.terminals.release).toHaveBeenCalledWith('t1')
    expect(w.api.close).toHaveBeenCalledWith('t1')
    w.stop()
  })

  it('opens a diff beside the chat when the chat is the selected tab, and in place otherwise', () => {
    const w = world()
    const state = w.groups.stateFor('/a')
    state.addTile('chat', { chatSessionId: 's1' })
    w.shell.openDiff({ worktree: '/a', file: 'x.ts' })
    expect(state.getSnapshot().splitId).toBeDefined()
    w.stop()
  })

  it('runs a check as a terminal tab that types the command', async () => {
    const w = world()
    w.shell.runCheck({ worktree: '/a', title: 'pnpm run check', commandLine: 'pnpm run check' })
    await vi.waitFor(() => { expect(w.api.write).toHaveBeenCalledWith('t9', 'pnpm run check\r') })
    expect(w.api.start).toHaveBeenCalledWith('shell', '/a')
    expect(w.groups.stateFor('/a').getSnapshot().tiles.find(tile => tile.title === 'pnpm run check')?.terminalId).toBe('t9')
    w.stop()
  })

  it('stops handling requests once disposed', () => {
    const w = world()
    w.stop()
    w.shell.runCheck({ worktree: '/a', title: 'check', commandLine: 'check' })
    expect(w.groups.stateFor('/a').getSnapshot().tiles.some(tile => tile.title === 'check')).toBe(false)
  })
})
