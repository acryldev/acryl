// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceState } from '../../src/client/canvas/state.ts'
import { GitDiffPane } from '../../src/client/diff/GitDiffPane.tsx'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

afterEach(() => { cleanup(); window.localStorage.clear() })

const DIFF = ['--- a/x', '+++ b/x', '@@ -1,4 +1,5 @@', ' keep', '-old one', '+new one', '+new two', '+new three', ' tail'].join('\n')

function setup(sendComment?: Parameters<typeof GitDiffPane>[0]['sendComment']) {
  const workspace = new WorkspaceState()
  const tile = workspace.openDiff('/p', 'x')
  if (tile === undefined) throw new Error('no tile')
  const gitApi = { diff: async (path: string, file: string) => ({ path, file, text: DIFF, binary: false, truncated: false }) } as unknown as WorkspaceGitApi
  const shell = new WorkspaceShellState({} as unknown as WorkspaceGitApi)
  return render(<GitDiffPane tile={tile} shell={shell} gitApi={gitApi} {...(sendComment === undefined ? {} : { sendComment })} />)
}

describe('GitDiffPane layouts and ranges', () => {
  it('switches to side by side, pairing removals with additions, and remembers the choice', async () => {
    const view = setup()
    await screen.findByText('keep')
    expect(document.querySelector('.dshWorkspaceGitDiffPair')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Side by side' }))
    const pairs = [...document.querySelectorAll('.dshWorkspaceGitDiffPair')]
    expect(pairs).toHaveLength(5)
    expect(within(pairs[1] as HTMLElement).getByText('old one')).toBeTruthy()
    expect(within(pairs[1] as HTMLElement).getByText('new one')).toBeTruthy()
    expect(pairs[1]?.querySelector('[data-kind="empty"]')).toBeNull()
    expect(pairs[2]?.querySelector('[data-kind="empty"]')).not.toBeNull()
    expect(pairs[3]?.querySelector('[data-kind="empty"]')).not.toBeNull()
    expect(window.localStorage.getItem('acryl-workspace:diff-layout')).toBe('split')
    view.unmount()
    setup()
    await screen.findAllByText('keep')
    expect(document.querySelector('.dshWorkspaceGitDiffPair')).not.toBeNull()
  })

  it('comments on a single line, and on a range with shift-click, sending every covered line', async () => {
    const sent: unknown[] = []
    const sendComment = vi.fn(async (input: unknown) => { sent.push(input); return { ok: true as const } })
    setup(sendComment)
    await screen.findByText('keep')

    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 4' }), { shiftKey: true })
    const box = screen.getByLabelText('Comment for the agent')
    expect(box.getAttribute('placeholder')).toContain('lines 2-4')
    expect(document.querySelectorAll('[data-selected]')).toHaveLength(3)
    fireEvent.change(box, { target: { value: 'merge these' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to agent' }))
    await waitFor(() => { expect(sendComment).toHaveBeenCalledTimes(1) })
    expect(sent[0]).toMatchObject({
      file: 'x', side: 'new', line: 2, endLine: 4, kind: 'add', comment: 'merge these',
      rangeLines: [{ kind: 'add', text: 'new one' }, { kind: 'add', text: 'new two' }, { kind: 'add', text: 'new three' }],
    })
    expect(await screen.findByText(/Sent to the agent: merge these/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Comment on old line 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Comment on new line 3' }), { shiftKey: true })
    expect(document.querySelectorAll('[data-selected]')).toHaveLength(1)
  })

  it('offers no comment buttons when the diff is read-only', async () => {
    setup()
    await screen.findByText('keep')
    expect(screen.queryByRole('button', { name: /Comment on/ })).toBeNull()
  })
})
