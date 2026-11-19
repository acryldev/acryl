import { describe, expect, it } from 'vitest'
import { WorkspaceGroups } from '../../src/client/canvas/groups.ts'
import { belongsToProjects, followShownWorkspace } from '../../src/client/projects/shown-workspace.ts'
import { followProjectRegistry } from '../../src/client/projects/registry-api.ts'
import type { RepoState } from '../../src/client/worktrees/shell-state.ts'

const repo = (root: string, ...worktrees: string[]): RepoState => ({ root, name: root, git: true, worktrees: [root, ...worktrees].map(path => ({ path, branch: 'b', head: 'h', main: path === root })) } as unknown as RepoState)

function world(selected: string | undefined, repos: readonly RepoState[]) {
  let current = 'default'
  let paths: string[] = []
  const listeners = new Set<() => void>()
  const registry = { current: () => current, paths: () => paths, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } } }
  const shown: string[] = []
  let cleared = 0
  const state = { selectedPath: selected, repos }
  const groups = new WorkspaceGroups()
  const stop = followShownWorkspace({
    registry, groups,
    shell: { getSnapshot: () => state as never, clearSelection: () => { cleared += 1; state.selectedPath = undefined } },
    showWorktree: (path) => { shown.push(path) },
  })
  const switchTo = (id: string, projects: string[]): void => { current = id; paths = projects; for (const l of [...listeners]) l() }
  return { groups, shown, cleared: () => cleared, switchTo, stop }
}

describe('followShownWorkspace (spec 043)', () => {
  it('shows the new workspace\'s tab sets and its first project when the selected worktree is not one of its projects', () => {
    const w = world('/a', [repo('/a'), repo('/b')])
    w.switchTo('ws-2', ['/b'])
    expect(w.groups.workspace()).toBe('ws-2')
    expect(w.shown).toEqual(['/b'])
  })

  it('keeps the selected worktree when it belongs to one of the workspace\'s projects, a linked worktree outside the folder included', () => {
    const w = world('/elsewhere/a-feature', [repo('/a', '/elsewhere/a-feature')])
    w.switchTo('ws-2', ['/a'])
    expect(w.shown).toEqual([])
    expect(w.cleared()).toBe(0)
  })

  it('shows no worktree in a workspace without projects', () => {
    const w = world('/a', [repo('/a')])
    w.switchTo('ws-2', [])
    expect(w.cleared()).toBe(1)
  })

  it('does nothing when the registry changes without another workspace being shown', () => {
    const w = world('/a', [repo('/a')])
    w.switchTo('default', ['/a', '/c'])
    expect(w.shown).toEqual([])
    expect(w.cleared()).toBe(0)
  })

  it('matches folders with either separator', () => {
    expect(belongsToProjects('C:\\p\\a', [], ['C:\\p'])).toBe(true)
    expect(belongsToProjects('/p-other', [], ['/p'])).toBe(false)
  })
})

describe('followProjectRegistry', () => {
  it('hands every valid pushed view to the registry, ignores a broken one, and closes the stream on disposal', () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined
    let closed = false
    const views: string[] = []
    const stop = followProjectRegistry(view => { views.push(view.current) }, () => ({
      addEventListener: (_type, l) => { listener = l },
      close: () => { closed = true },
    }))
    const view = { paths: [], adopted: false, workspaces: [{ id: 'default', name: 'Default', kind: 'individual', projects: [] }], current: 'default' }
    listener?.({ data: JSON.stringify(view) } as MessageEvent<string>)
    listener?.({ data: '{broken' } as MessageEvent<string>)
    expect(views).toEqual(['default'])
    stop()
    expect(closed).toBe(true)
  })
})
