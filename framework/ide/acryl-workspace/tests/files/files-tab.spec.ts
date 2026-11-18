import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { DSH_FILES_KIND, FILES_ID, FILES_KIND, FILES_TAKEOVER_ID, filesTabPlugin } from '../../src/client/files/files-tab.ts'
import type { WorkspaceFilesApi } from '../../src/client/files/files-api.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

interface TabType {
  readonly id: string
  readonly kind: string
  readonly priority?: string
  readonly title: () => string
  readonly guide?: readonly unknown[]
}

async function start(takeOver: boolean) {
  const types: TabType[] = []
  const bodies: string[] = []
  const shell = new WorkspaceShellState({} as unknown as WorkspaceGitApi)
  const root = new Context()
  const fiber = root.plugin(filesTabPlugin(shell, {} as unknown as WorkspaceFilesApi, {} as unknown as WorkspaceGitApi, takeOver))
  await settle()
  const pending = fiber.state
  root.provide('slots', { register(def: { key: string }) { bodies.push(def.key); return () => { bodies.splice(bodies.indexOf(def.key), 1) } } })
  root.provide('sidebarRightTabs', { register(def: TabType) { types.push(def); return () => { types.splice(types.indexOf(def), 1) } } })
  await settle()
  return { fiber, pending, types, bodies }
}

describe('Files tab plugin', () => {
  it('is PENDING until the tab registry exists and unwinds every registration on disposal', async () => {
    const { fiber, pending, types, bodies } = await start(true)
    expect(pending).toBe(PENDING)
    expect(fiber.state).toBe(ACTIVE)
    expect(types.map(type => type.id)).toEqual([FILES_ID, FILES_TAKEOVER_ID])
    expect(bodies).toEqual([FILES_ID, FILES_TAKEOVER_ID])
    await fiber.dispose()
    expect(types).toEqual([])
    expect(bodies).toEqual([])
  })

  it('in the advanced shell takes over DSH\'s Files tab, with the only start-page entry', async () => {
    const { types } = await start(true)
    const takeover = types.find(type => type.kind === DSH_FILES_KIND)
    // `extension` is the band the registry lets shadow DSH's `builtin` Files; the same band would be refused.
    expect(takeover?.priority).toBe('extension')
    expect(takeover?.title()).toBe('Files')
    expect(takeover?.guide).toHaveLength(1)
    const kept = types.find(type => type.kind === FILES_KIND)
    expect(kept?.guide).toBeUndefined()
    expect(kept?.title()).toBe('Files')
  })

  it('in compatibility mode leaves DSH\'s Files tab alone and stays the Code tab', async () => {
    const { types } = await start(false)
    expect(types.map(type => type.kind)).toEqual([FILES_KIND])
    expect(types[0]?.title()).toBe('Code')
    expect(types[0]?.guide).toHaveLength(1)
  })
})
