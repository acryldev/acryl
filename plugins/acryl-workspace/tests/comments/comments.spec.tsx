// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceGroups } from '../../src/client/canvas/groups.ts'
import { CommentsBody, type CommentTerminals } from '../../src/client/comments/CommentsBody.tsx'
import { COMMENTS_STORAGE_KEY, CommentStore, MAX_COMMENTS_PER_WORKTREE, parseSavedComments, startCommentPersistence } from '../../src/client/comments/comment-store.ts'
import { COMMENTS_ID, commentsTabPlugin } from '../../src/client/comments/comments-tab.ts'
import { listTerminalTargets, type TerminalTarget } from '../../src/client/comments/terminal-targets.ts'
import { copyComments, sendComments } from '../../src/client/comments/use-comments.ts'
import { DockGroups } from '../../src/client/dock/dock-tabs.ts'
import { commentForTerminal, commentsForTerminal, type LineComment } from '../../src/client/files/line-comment.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

afterEach(cleanup)

const line = (over: Partial<LineComment> = {}): LineComment => ({ worktree: '/p/proj', file: 'src/a.ts', fromLine: 3, toLine: 3, lines: ['let x = 1'], text: 'use const', ...over })

describe('the comment list', () => {
  it('keeps comments per worktree, by file and line, until they are used or closed', () => {
    let now = 10
    const store = new CommentStore([], () => now++)
    const b = store.add(line({ file: 'src/b.ts', fromLine: 1, toLine: 1 }))
    const a9 = store.add(line({ fromLine: 9, toLine: 9 }))
    const a3 = store.add(line())
    store.add(line({ worktree: '/p/other' }))
    expect(store.forWorktree('/p/proj').map(c => c.id)).toEqual([a3.id, a9.id, b.id])
    expect(store.forFile('/p/proj', 'src/a.ts').map(c => c.id)).toEqual([a9.id, a3.id])
    store.move(a3.id, 5, 6)
    expect(store.forWorktree('/p/proj')[0]).toMatchObject({ id: a3.id, fromLine: 5, toLine: 6 })
    store.remove([a3.id, b.id])
    expect(store.forWorktree('/p/proj').map(c => c.id)).toEqual([a9.id])
  })

  it('tells listeners only about real changes, and caps each worktree', () => {
    const store = new CommentStore()
    const heard = vi.fn()
    store.subscribe(heard)
    const kept = store.add(line())
    store.move(kept.id, 3, 3)
    store.remove(['nope'])
    expect(heard).toHaveBeenCalledTimes(1)
    for (let index = 0; index < MAX_COMMENTS_PER_WORKTREE + 5; index += 1) store.add(line({ text: String(index) }))
    expect(store.forWorktree('/p/proj')).toHaveLength(MAX_COMMENTS_PER_WORKTREE)
  })

  it('is saved on every change and read back, dropping anything malformed, and new ids never repeat saved ones', () => {
    const saved: Record<string, string> = {}
    const store = new CommentStore([], () => 1)
    startCommentPersistence(store, { setItem: (key, value) => { saved[key] = value } })
    const first = store.add(line())
    const raw = saved[COMMENTS_STORAGE_KEY]
    expect(parseSavedComments(raw)).toEqual([first])
    expect(parseSavedComments('not json')).toEqual([])
    expect(parseSavedComments(JSON.stringify([{ ...first, fromLine: 0 }, { id: 'x' }]))).toEqual([])
    const again = new CommentStore(parseSavedComments(raw))
    expect(again.add(line()).id).not.toBe(first.id)
  })
})

