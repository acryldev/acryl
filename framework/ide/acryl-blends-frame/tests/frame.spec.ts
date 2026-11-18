import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countChanges, parseBranches, parseBranchName, parseFrameState, sharedVersions } from '../src/index.ts'
import { FRAME_BRANCHES_NEW_PATH, FRAME_BRANCHES_SWITCH_PATH, branchNameProblem, parseBranchChats, parseSharedVersions } from '../src/contract.ts'
import { branchClick, createBranchesApi, saveBeforeSwitchMessage } from '../src/client/branches.ts'
import { BranchChatsStore, historyGroups } from '../src/client/branch-chats.ts'
import { createBranchChatsStore } from '../src/branch-chats.ts'
import { chatRows, chatTitle } from '../src/client/chats.ts'
import { backText, backToMessage, chatTime, saveBeforeBackMessage, savedLabel, shortTime, versionNumber } from '../src/client/versions.ts'
import { displayMatch, fuzzySearch } from '../src/client/fuzzy.ts'
import { foldersAbove } from '../src/client/FilesView.tsx'
import { highlightLine, languageOf } from '../src/client/highlight.ts'
import { DETAILS_TAB, FILES_TAB, FIRST_RUN_TABS, FrameTabs, fileTab, fileTabLabels, parseStoredTabs, ptyTab, tabsForBranch, terminalMeta, terminalTab } from '../src/client/tabs.ts'
import { FIRST_RUN_VIEW, FrameViewState, parseStoredView, type ViewStorage } from '../src/client/view-state.ts'

describe('parseBranches', () => {
  it('puts the checked-out branch first and the rest by name', () => {
    expect(parseBranches('  zeta\n* main\n  alpha\n')).toEqual([
      { name: 'main', current: true },
      { name: 'alpha', current: false },
      { name: 'zeta', current: false },
    ])
  })

  it('reads no branches from an empty repository', () => {
    expect(parseBranches('')).toEqual([])
  })
})

describe('countChanges', () => {
  it('counts each changed path once, a rename as one', () => {
    expect(countChanges(' M src/a.ts\0?? notes.md\0R  new.ts\0old.ts\0')).toBe(3)
    expect(countChanges('')).toBe(0)
  })
})

describe('the bar label', () => {
  it('says saved only when nothing changed since the last version', () => {
    expect(savedLabel(0)).toBe('saved')
    expect(savedLabel(3)).toBe('3 unsaved')
    expect(savedLabel(undefined)).toBeUndefined()
  })
})

describe('parseFrameState', () => {
  const state = { appName: 'todo', appRoot: '/apps/todo', appPage: '/app', branches: [{ name: 'main', current: true }] }

  it('accepts a frame state', () => {
    expect(parseFrameState(state)).toEqual(state)
  })

  it('keeps a state without an app page', () => {
    expect(parseFrameState({ ...state, appPage: undefined })).toEqual({ appName: 'todo', appRoot: '/apps/todo', branches: state.branches })
  })

  it('names the bad field', () => {
    expect(() => parseFrameState({ ...state, appPage: 'app' })).toThrow('appPage')
    expect(() => parseFrameState({ ...state, appName: '' })).toThrow('appName')
    expect(() => parseFrameState({ ...state, branches: [{ name: 'main' }] })).toThrow('branch')
    expect(() => parseFrameState(null)).toThrow('not an object')
    expect(() => parseFrameState({ ...state, unsaved: -1 })).toThrow('unsaved')
    expect(() => parseFrameState({ ...state, head: '' })).toThrow('head')
  })
})

