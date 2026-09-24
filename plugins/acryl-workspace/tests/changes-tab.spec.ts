import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { CHANGES_ID, CHANGES_KIND, changesTabPlugin } from '../src/client/workspace/changes-tab.ts'
import type { WorkspaceGitApi } from '../src/client/workspace/git-api.ts'
import { WorkspaceShellState } from '../src/client/workspace/shell-state.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2

function fakeGit(): WorkspaceGitApi {
  return {
    async repo() {
      return {
        name: 'p',
        root: '/p',
        current: '/p',
        worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }],
      }
    },
    async status(path) {
      return { path, branch: 'main', changes: [], truncated: false }
    },
    async diff(path, file) {
      return { path, file, text: '', binary: false, truncated: false }
    },
    async createWorktree(_cwd, branch) {
      const repo = { name: 'p', root: '/p', current: '/p', worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }, { path: `/p.worktrees/${branch}`, branch, head: 'b', main: false }] }
      return { path: `/p.worktrees/${branch}`, branch, repo }
    },
  }
}

interface Fakes {
  readonly types: string[]
  readonly bodies: string[]
  readonly opened: string[]
  readonly tabs: { register(def: { id: string; kind: string }): () => void }
  readonly slots: { register(def: { key: string }): () => void }
  readonly sidebarRight: { openTab(kind: string): void }
}

function fakes(): Fakes {
  const types: string[] = []
  const bodies: string[] = []
  const opened: string[] = []
  return {
    types,
    bodies,
    opened,
    tabs: {
      register(def) {
        types.push(def.id)
        return () => { types.splice(types.indexOf(def.id), 1) }
      },
    },
    slots: {
      register(def) {
        bodies.push(def.key)
        return () => { bodies.splice(bodies.indexOf(def.key), 1) }
      },
    },
    sidebarRight: { openTab(kind) { opened.push(kind) } },
  }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

describe('Changes tab plugin lifecycle', () => {
  it('is PENDING without the upstream right sidebar, and mounts by itself when it appears', async () => {
    const shell = new WorkspaceShellState(fakeGit())
    const f = fakes()
    const root = new Context()
    const fiber = root.plugin(changesTabPlugin(shell))
    await settle()
    expect(fiber.state).toBe(PENDING)
    expect(f.types).toEqual([])

    root.provide('slots', f.slots)
    root.provide('sidebarRight', f.sidebarRight)
    await settle()
    expect(fiber.state).toBe(PENDING)

    root.provide('sidebarRightTabs', f.tabs)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(f.types).toEqual([CHANGES_ID])
    expect(f.bodies).toEqual([CHANGES_ID])
    await fiber.dispose()
  })

  it('reveals the Changes tab when the user picks a worktree, but not when following a session', async () => {
    const shell = new WorkspaceShellState(fakeGit())
    const f = fakes()
    const root = new Context()
    root.provide('slots', f.slots)
    root.provide('sidebarRight', f.sidebarRight)
    root.provide('sidebarRightTabs', f.tabs)
    const fiber = root.plugin(changesTabPlugin(shell))
    await settle()
    expect(fiber.state).toBe(ACTIVE)

    await shell.discover('/p')
    await shell.follow('/p')
    expect(f.opened).toEqual([])
    shell.select('/p')
    expect(f.opened).toEqual([CHANGES_KIND])
    await fiber.dispose()
  })

  it('unwinds both registrations and the reveal hook when its provider goes away, and restores them when it returns', async () => {
    const shell = new WorkspaceShellState(fakeGit())
    const f = fakes()
    const root = new Context()
    root.provide('slots', f.slots)
    root.provide('sidebarRight', f.sidebarRight)
    const tabsProvider = root.plugin({
      name: 'tabs-provider',
      apply(ctx: Context) { ctx.provide('sidebarRightTabs', f.tabs) },
    })
    const fiber = root.plugin(changesTabPlugin(shell))
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(f.types).toHaveLength(1)

    await tabsProvider.dispose()
    await settle()
    expect(fiber.state).toBe(PENDING)
    expect(f.types).toEqual([])
    expect(f.bodies).toEqual([])
    shell.select('/nowhere')
    expect(f.opened).toEqual([])

    root.plugin({
      name: 'tabs-provider-2',
      apply(ctx: Context) { ctx.provide('sidebarRightTabs', f.tabs) },
    })
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(f.types).toEqual([CHANGES_ID])
    expect(f.bodies).toEqual([CHANGES_ID])
    await fiber.dispose()
    expect(f.types).toEqual([])
    expect(f.bodies).toEqual([])
  })

  it('does not leak registrations across ten reload cycles', async () => {
    const shell = new WorkspaceShellState(fakeGit())
    const f = fakes()
    const root = new Context()
    root.provide('slots', f.slots)
    root.provide('sidebarRight', f.sidebarRight)
    root.provide('sidebarRightTabs', f.tabs)
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const fiber = root.plugin(changesTabPlugin(shell))
      await settle()
      expect(f.types).toHaveLength(1)
      expect(f.bodies).toHaveLength(1)
      await fiber.dispose()
      expect(f.types).toHaveLength(0)
      expect(f.bodies).toHaveLength(0)
    }
  })
})