describe('using comments', () => {
  it('copies them as one text and uses them up; a refused clipboard keeps them', async () => {
    const store = new CommentStore()
    const one = store.add(line())
    const two = store.add(line({ file: 'src/b.ts', text: 'and here' }))
    const refused = await copyComments(store, async () => { throw new Error('no') }, [one, two])
    expect(refused.ok).toBe(false)
    expect(store.all()).toHaveLength(2)
    const writeText = vi.fn(async () => {})
    expect(await copyComments(store, writeText, [one, two])).toEqual({ ok: true })
    expect(writeText).toHaveBeenCalledWith(commentsForTerminal([one, two], true))
    expect(store.all()).toEqual([])
    expect((await copyComments(store, undefined, [one])).ok).toBe(false)
  })

  it('types them into a terminal without Enter, one line each where a paste would run, and uses them up', () => {
    const store = new CommentStore()
    const one = store.add(line())
    const two = store.add(line({ text: 'second\nline' }))
    const paste = vi.fn()
    expect(sendComments(store, { paste, takesMultilinePaste: () => false }, [one, two])).toEqual({ ok: true })
    expect(paste).toHaveBeenCalledWith(commentsForTerminal([one, two], false))
    expect(paste.mock.calls[0]?.[0]).not.toContain('\n')
    expect(store.all()).toEqual([])
  })

  it('sends one comment exactly as the agent reads it, and refuses a closed terminal, keeping the comment', () => {
    const store = new CommentStore()
    const one = store.add(line())
    expect(sendComments(store, undefined, [one]).ok).toBe(false)
    expect(store.all()).toHaveLength(1)
    const paste = vi.fn()
    sendComments(store, { paste, takesMultilinePaste: () => true }, [one])
    expect(paste).toHaveBeenCalledWith(commentForTerminal(one, true))
  })
})

function gitApi(): WorkspaceGitApi {
  return {
    repo: async (cwd: string) => ({ name: cwd.split('/').pop(), root: cwd, current: cwd, worktrees: [{ path: cwd, branch: cwd === '/p/proj' ? 'main' : 'feat/x', head: 'abc', isMain: true }] }),
    status: async (cwd: string) => ({ branch: cwd === '/p/proj' ? 'main' : 'feat/x', upstream: null, ahead: 0, behind: 0, changes: [], truncated: false }),
  } as unknown as WorkspaceGitApi
}

/** Two worktrees with an agent and a shell tab each, plus a terminal panel tab; terminal t-dead has ended. */
async function workspace() {
  const shell = new WorkspaceShellState(gitApi())
  await shell.discover('/p/proj')
  await shell.discover('/p/feat')
  shell.select('/p/proj')
  const groups = new WorkspaceGroups()
  const tab = (worktree: string, commandId: string, title: string, terminalId: string): void => {
    const state = groups.stateFor(worktree)
    const tile = state.addTile('pty', { commandId: commandId as never, title })
    state.updateTile(tile!.id, { terminalId })
  }
  tab('/p/feat', 'claude', 'Claude Code', 't-feat-claude')
  tab('/p/proj', 'shell', 'zsh', 't-proj-zsh')
  tab('/p/proj', 'codex', 'Codex', 't-proj-codex')
  tab('/p/proj', 'claude', 'Old Claude', 't-dead')
  const dock = { groups: new DockGroups() }
  const panel = dock.groups.stateFor('/p/proj')
  const panelTab = panel.add()
  panel.update(panelTab!.id, { terminalId: 't-panel', title: 'tests' })
  const loose = dock.groups.stateFor('')
  const looseTab = loose.add()
  loose.update(looseTab!.id, { terminalId: 't-loose', title: 'scratch' })
  const terminals = { get: (id: string) => ({ isLive: () => id !== 't-dead' }) }
  return { shell, groups, dock, terminals }
}

describe('the open terminals a comment can go to', () => {
  it('lists the running ones, this worktree first and agents before shells, with their tab names and branches', async () => {
    const deps = await workspace()
    const targets = listTerminalTargets(deps, '/p/proj')
    expect(targets.map(t => `${t.title} (${t.worktreeLabel}, ${t.place})`)).toEqual([
      'Codex (main, tab)',
      'zsh (main, tab)',
      'tests (main, panel)',
      'Claude Code (feat/x, tab)',
      'scratch (no worktree, panel)',
    ])
    expect(targets[0]).toMatchObject({ terminalId: 't-proj-codex', agent: true })
    deps.shell.dispose()
  })
})

