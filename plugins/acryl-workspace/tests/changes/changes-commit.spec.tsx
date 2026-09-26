// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesBody, type ChangesBodyProps } from '../../src/client/changes/ChangesBody.tsx'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'
import type { GitChange } from '../../src/git/contract.ts'

afterEach(cleanup)

function harness(initial: GitChange[]) {
  const state = { changes: initial }
  const calls: string[] = []
  const status = (path: string) => ({ path, branch: 'main', changes: state.changes, truncated: false })
  const api = {
    repo: async () => ({ name: 'p', root: '/p', current: '/p', worktrees: [{ path: '/p', branch: 'main', head: 'a', main: true }] }),
    status: async (path: string) => status(path),
    stage: vi.fn(async (path: string, files: readonly string[]) => {
      calls.push(`stage ${files.join(',')}`)
      state.changes = state.changes.map(c => files.includes(c.path) ? { ...c, staged: true } : c)
      return status(path)
    }),
    unstage: vi.fn(async (path: string, files: readonly string[]) => {
      calls.push(`unstage ${files.join(',')}`)
      state.changes = state.changes.map(c => files.includes(c.path) ? { ...c, staged: false } : c)
      return status(path)
    }),
    commit: vi.fn(async (path: string, message: string) => {
      calls.push(`commit ${message}`)
      state.changes = state.changes.filter(c => !c.staged)
      return { hash: 'abc1234', subject: message.split('\n')[0] ?? '', status: status(path) }
    }),
  } as unknown as WorkspaceGitApi
  return { api, calls, state }
}

async function open(initial: GitChange[]) {
  const h = harness(initial)
  const shell = new WorkspaceShellState(h.api)
  await shell.discover('/p')
  shell.select('/p')
  await shell.refreshStatus('/p')
  render(<ChangesBody {...({ shell, gitApi: h.api } as unknown as ChangesBodyProps)} />)
  return { ...h, shell }
}

const A: GitChange = { path: 'a.ts', code: 'M', staged: false, added: 1, removed: 0 }
const B: GitChange = { path: 'b.ts', code: 'M', staged: true, added: 2, removed: 1 }

describe('Changes: stage and commit', () => {
  it('stages and unstages one file, and all of them at once, refreshing what the tab shows', async () => {
    const h = await open([A, B])
    fireEvent.click(await screen.findByRole('button', { name: 'Stage a.ts' }))
    await waitFor(() => { expect(h.calls).toEqual(['stage a.ts']) })
    expect(await screen.findByRole('button', { name: 'Unstage a.ts' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unstage all' }))
    await waitFor(() => { expect(h.calls.at(-1)).toBe('unstage a.ts,b.ts') })
    expect(await screen.findByRole('button', { name: 'Stage b.ts' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stage all' }))
    await waitFor(() => { expect(h.calls.at(-1)).toBe('stage a.ts,b.ts') })
  })

  it('commits the staged files with the typed message, reports the commit, and clears the box', async () => {
    const h = await open([A, B])
    const button = await screen.findByRole('button', { name: /Commit 1 staged file$/ })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Commit message'), { target: { value: 'feat: b' } })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Committed abc1234: feat: b')
    expect(h.calls).toContain('commit feat: b')
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('')
  })

  it('cannot commit with nothing staged, and shows the reason when git refuses', async () => {
    const h = await open([A])
    expect((screen.getByRole('button', { name: 'Commit' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    const failing = harness([B])
    ;(failing.api.commit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('git does not know who you are: set user.name and user.email first'))
    const shell = new WorkspaceShellState(failing.api)
    await shell.discover('/p')
    shell.select('/p')
    await shell.refreshStatus('/p')
    render(<ChangesBody {...({ shell, gitApi: failing.api } as unknown as ChangesBodyProps)} />)
    fireEvent.change(await screen.findByLabelText('Commit message'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /Commit 1 staged file/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('who you are')
    expect(h.calls).toEqual([])
  })
})
