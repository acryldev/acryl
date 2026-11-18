// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { DocFilePane } from '../../src/client/docs/DocFilePane.tsx'
import type { WorkspaceFilesApi } from '../../src/client/files/files-api.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

function setup(read: WorkspaceFilesApi['read']) {
  const workspace = new WorkspaceState()
  const tile = workspace.openDoc('/p', 'specs/plan.md')
  if (tile === undefined) throw new Error('no tile')
  const shell = new WorkspaceShellState({} as unknown as WorkspaceGitApi)
  const filesApi = { read } as unknown as WorkspaceFilesApi
  return { tile, shell, filesApi }
}

describe('DocFilePane', () => {
  it('renders the markdown of a real file read-only, and follows the file as it changes on disk', async () => {
    let version = 1
    const read = vi.fn(async (_w: string, file: string) => ({
      path: '/p', file, binary: false, size: 1, mtimeMs: version,
      content: version === 1 ? '# Plan\n\n- first\n\n`code`' : '# Plan v2\n\n| a | b |\n|--|--|\n| 1 | 2 |',
    }))
    const { tile, shell, filesApi } = setup(read)
    render(<DocFilePane tile={tile} shell={shell} filesApi={filesApi} pollMs={20} />)
    expect(await screen.findByText('Plan')).toBeTruthy()
    expect(screen.getByText('first')).toBeTruthy()
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByText('read-only preview')).toBeTruthy()

    version = 2
    await waitFor(() => { expect(screen.getByText('Plan v2')).toBeTruthy() })
    expect(document.querySelector('table')).not.toBeNull()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('does not re-render when the file has not changed, and offers Edit through the shell', async () => {
    const read = vi.fn(async (_w: string, file: string) => ({ path: '/p', file, binary: false, size: 1, mtimeMs: 7, content: 'hello' }))
    const { tile, shell, filesApi } = setup(read)
    const opened: unknown[] = []
    shell.onOpenFile(request => { opened.push(request) })
    render(<DocFilePane tile={tile} shell={shell} filesApi={filesApi} pollMs={15} />)
    await screen.findByText('hello')
    await act(async () => { await new Promise(resolve => { setTimeout(resolve, 60) }) })
    expect(read.mock.calls.length).toBeGreaterThan(1)
    screen.getByRole('button', { name: 'Edit' }).click()
    expect(opened).toEqual([{ worktree: '/p', file: 'specs/plan.md' }])
  })

  it('shows a binary file and a read error instead of a document', async () => {
    const binary = setup(async (_w, file) => ({ path: '/p', file, binary: true, size: 3, mtimeMs: 1, content: '' }))
    render(<DocFilePane tile={binary.tile} shell={binary.shell} filesApi={binary.filesApi} pollMs={1000} />)
    expect(await screen.findByText(/binary file/)).toBeTruthy()
    cleanup()
    const failing = setup(() => Promise.reject(new Error('gone')))
    render(<DocFilePane tile={failing.tile} shell={failing.shell} filesApi={failing.filesApi} pollMs={1000} />)
    expect((await screen.findByRole('alert')).textContent).toContain('gone')
  })
})