class MemoryStorage implements ViewStorage {
  readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('the frame view', () => {
  it('opens both panels in Build on the first run, at the mockup widths', () => {
    expect(new FrameViewState(new MemoryStorage()).getSnapshot()).toEqual({ left: true, right: true, mode: 'build', leftWidth: 248, rightWidth: 412 })
  })

  it('remembers the person\'s choice and the panel widths for the next page', () => {
    const storage = new MemoryStorage()
    const first = new FrameViewState(storage)
    first.toggleLeft()
    first.setMode('preview')
    first.setWidth('right', 500)
    expect(new FrameViewState(storage).getSnapshot()).toEqual({ left: false, right: true, mode: 'preview', leftWidth: 248, rightWidth: 500 })
  })

  it('keeps a collapsed panel\'s width, so reopening returns it at its own width', () => {
    const view = new FrameViewState(new MemoryStorage())
    view.setWidth('left', 320)
    view.setWidth('right', 460)
    view.toggleLeft()
    view.toggleRight()
    // The widths are the panel's own, not the open state's: closing changes neither, and the next open shows them again.
    expect(view.getSnapshot()).toMatchObject({ left: false, right: false, leftWidth: 320, rightWidth: 460 })
    view.toggleLeft()
    view.toggleRight()
    expect(view.getSnapshot()).toMatchObject({ left: true, right: true, leftWidth: 320, rightWidth: 460 })
  })

  it('puts the default width back on a double-click', () => {
    const view = new FrameViewState(new MemoryStorage())
    view.setWidth('left', 400)
    view.setWidth('right', 200)
    view.resetWidth('left')
    view.resetWidth('right')
    expect(view.getSnapshot()).toMatchObject({ leftWidth: 248, rightWidth: 412 })
  })

  it('a view stored before the panels resized keeps its panels and gets the default widths', () => {
    expect(parseStoredView('{"left":false,"right":true,"mode":"preview"}')).toEqual({ left: false, right: true, mode: 'preview', leftWidth: 248, rightWidth: 412 })
  })

  it('falls back to the first run for a malformed or missing memory', () => {
    expect(parseStoredView('{"left":1}')).toBe(FIRST_RUN_VIEW)
    expect(parseStoredView('{"left":true,"right":true,"mode":"build","leftWidth":"wide"}')).toEqual({ left: true, right: true, mode: 'build', leftWidth: 248, rightWidth: 412 })
    expect(parseStoredView('not json')).toBe(FIRST_RUN_VIEW)
    expect(parseStoredView(null)).toBe(FIRST_RUN_VIEW)
  })

  it('still changes when the storage throws', () => {
    const throwing: ViewStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    const view = new FrameViewState(throwing)
    let told = 0
    view.subscribe(() => { told += 1 })
    view.toggleRight()
    expect(view.getSnapshot().right).toBe(false)
    expect(told).toBe(1)
  })
})

describe('chats', () => {
  it('names a chat by its title, else as a new chat', () => {
    expect(chatTitle({ title: ' Add a due date ' })).toBe('Add a due date')
    expect(chatTitle({ title: '  ' })).toBe('New chat')
    expect(chatTitle({})).toBe('New chat')
  })

  it('marks the chat the main view holds as current', () => {
    const list = {
      ids: ['a', 'b', 'gone'],
      byId: {
        a: { title: 'First', displayTitle: 'First', retainedBy: { mainView: 0 } },
        b: { displayTitle: 'my-project', retainedBy: { mainView: 1 } },
      },
    }
    expect(chatRows(list as never)).toEqual([
      { id: 'a', title: 'First', current: false },
      { id: 'b', title: 'New chat', current: true },
    ])
  })
})

describe('versionNumber', () => {
  it('counts from the first version, newest first in the list', () => {
    const entries = [{}, {}, {}] as never[]
    expect(versionNumber(entries, 0)).toBe(3)
    expect(versionNumber(entries, 2)).toBe(1)
  })
})

describe('fuzzy file search', () => {
  it('matches the letters in order, the file name first, and splits the top folder off for display', () => {
    const [best] = fuzzySearch('brd', ['test/board.test.ts', 'src/board.ts', 'README.md', 'plugins/board-mobile/index.ts'])
    expect(best?.path).toBe('src/board.ts')
    expect(displayMatch(best!)).toEqual({ folder: 'src', parts: [{ text: 'b', hit: true }, { text: 'oa', hit: false }, { text: 'rd', hit: true }, { text: '.ts', hit: false }] })
    expect(fuzzySearch('zzz', ['src/board.ts'])).toEqual([])
  })
})

describe('syntax colours', () => {
  it('colours keywords, calls, strings, types and comments, and leaves a property plain', () => {
    const kinds = highlightLine("export function dueBadge(task: Task) { return task.due ?? 'x' } // note", 'code')
      .filter(token => token.kind !== 'plain').map(token => `${token.kind}:${token.text}`)
    expect(kinds).toEqual(['kw:export', 'kw:function', 'fn:dueBadge', 'pu:(', 'va:task', 'pu::', 'ty:Task', 'pu:)', 'pu:{', 'kw:return', 'va:task', 'pu:.', 'pu:??', "st:'x'", 'pu:}', 'cm:// note'])
    expect(languageOf('blend.yaml')).toBe('hash')
  })
})

describe('the right panel tabs', () => {
  it('keeps the chat first, opens a tab once, and shows the one before a closed tab', () => {
    const storage = new MemoryStorage()
    const tabs = new FrameTabs(storage)
    tabs.open(ptyTab('claude', 't1'))
    tabs.open(FILES_TAB)
    tabs.open(ptyTab('claude', 't1'))
    expect(tabs.getSnapshot().tabs.map(tab => tab.id)).toEqual(['chat', 'pty:t1', 'files'])
    expect(tabs.getSnapshot().active).toBe('pty:t1')
    tabs.close('pty:t1')
    expect(tabs.getSnapshot().active).toBe('chat')
    expect(new FrameTabs(storage).getSnapshot()).toEqual({ tabs: [{ kind: 'chat', id: 'chat' }, FILES_TAB], active: 'chat' })
  })

  it('closes the base chat tab like the others, keeps it closed across a reload, and reopens it when a chat is shown again', () => {
    const storage = new MemoryStorage()
    const tabs = new FrameTabs(storage)
    tabs.setBranch('main')
    tabs.open(FILES_TAB)
    // The base tab's x: the tab leaves the strip and the active one is the tab it drew before.
    expect(tabs.close('chat')?.id).toBe('chat')
    expect(tabs.getSnapshot()).toMatchObject({ baseClosed: true, active: 'files' })
    expect(tabsForBranch(tabs.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['files'])
    // A page that loads the strip again keeps it closed.
    const again = new FrameTabs(storage)
    expect(again.getSnapshot()).toMatchObject({ baseClosed: true, active: 'files' })
    expect(tabsForBranch(again.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['files'])
    // Asking for a chat brings the base tab back.
    again.activate('chat')
    expect(again.getSnapshot().baseClosed).toBeUndefined()
    expect(again.getSnapshot().active).toBe('chat')
    expect(tabsForBranch(again.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['chat', 'files'])
  })

  it('leaves no tab on screen when the base chat was the last one, and activating it brings it back', () => {
    const tabs = new FrameTabs(new MemoryStorage())
    expect(tabs.close('chat')?.id).toBe('chat')
    expect(tabs.getSnapshot().active).toBe('')
    expect(tabsForBranch(tabs.getSnapshot(), undefined)).toEqual([])
    expect(tabs.close('chat')).toBeUndefined()
    tabs.activate('chat')
    expect(tabs.getSnapshot()).toMatchObject({ active: 'chat' })
    expect(tabs.getSnapshot().baseClosed).toBeUndefined()
  })

  it('drops what it cannot read back', () => {
    expect(parseStoredTabs('{"tabs":[{"kind":"pty","agent":"nope","terminalId":"x"},{"kind":"file","path":"src/a.ts"}],"active":"gone"}'))
      .toEqual({ tabs: [{ kind: 'chat', id: 'chat' }, fileTab('src/a.ts')], active: 'chat' })
    expect(parseStoredTabs('nonsense')).toBe(FIRST_RUN_TABS)
  })

  it('keeps the branch a remembered tab was opened on', () => {
    const stored = JSON.stringify({ tabs: [{ kind: 'terminal', terminalId: 't1', branch: 'main' }], active: 'terminal:t1', branched: true })
    expect(parseStoredTabs(stored).tabs[1]).toEqual({ kind: 'terminal', id: 'terminal:t1', terminalId: 't1', branch: 'main' })
  })
})

describe('the Panel tab of DSH\'s right sidebar', () => {
  it('is on every branch and is remembered with the strip', () => {
    const storage = new MemoryStorage()
    const tabs = new FrameTabs(storage)
    tabs.setBranch('main')
    tabs.open(FILES_TAB)
    tabs.open(DETAILS_TAB)
    expect(tabs.getSnapshot().active).toBe('details')
    expect(tabs.getSnapshot().tabs.find(tab => tab.id === 'details')?.branch).toBeUndefined()
    tabs.setBranch('feature')
    expect(tabsForBranch(tabs.getSnapshot(), 'feature').map(tab => tab.id)).toEqual(['chat', 'details'])
    expect(new FrameTabs(storage).getSnapshot()).toMatchObject({ active: 'details' })
    expect(tabsForBranch(new FrameTabs(storage).getSnapshot(), 'main').map(tab => tab.id)).toEqual(['chat', 'files', 'details'])
    expect(tabs.close('details')?.kind).toBe('details')
  })
})

describe('tabs per branch', () => {
  it('opens a tab on the checked-out branch and shows only that branch\'s tabs', () => {
    const storage = new MemoryStorage()
    const tabs = new FrameTabs(storage)
    tabs.setBranch('main')
    tabs.open(terminalTab('t1'))
    tabs.open(FILES_TAB)
    expect(tabs.getSnapshot().tabs.map(tab => [tab.id, tab.branch])).toEqual([
      ['chat', undefined],
      ['terminal:t1', 'main'],
      ['files', 'main'],
    ])
    tabs.setBranch('feature')
    tabs.open(fileTab('src/a.ts'))
    expect(tabsForBranch(tabs.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['chat', 'terminal:t1', 'files'])
    expect(tabsForBranch(tabs.getSnapshot(), 'feature').map(tab => tab.id)).toEqual(['chat', 'file:src/a.ts'])
    expect(tabsForBranch(tabs.getSnapshot(), undefined).map(tab => tab.id)).toEqual(['chat', 'terminal:t1', 'files', 'file:src/a.ts'])
    // The strip comes back the same on the next page.
    const again = new FrameTabs(storage)
    again.setBranch('main')
    expect(tabsForBranch(again.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['chat', 'terminal:t1', 'files'])
  })

  it('puts the tabs remembered before branches had their own lists on the first branch it sees, once', () => {
    const storage = new MemoryStorage()
    storage.setItem('acryl-blends-frame.tabs.v1', JSON.stringify({ tabs: [{ kind: 'terminal', terminalId: 'old' }], active: 'terminal:old' }))
    const tabs = new FrameTabs(storage)
    expect(tabs.getSnapshot().tabs[1]).toEqual({ kind: 'terminal', id: 'terminal:old', terminalId: 'old' })
    tabs.setBranch('main')
    expect(tabs.getSnapshot().tabs[1]).toEqual({ kind: 'terminal', id: 'terminal:old', terminalId: 'old', branch: 'main' })
    tabs.setBranch('feature')
    expect(tabs.getSnapshot().tabs[1]).toMatchObject({ branch: 'main' })
  })
})

describe('a chat\'s branch', () => {
  it('is the branch the chat was first seen on, and stays when the folder moves', () => {
    const calls: string[] = []
    const store = new BranchChatsStore({
      read: async () => ({ chats: {}, open: null }),
      setOpen: async () => {},
      initOpen: async () => {},
      assign: async (id, branch) => { calls.push(`${id}:${branch}`) },
    })
    store.adopt(['a', 'b'], 'main')
    expect(store.getSnapshot()).toEqual({ a: 'main', b: 'main' })
    store.adopt(['a', 'b', 'c'], 'feature')
    expect(store.getSnapshot()).toEqual({ a: 'main', b: 'main', c: 'feature' })
    expect(calls).toEqual(['a:main', 'b:main', 'c:feature'])
  })

  it('shows an assignment at once and drops it when the Host refuses, so the next look tries again', async () => {
    let refuse = true
    const calls: string[] = []
    const store = new BranchChatsStore({
      read: async () => ({ chats: {}, open: null }),
      setOpen: async () => {},
      initOpen: async () => {},
      assign: async (id, branch) => {
        calls.push(`${id}:${branch}`)
        if (refuse) throw new Error('the Host said no')
      },
    })
    store.adopt(['a'], 'main')
    expect(store.getSnapshot()).toEqual({ a: 'main' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.getSnapshot()).toEqual({})
    refuse = false
    store.adopt(['a'], 'main')
    expect(store.getSnapshot()).toEqual({ a: 'main' })
    expect(calls).toEqual(['a:main', 'a:main'])
  })

  it('keeps a chat recorded before the page opened', async () => {
    const store = new BranchChatsStore({ read: async () => ({ chats: { a: 'main' }, open: null }), assign: async () => {}, setOpen: async () => {}, initOpen: async () => {} })
    await store.load()
    store.adopt(['a'], 'feature')
    expect(store.getSnapshot()).toEqual({ a: 'main' })
  })
})

describe('the branch chats file', () => {
  it('reads what the Host was told', () => {
    expect(parseBranchChats({ chats: { s1: 'main' } })).toEqual({ chats: { s1: 'main' }, open: null })
    expect(parseBranchChats({ chats: { s1: 'main' }, open: ['s1'] })).toEqual({ chats: { s1: 'main' }, open: ['s1'] })
    expect(() => parseBranchChats({ chats: { s1: 7 } })).toThrow('entry')
    expect(() => parseBranchChats({ chats: {}, open: [3] })).toThrow('open')
    expect(() => parseBranchChats({})).toThrow('not a map')
  })

  it('records a chat once per app folder, serializing writes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'branch-chats-'))
    try {
      const store = createBranchChatsStore(join(dir, 'frame', 'branch-chats.json'))
      expect(await store.read('/apps/a')).toEqual({ chats: {}, open: null })
      await Promise.all([
        store.assign('/apps/a', 's1', 'main'),
        store.assign('/apps/a', 's2', 'feature'),
        store.assign('/apps/b', 's1', 'other'),
      ])
      expect((await store.read('/apps/a')).chats).toEqual({ s1: 'main', s2: 'feature' })
      expect((await store.read('/apps/b')).chats).toEqual({ s1: 'other' })
      await store.assign('/apps/a', 's1', 'feature')
      expect((await store.read('/apps/a')).chats).toEqual({ s1: 'main', s2: 'feature' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps which chats are open per app folder: decided once, then one chat at a time, across a restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'branch-chats-'))
    try {
      const file = join(dir, 'frame', 'branch-chats.json')
      const store = createBranchChatsStore(file)
      // Nobody decided yet.
      expect((await store.read('/apps/a')).open).toBeNull()
      expect(await store.initOpen('/apps/a', ['s1', 's2', 's1'])).toBe(true)
      // The first decision stands: a second page's is refused.
      expect(await store.initOpen('/apps/a', ['s9'])).toBe(false)
      await store.setOpen('/apps/a', 's3', true)
      await store.setOpen('/apps/a', 's1', false)
      await store.setOpen('/apps/a', 's3', true)
      expect((await store.read('/apps/a')).open).toEqual(['s2', 's3'])
      // Another app folder has its own.
      expect((await store.read('/apps/b')).open).toBeNull()
      // A restart reads the same file.
      expect((await createBranchChatsStore(file).read('/apps/a')).open).toEqual(['s2', 's3'])
      // A file from before the open chats were kept has no list: nobody decided.
      await writeFile(file, JSON.stringify({ roots: { '/apps/a': { s1: 'main' } } }))
      expect(await createBranchChatsStore(file).read('/apps/a')).toEqual({ chats: { s1: 'main' }, open: null })
      // Closing a chat before anyone decided decides that none else is open.
      await createBranchChatsStore(file).setOpen('/apps/a', 's1', false)
      expect((await createBranchChatsStore(file).read('/apps/a')).open).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('a terminal row', () => {
  it('names the command a shell runs, or the folder of an idle prompt', () => {
    expect(terminalMeta('npm test')).toBe('npm test')
    expect(terminalMeta('ana@laptop:/Users/ana/apps/team-board')).toBe('team-board')
    expect(terminalMeta(undefined)).toBe('')
  })

  it('still says what ran there after the Host restarts, and forgets it with the tab', () => {
    const storage = new MemoryStorage()
    const tabs = new FrameTabs(storage)
    tabs.open(terminalTab('t1'))
    tabs.setTitle('t1', 'npm test')
    // Another tab opened or shown beside it does not take the title away.
    tabs.open(FILES_TAB)
    tabs.activate('chat')
    expect(tabs.getSnapshot().titles).toEqual({ t1: 'npm test' })
    // After the restart the shell that set the title is gone with the Host, so the row reads the title the strip remembered.
    const restarted = new FrameTabs(storage)
    expect(terminalMeta(restarted.getSnapshot().titles?.['t1'])).toBe('npm test')
    restarted.close('terminal:t1')
    expect(new FrameTabs(storage).getSnapshot().titles).toBeUndefined()
  })

  it('keeps no title for a terminal that is not open', () => {
    expect(parseStoredTabs(JSON.stringify({ tabs: [], active: 'chat', titles: { gone: 'npm test' } }))).toEqual(FIRST_RUN_TABS)
    const kept = parseStoredTabs(JSON.stringify({ tabs: [{ kind: 'terminal', terminalId: 't1' }], active: 'terminal:t1', titles: { t1: 'npm test', gone: 'ls' } }))
    expect(kept.titles).toEqual({ t1: 'npm test' })
  })
})

describe('file tab labels', () => {
  it('shows the folder only when another open file has the same name', () => {
    expect(fileTabLabels(['src/a.ts'])).toEqual(new Map([['src/a.ts', 'a.ts']]))
    expect(fileTabLabels(['team-board/index.ts', 'src/index.ts']))
      .toEqual(new Map([['team-board/index.ts', 'team-board/index.ts'], ['src/index.ts', 'src/index.ts']]))
    expect(fileTabLabels(['index.ts', 'src/index.ts'])).toEqual(new Map([['index.ts', 'index.ts'], ['src/index.ts', 'src/index.ts']]))
  })

  it('does not cut a folder off the whole path when a short one is enough', () => {
    expect(fileTabLabels(['a/index.ts', 'b/index.ts', 'c/d/index.ts']))
      .toEqual(new Map([['a/index.ts', 'a/index.ts'], ['b/index.ts', 'b/index.ts'], ['c/d/index.ts', 'd/index.ts']]))
  })
})

describe('fuzzy ranking', () => {
  it('puts letters close together above letters scattered over a long path', () => {
    const paths = ['docs/framework/cordis/migration-from-0-4.md', 'docs/framework/cordis/acryl-in-a-cordis-app.md', 'src/main.ts', 'plugins/agent-panel/client/main.ts']
    expect(fuzzySearch('mai', paths).map(match => match.path).slice(0, 2)).toEqual(['src/main.ts', 'plugins/agent-panel/client/main.ts'])
  })

  it('puts a word that holds the letters above a file name that scatters them', () => {
    const paths = ['docs/framework/guides/bring-your-own-tool.md', 'plugins/acryl-router/src/browser/jsx-dom.ts', 'docs/framework/concepts/web-standard.md', 'plugins/team-board/index.ts', 'test/team-board.test.ts']
    expect(fuzzySearch('brd', paths).map(match => match.path).slice(0, 2)).toEqual(['test/team-board.test.ts', 'plugins/team-board/index.ts'])
  })
})

describe('the open file in the tree', () => {
  it('opens every folder above it, outermost first', () => {
    expect(foldersAbove('src/client/board.ts')).toEqual(['src', 'src/client'])
    expect(foldersAbove('package.json')).toEqual([])
  })
})

describe('a new branch name', () => {
  it('takes what git takes and says plainly what it refuses', () => {
    expect(branchNameProblem('feature-due-dates')).toBeUndefined()
    expect(branchNameProblem('team/board.v2')).toBeUndefined()
    expect(branchNameProblem(' ')).toBe('Name the branch.')
    expect(branchNameProblem('-x')).toMatch(/starting with a letter/)
    expect(branchNameProblem('a..b')).toBe('That is not a name git accepts.')
    expect(branchNameProblem('x.lock')).toBe('That is not a name git accepts.')
  })
})

describe('a branch request', () => {
  it('reads a name git would take, and says why one it would not cannot be used', () => {
    expect(parseBranchName({ name: 'feature-due-dates' })).toEqual({ name: 'feature-due-dates' })
    expect(parseBranchName({ name: 'a..b' })).toEqual({ problem: 'That is not a name git accepts.' })
    expect(parseBranchName({})).toEqual({ problem: 'Name the branch.' })
    expect(parseBranchName(null)).toEqual({ problem: 'Name the branch.' })
    expect(parseBranchName({ name: 7 })).toEqual({ problem: 'Name the branch.' })
  })
})

describe('switching a branch', () => {
  const main = { name: 'main', current: true }
  const feature = { name: 'feature', current: false }

  it('opens the current branch, switches to another, and asks first when files are unsaved', () => {
    expect(branchClick(main, 0)).toBe('toggle')
    // The current branch's click only opens what is running on it, whatever the unsaved count.
    expect(branchClick(main, 3)).toBe('toggle')
    expect(branchClick(feature, 0)).toBe('switch')
    expect(branchClick(feature, 2)).toBe('ask')
    // A count that could not be read never switches at once.
    expect(branchClick(feature, undefined)).toBe('ask')
  })

  it('names the save point after what it is for', () => {
    expect(saveBeforeSwitchMessage('feature-due-dates')).toBe('Save before switching to feature-due-dates')
  })
})

describe('the branch API', () => {
  const answering = (status: number, body: unknown, calls: { url: string; body: unknown }[]) =>
    createBranchesApi(async (url, init) => {
      calls.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    })

  it('asks the Host to switch, naming the branch', async () => {
    const calls: { url: string; body: unknown }[] = []
    await answering(200, { ok: true }, calls).switchTo('feature')
    expect(calls).toEqual([{ url: FRAME_BRANCHES_SWITCH_PATH, body: { name: 'feature' } }])
  })

  it('keeps git\'s reason when the switch is refused', async () => {
    const calls: { url: string; body: unknown }[] = []
    const api = answering(409, { error: 'error: Your local changes to the following files would be overwritten by checkout' }, calls)
    await expect(api.switchTo('feature')).rejects.toThrow('Your local changes')
    expect(calls[0]?.url).toBe(FRAME_BRANCHES_SWITCH_PATH)
  })

  it('creates through its own route', async () => {
    const calls: { url: string; body: unknown }[] = []
    await answering(200, { ok: true }, calls).create('feature')
    expect(calls).toEqual([{ url: FRAME_BRANCHES_NEW_PATH, body: { name: 'feature' } }])
  })

  it('answers a refusal without JSON with a plain line', async () => {
    const api = createBranchesApi(async () => new Response('nope', { status: 502 }))
    await expect(api.switchTo('feature')).rejects.toThrow('the branch could not be switched to (HTTP 502)')
  })
})

describe('a version\'s time', () => {
  const now = Date.parse('2026-11-03T18:00:00Z')

  it('reads short: now, minutes, hours, the weekday, then days', () => {
    expect(shortTime('2026-11-03T17:59:40Z', now)).toBe('now')
    expect(shortTime('2026-11-03T17:58:00Z', now)).toBe('2 min')
    expect(shortTime('2026-11-03T16:00:00Z', now)).toBe('2 h')
    expect(shortTime('2026-11-01T12:00:00Z', now)).toBe('Sun')
    expect(shortTime('2026-10-20T12:00:00Z', now)).toBe('14 d')
    expect(shortTime('not a time', now)).toBe('')
  })

  it('reads the same for a chat\'s last activity, and nothing when DSH did not say', () => {
    expect(chatTime(Date.parse('2026-11-03T17:59:50Z'), now)).toBe('now')
    expect(chatTime(Date.parse('2026-11-03T17:00:00Z'), now)).toBe('1 h')
    expect(chatTime(undefined, now)).toBe('')
  })
})

describe('going back to a version', () => {
  it('names the new version and the save point before it', () => {
    expect(backToMessage(2, 'Due dates')).toBe('Back to v2 · Due dates')
    expect(saveBeforeBackMessage(2)).toBe('Save before going back to v2')
  })

  it('asks plainly when the tree is clean, and says a save point comes first when files are unsaved or uncounted', () => {
    expect(backText(2, 'Due dates', 0)).toBe('Go back to v2 · Due dates? A new version records it, so every version stays.')
    expect(backText(2, 'Due dates', 1)).toBe('1 unsaved change. Save a point first, then go back to v2 · Due dates.')
    expect(backText(2, 'Due dates', 3)).toContain('3 unsaved changes. Save a point first')
    expect(backText(2, 'Due dates', undefined)).toContain('could not be counted. Save a point first')
  })
})

describe('shared versions', () => {
  it('marks the versions on another branch or the remote, never the current branch\'s own', async () => {
    const answers: Record<string, string> = {
      'for-each-ref --format=%(HEAD) %(refname:short) refs/heads': '* main\n  feature\n',
      'for-each-ref --format=%(refname) refs/heads refs/remotes': 'refs/heads/main\nrefs/heads/feature\nrefs/remotes/origin/main\n',
      'rev-list refs/heads/main': 'ddd\naaa\n',
      'rev-list refs/heads/feature': 'bbb\naaa\n',
      'rev-list refs/remotes/origin/main': 'ccc\nbbb\n',
    }
    const asked: string[] = []
    const git = {
      run: async (args: readonly string[]) => {
        const key = args.join(' ')
        asked.push(key)
        if (!(key in answers)) throw new Error(`unexpected git call: ${key}`)
        return { stdout: answers[key] ?? '' }
      },
    }
    expect((await sharedVersions(git, '/apps/a', ['aaa', 'bbb', 'ccc', 'ddd'])).sort()).toEqual(['aaa', 'bbb', 'ccc'])
    expect(asked).not.toContain('rev-list refs/heads/main')
  })

  it('answers nothing without versions, and nothing rather than failing when git refuses', async () => {
    expect(await sharedVersions({ run: async () => ({ stdout: '' }) }, '/apps/a', [])).toEqual([])
    const failing = { run: async () => { throw new Error('no git') } }
    expect(await sharedVersions(failing, '/apps/a', ['aaa'])).toEqual([])
  })

  it('reads only a list of hashes', () => {
    expect(parseSharedVersions({ shared: ['aaa'] })).toEqual(['aaa'])
    expect(() => parseSharedVersions({ shared: [7] })).toThrow('entry')
    expect(() => parseSharedVersions({})).toThrow('not a list')
  })
})

describe('chat history grouped by branch', () => {
  it('puts the checked-out branch first, the others by name, and a chat with no branch yet last', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
    const groups = historyGroups(rows, { a: 'main', b: 'feature-due-dates', c: 'main', d: 'alpha' }, 'feature-due-dates')
    expect(groups.map(group => [group.branch, group.rows.map(row => row.id)])).toEqual([
      ['feature-due-dates', ['b']],
      ['alpha', ['d']],
      ['main', ['a', 'c']],
      [undefined, ['e']],
    ])
  })
})
