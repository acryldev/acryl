import { describe, expect, it } from 'vitest'
import type { ISessions } from '@acryl/ui/frame'
import { ChatSelection } from '../../src/client/chat/chat-selection.ts'
import type { MainViewNavigation } from '../../src/client/sessions/main-session.ts'
import { WorkspaceGroups } from '../../src/client/canvas/groups.ts'
import { owningWorktree } from '../../src/client/projects/sidebar-model.ts'
import type { WorkspaceGitApi } from '../../src/client/git/git-api.ts'
import { WorkspaceShellState } from '../../src/client/worktrees/shell-state.ts'

/**
 * The relation between DSH's shown chat, ACRYL's tab sets and the selected worktree, driven the way the UI drives it, against a fake of
 * DSH that behaves like `dsh-client-ui-workspace` (a switch holds the next session, notifies, then releases the previous one and notifies
 * again). On 2026-10-12 two sequences froze the Desktop: tab selection and the session sync opened chats in reaction to each other.
 */

const MAIN = '/p'
const HI = '/p-hi'

interface Row { id: string, cwd: string, blank: boolean, displayTitle: string, updatedAt: number, retainedBy: { mainView: number } }

class FakeDsh {
  private rows = new Map<string, Row>()
  private readonly listeners = new Set<() => void>()
  private snapshot = { ids: [] as string[], byId: {} as Record<string, Row>, phase: 'ready' }
  private held: { release(): void } | undefined
  /** Every chat DSH was asked to show, in order. */
  readonly opened: string[] = []

  constructor(rows: ReadonlyArray<Omit<Row, 'retainedBy' | 'updatedAt'>>) {
    rows.forEach((row, index) => { this.rows.set(row.id, { ...row, updatedAt: index, retainedBy: { mainView: 0 } }) })
    this.publish()
  }

  readonly sessions = {
    list: { getSnapshot: () => this.snapshot, subscribe: (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } } },
    retain: (id: string) => this.retain(id),
  } as unknown as ISessions

  readonly navigation = {
    openSession: (id: string): void => {
      this.opened.push(id)
      const next = this.retain(id)
      const previous = this.held
      this.held = next
      previous?.release()
    },
  }

  current(): string | undefined {
    return this.snapshot.ids.find(id => (this.snapshot.byId[id]?.retainedBy.mainView ?? 0) > 0)
  }

  private retain(id: string): { release(): void } {
    this.bump(id, +1)
    let released = false
    return { release: () => { if (!released) { released = true; this.bump(id, -1) } } }
  }

  private bump(id: string, delta: number): void {
    const row = this.rows.get(id)
    if (row === undefined) throw new Error(`no session ${id}`)
    this.rows.set(id, { ...row, retainedBy: { mainView: row.retainedBy.mainView + delta } })
    this.publish()
  }

  private publish(): void {
    const byId = Object.fromEntries([...this.rows].map(([id, row]) => [id, row]))
    this.snapshot = { ids: [...this.rows.keys()], byId, phase: 'ready' }
    for (const listener of [...this.listeners]) listener()
  }
}

function gitApi(): WorkspaceGitApi {
  return {
    async repo(cwd: string) {
      return { name: 'p', root: MAIN, current: cwd.startsWith(HI) ? HI : MAIN, worktrees: [{ path: MAIN, branch: 'main', head: 'a', main: true }, { path: HI, branch: 'hi', head: 'b', main: false }] }
    },
    async status(path: string) { return { path, branch: path === HI ? 'hi' : 'main', changes: [], truncated: false } },
  } as unknown as WorkspaceGitApi
}

/** Reconciles allowed per user action: a loop between reconciling and navigation would otherwise starve the test like it froze the window. */
const RECONCILE_BUDGET = 20
let reconciles = 0
const budgeted = (run: () => void): void => {
  reconciles += 1
  if (reconciles > RECONCILE_BUDGET) throw new Error(`more than ${String(RECONCILE_BUDGET)} reconciles for one action: a reaction loop`)
  queueMicrotask(run)
}
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); reconciles = 0 }

async function world(showTabs: () => void = () => {}) {
  const dsh = new FakeDsh([
    { id: 'm1', cwd: MAIN, blank: false, displayTitle: 'this is a test please' },
    { id: 'm2', cwd: MAIN, blank: false, displayTitle: 'metaTest' },
    { id: 'h1', cwd: HI, blank: true, displayTitle: 'New chat' },
    { id: 'h2', cwd: HI, blank: false, displayTitle: 'hi chat' },
  ])
  const shell = new WorkspaceShellState(gitApi())
  const groups = new WorkspaceGroups()
  const chats = new ChatSelection({ groups, shell, getSessions: () => dsh.sessions, getNavigation: () => dsh.navigation as unknown as MainViewNavigation, schedule: budgeted, showTabs })
  dsh.navigation.openSession('m1')
  const stop = chats.watch(dsh.sessions)
  await shell.discover(MAIN)
  await settle()
  const selected = (): string => shell.getSnapshot().selectedPath ?? ''
  /** Every chat tab sits in the tab set of the worktree that owns its chat. */
  const misplaced = (): string[] => groups.keys().flatMap(key => groups.stateFor(key).getSnapshot().tiles
    .filter(tile => tile.kind === 'chat' && tile.chatSessionId !== undefined)
    .filter(tile => owningWorktree(shell.getSnapshot().repos, dsh.sessions.list.getSnapshot().byId[tile.chatSessionId as never]?.cwd ?? '') !== key)
    .map(tile => `${String(tile.chatSessionId)} in ${key}`))
  /** The selected worktree's selected tab, when it is a chat tab. */
  const selectedChatTab = (): string | undefined => {
    const state = groups.stateFor(selected()).getSnapshot()
    const tile = state.tiles.find(candidate => candidate.id === state.activeId)
    return tile?.kind === 'chat' ? tile.chatSessionId : undefined
  }
  const tabOf = (worktree: string, sessionId: string): string => {
    const tile = groups.stateFor(worktree).getSnapshot().tiles.find(candidate => candidate.chatSessionId === sessionId)
    if (tile === undefined) throw new Error(`no tab for ${sessionId} in ${worktree}`)
    return tile.id
  }
  return { dsh, shell, groups, chats, stop, selected, misplaced, selectedChatTab, tabOf }
}

