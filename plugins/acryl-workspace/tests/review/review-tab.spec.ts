import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { ReviewStore } from '../../src/client/review/review-store.ts'
import { REVIEW_ID, reviewTabPlugin } from '../../src/client/review/review-tab.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2

const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

function registry() {
  const types: string[] = []
  const bodies: string[] = []
  return {
    types,
    bodies,
    tabs: { register(def: { id: string }) { types.push(def.id); return () => { types.splice(types.indexOf(def.id), 1) } } },
    slots: { register(def: { key: string }) { bodies.push(def.key); return () => { bodies.splice(bodies.indexOf(def.key), 1) } } },
  }
}

describe('Review tab plugin lifecycle', () => {
  it('is PENDING until the right sidebar tab registry exists, unwinds when it goes, and returns without duplicates', async () => {
    const shell = new WorkspaceShellState({} as unknown as WorkspaceGitApi)
    const f = registry()
    const root = new Context()
    const fiber = root.plugin(reviewTabPlugin(shell, new ReviewStore()))
    await settle()
    expect(fiber.state).toBe(PENDING)

    root.provide('slots', f.slots)
    root.provide('sidebarRightTabs', f.tabs)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(f.types).toEqual([REVIEW_ID])
    expect(f.bodies).toEqual([REVIEW_ID])

    await fiber.dispose()
    expect(f.types).toEqual([])
    expect(f.bodies).toEqual([])
  })
})