describe('Comments page', () => {
  async function page(writeText = vi.fn(async (_text: string) => {})) {
    const deps = await workspace()
    const store = new CommentStore()
    const pasted: Record<string, string[]> = {}
    const revealed: TerminalTarget[] = []
    const terminals: CommentTerminals = {
      list: worktree => listTerminalTargets(deps, worktree),
      pasteTarget: id => ({ paste: (text) => { (pasted[id] ??= []).push(text) }, takesMultilinePaste: () => true }),
      reveal: (target) => { revealed.push(target) },
    }
    const opened: unknown[] = []
    deps.shell.onOpenFile(request => { opened.push(request) })
    const props = { shell: deps.shell, comments: store, terminals, writeText } as unknown as Parameters<typeof CommentsBody>[0]
    render(<CommentsBody {...props} />)
    return { ...deps, store, pasted, revealed, opened, writeText }
  }

  it('lists the worktree comments, opens a file, and copies one, which uses it up', async () => {
    const { store, opened, writeText, shell } = await page()
    expect(screen.getByText(/No comments\./u)).toBeTruthy()
    let first!: ReturnType<CommentStore['add']>
    act(() => { first = store.add(line()); store.add(line({ file: 'src/b.ts', text: 'rename it' })); store.add(line({ worktree: '/p/feat', text: 'elsewhere' })) })
    expect(screen.getByText('2 comments')).toBeTruthy()
    expect(screen.queryByText('elsewhere')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'a.ts:3' }))
    expect(opened).toEqual([{ worktree: '/p/proj', file: 'src/a.ts' }])
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]!)
    await waitFor(() => { expect(screen.getByText('1 comment')).toBeTruthy() })
    expect(writeText).toHaveBeenCalledWith(commentsForTerminal([first], true))
    shell.dispose()
  })

  it('sends one comment to a chosen open terminal or agent, brings it to the front, and uses the comment up', async () => {
    const { store, pasted, revealed, shell } = await page()
    act(() => { store.add(line()); store.add(line({ file: 'src/b.ts', text: 'rename it' })) })
    fireEvent.click(screen.getAllByRole('button', { name: 'Send to ▾' })[1]!)
    const menu = screen.getByRole('menu', { name: 'Send to' })
    expect([...menu.querySelectorAll('[role=menuitem]')].map(item => item.textContent)).toEqual(['Codexmain', 'zshmain', 'testsmain, terminal panel', 'Claude Codefeat/x', 'scratchno worktree, terminal panel'])
    fireEvent.click(screen.getByRole('menuitem', { name: /Claude Code/u }))
    expect(pasted['t-feat-claude']?.[0]).toContain('rename it')
    expect(revealed.map(t => t.terminalId)).toEqual(['t-feat-claude'])
    expect(screen.getByText('1 comment')).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
    shell.dispose()
  })

  it('copies all, sends all, and closes one without using it', async () => {
    const { store, pasted, writeText, shell } = await page()
    act(() => { store.add(line()); store.add(line({ fromLine: 8, toLine: 8, text: 'two' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Send all to ▾' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Codex/u }))
    expect(pasted['t-proj-codex']?.[0]).toContain('use const')
    expect(pasted['t-proj-codex']?.[0]).toContain('two')
    expect(screen.getByText(/No comments\./u)).toBeTruthy()
    act(() => { store.add(line({ text: 'three' })); store.add(line({ text: 'four' })) })
    fireEvent.click(screen.getAllByRole('button', { name: /Close the comment/u })[0]!)
    expect(store.all()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }))
    await waitFor(() => { expect(screen.getByText(/No comments\./u)).toBeTruthy() })
    expect(writeText).toHaveBeenCalledTimes(1)
    shell.dispose()
  })

  it('says why when the clipboard refuses, and keeps the comments', async () => {
    const { store, shell } = await page(vi.fn(async () => { throw new Error('denied') }))
    act(() => { store.add(line()) })
    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/clipboard refused/u) })
    expect(store.all()).toHaveLength(1)
    shell.dispose()
  })
})

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

describe('Comments tab plugin lifecycle', () => {
  it('is PENDING until the right sidebar tab registry exists, listed after Checks, and unwinds without leftovers', async () => {
    const types: { id: string, order: number }[] = []
    const bodies: string[] = []
    const root = new Context()
    const shell = new WorkspaceShellState({} as unknown as WorkspaceGitApi)
    const fiber = root.plugin(commentsTabPlugin(shell, new CommentStore(), { list: () => [], pasteTarget: () => undefined, reveal: () => {} }, undefined))
    await settle()
    expect(fiber.state).toBe(PENDING)
    root.provide('slots', { register(def: { key: string }) { bodies.push(def.key); return () => { bodies.splice(bodies.indexOf(def.key), 1) } } })
    root.provide('sidebarRightTabs', { register(def: { id: string, guide: { order: number }[] }) { types.push({ id: def.id, order: def.guide[0]!.order }); return () => { types.length = 0 } } })
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(types).toEqual([{ id: COMMENTS_ID, order: 50 }])
    expect(bodies).toEqual([COMMENTS_ID])
    await fiber.dispose()
    expect(types).toEqual([])
    expect(bodies).toEqual([])
  })
})