describe('ChatSelection', () => {
  it('places the shown chat in the new workspace\'s tab set when the workspace changes, and opens nothing (spec 043 T006)', async () => {
    const w = await world()
    expect(w.selectedChatTab()).toBe('m1')
    const before = w.dsh.opened.length
    w.groups.setWorkspace('ws-2')
    await settle()
    expect(w.selectedChatTab()).toBe('m1')
    expect(w.misplaced()).toEqual([])
    expect(w.dsh.opened.length).toBe(before)
    // Default's tab set is as it was.
    w.groups.setWorkspace('default')
    await settle()
    expect(w.selectedChatTab()).toBe('m1')
  })

  it('replays the first freezing sequence (open a chat of another worktree from the tree, then select the first worktree): one open per action, nothing reacts', async () => {
    const w = await world()
    w.chats.showWorktree(HI, () => { w.chats.open('h2') })
    await settle()
    expect(w.selected()).toBe(HI)
    const before = w.dsh.opened.length
    // The tree's chat row: select its worktree, then open the chat.
    w.shell.select(MAIN)
    w.chats.open('m2')
    await settle()
    w.chats.showWorktree(HI, () => {})
    await settle()
    expect(w.dsh.opened.length - before).toBeLessThanOrEqual(2)
    expect(w.misplaced()).toEqual([])
    expect(w.selected()).toBe(HI)
    expect(w.dsh.current()).toBe(w.selectedChatTab())
    w.stop()
  })

  it('replays the second freezing sequence (expand a worktree while another is selected, then switch back and forth): it settles', async () => {
    const w = await world()
    for (let round = 0; round < 3; round++) {
      w.chats.showWorktree(HI, () => { w.chats.open('h1') })
      await settle()
      w.chats.showWorktree(MAIN, () => { w.chats.open('m1') })
      await settle()
    }
    const opened = w.dsh.opened.length
    await settle()
    expect(w.dsh.opened.length).toBe(opened)
    expect(w.misplaced()).toEqual([])
    expect(w.dsh.current()).toBe(w.selectedChatTab())
    w.stop()
  })

  it('never opens a chat while reconciling: a navigation made elsewhere (DSH\'s own list) only moves tabs and the worktree', async () => {
    const w = await world()
    const before = w.dsh.opened.length
    w.dsh.navigation.openSession('h2')
    await settle()
    expect(w.dsh.opened.length).toBe(before + 1)
    expect(w.selected()).toBe(HI)
    expect(w.selectedChatTab()).toBe('h2')
    expect(w.misplaced()).toEqual([])
    w.stop()
  })

  it('selecting a chat tab shows its chat; selecting the tab already shown opens nothing', async () => {
    const w = await world()
    w.chats.showWorktree(MAIN, () => {})
    await settle()
    const before = w.dsh.opened.length
    w.chats.selectTab(MAIN, w.tabOf(MAIN, 'm2'))
    await settle()
    expect(w.dsh.current()).toBe('m2')
    w.chats.selectTab(MAIN, w.tabOf(MAIN, 'm2'))
    await settle()
    expect(w.dsh.opened.length).toBe(before + 1)
    w.stop()
  })

  it('returns to the tabs on every pick (a tab, a worktree, a chat), even one that shows no new chat - an open page (Plugins) covered them', async () => {
    let shown = 0
    const w = await world(() => { shown += 1 })
    w.chats.showWorktree(MAIN, () => {})
    w.chats.showWorktree(MAIN, () => {})
    w.chats.selectTab(MAIN, w.tabOf(MAIN, 'm1'))
    w.chats.open('m2')
    expect(shown).toBe(4)
    w.stop()
  })

  it('holds its invariants through 300 random user actions: at most one open per action, tabs in their own worktree, the shown chat on the selected tab', async () => {
    const w = await world()
    let seed = 7
    const next = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
    const ids = ['m1', 'm2', 'h1', 'h2']
    for (let step = 0; step < 300; step++) {
      const before = w.dsh.opened.length
      const action = next(3)
      if (action === 0) {
        w.chats.showWorktree(next(2) === 0 ? MAIN : HI, () => {})
      } else if (action === 1) {
        const id = ids[next(ids.length)]!
        w.shell.select(id.startsWith('m') ? MAIN : HI)
        w.chats.open(id)
      } else {
        const tiles = w.groups.stateFor(w.selected()).getSnapshot().tiles
        const tile = tiles[next(Math.max(1, tiles.length))]
        if (tile !== undefined) w.chats.selectTab(w.selected(), tile.id)
      }
      await settle()
      expect(w.dsh.opened.length - before).toBeLessThanOrEqual(1)
      expect(w.misplaced()).toEqual([])
      if (action !== 0) expect(w.dsh.current()).toBe(w.selectedChatTab())
    }
    w.stop()
  })
})
