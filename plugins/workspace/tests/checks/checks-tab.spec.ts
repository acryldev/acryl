import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { CHECKS_ID, checksTabPlugin } from '../../src/client/checks/checks-tab.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

describe('Checks tab plugin lifecycle', () => {
  it('is PENDING until the tab registry exists and unwinds both registrations on disposal', async () => {
    const types: string[] = []
    const bodies: string[] = []
    const shell = new WorkspaceShellState({} as unknown as WorkspaceGitApi)
    const root = new Context()
    const fiber = root.plugin(checksTabPlugin(shell, {} as unknown as WorkspaceGitApi))
    await settle()
    expect(fiber.state).toBe(PENDING)
    root.provide('slots', { register(def: { key: string }) { bodies.push(def.key); return () => { bodies.splice(bodies.indexOf(def.key), 1) } } })
    root.provide('sidebarRightTabs', { register(def: { id: string }) { types.push(def.id); return () => { types.splice(types.indexOf(def.id), 1) } } })
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(types).toEqual([CHECKS_ID])
    expect(bodies).toEqual([CHECKS_ID])
    await fiber.dispose()
    expect(types).toEqual([])
    expect(bodies).toEqual([])
  })
})
