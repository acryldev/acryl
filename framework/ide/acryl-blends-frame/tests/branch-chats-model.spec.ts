import { describe, expect, it, vi } from 'vitest'
import { BranchChatsStore } from '../src/client/branch-chats.ts'
import { branchChat, ChatsStore, decideChat, initialOpenChats, type ChatsView } from '../src/client/chats.ts'
import type { ChatRow } from '../src/client/LeftPanel.tsx'
import { chatTab, FrameTabs, parseStoredTabs, tabsForBranch } from '../src/client/tabs.ts'

const row = (id: string, options: { current?: boolean; updatedAt?: number } = {}): ChatRow => ({ id, title: id, current: options.current === true, ...(options.updatedAt === undefined ? {} : { updatedAt: options.updatedAt }) })

function view(overrides: Partial<ChatsView> & { rows: readonly ChatRow[]; branch: string }): ChatsView {
  return { real: new Map(), running: new Set(), assignments: {}, ...overrides }
}

describe('decideChat: the chat on screen belongs to the checked-out branch', () => {
  const both = {
    rows: [row('m1', { current: true, updatedAt: 3 }), row('f1', { updatedAt: 2 }), row('f0', { updatedAt: 1 })],
    real: new Map([['m1', 'x'], ['f1', 'x'], ['f0', 'x']]),
    assignments: { m1: 'main', f1: 'feature', f0: 'feature' },
  }

  it('leaves a chat of the branch alone', () => {
    expect(decideChat(view({ ...both, branch: 'main' }))).toEqual({ action: 'none' })
  })

  it("moves to the branch's newest chat after a switch, and back again", () => {
    expect(decideChat(view({ ...both, branch: 'feature' }))).toEqual({ action: 'open', id: 'f1' })
    const onFeature = { ...both, rows: [row('m1', { updatedAt: 3 }), row('f1', { current: true, updatedAt: 2 }), row('f0', { updatedAt: 1 })] }
    expect(decideChat(view({ ...onFeature, branch: 'main' }))).toEqual({ action: 'open', id: 'm1' })
  })

  it('makes a chat when the branch has none (a new branch)', () => {
    expect(decideChat(view({ ...both, branch: 'brand-new' }))).toEqual({ action: 'create' })
  })

  it("never moves a recorded chat to the branch it is shown on", () => {
    // main's chat is on screen while the folder is on feature: the decision is to show feature's, not to record main's chat for feature.
    expect(decideChat(view({ ...both, branch: 'feature' })).action).not.toBe('adopt')
  })

  it('records a chat with a turn that no branch was recorded for as the checked-out branch\'s', () => {
    expect(decideChat(view({ rows: [row('old', { current: true })], real: new Map([['old', 'x']]), branch: 'main' }))).toEqual({ action: 'adopt', id: 'old' })
    expect(decideChat(view({ rows: [row('run', { current: true })], running: new Set(['run']), branch: 'main' }))).toEqual({ action: 'adopt', id: 'run' })
  })

  it('records a blank unrecorded chat only when the branch has no chat yet; otherwise it is a stray', () => {
    expect(decideChat(view({ rows: [row('blank', { current: true })], branch: 'main' }))).toEqual({ action: 'adopt', id: 'blank' })
    expect(decideChat(view({
      rows: [row('stray', { current: true }), row('own', { updatedAt: 1 })],
      real: new Map([['own', 'x']]),
      assignments: { own: 'main' },
      branch: 'main',
    }))).toEqual({ action: 'open', id: 'own' })
  })

  it("shows the branch's chat when none is on screen, and leaves DSH's choice when the branch has none", () => {
    expect(decideChat(view({ rows: [row('m1')], real: new Map([['m1', 'x']]), assignments: { m1: 'main' }, branch: 'main' }))).toEqual({ action: 'open', id: 'm1' })
    expect(decideChat(view({ rows: [], branch: 'main' }))).toEqual({ action: 'none' })
  })

  it("follows a chat tab's own chat on the branch", () => {
    const own = { rows: [row('a', { current: true, updatedAt: 2 }), row('b', { updatedAt: 1 })], real: new Map([['a', 'x'], ['b', 'x']]), assignments: { a: 'main', b: 'main' }, branch: 'main' }
    expect(decideChat(view({ ...own, preferred: 'b' }))).toEqual({ action: 'open', id: 'b' })
    expect(decideChat(view({ ...own, preferred: 'a' }))).toEqual({ action: 'none' })
    // A tab's chat of another branch is no preference.
    expect(decideChat(view({ ...own, preferred: 'elsewhere' }))).toEqual({ action: 'none' })
  })

  it('branchChat skips the chats that have a tab of their own', () => {
    const v = view({ rows: [row('a', { updatedAt: 2 }), row('b', { updatedAt: 1 })], real: new Map([['a', 'x'], ['b', 'x']]), assignments: { a: 'main', b: 'main' }, branch: 'main' })
    expect(branchChat(v)?.id).toBe('a')
    expect(branchChat(v, new Set(['a']))?.id).toBe('b')
    expect(branchChat(v, new Set(['a', 'b']))).toBeUndefined()
  })
})

describe('open and closed chats', () => {
  const closedMix = {
    rows: [row('a', { current: true, updatedAt: 3 }), row('b', { updatedAt: 2 }), row('c', { updatedAt: 1 })],
    real: new Map([['a', 'x'], ['b', 'x'], ['c', 'x']]),
    assignments: { a: 'main', b: 'main', c: 'main' },
    branch: 'main',
  }

  it("never shows a closed chat as the branch's own", () => {
    const open = new Set(['c'])
    expect(branchChat(view({ ...closedMix, open }))?.id).toBe('c')
    expect(branchChat(view({ ...closedMix, open: new Set() }))).toBeUndefined()
    // No set at all: nothing is closed.
    expect(branchChat(view(closedMix))?.id).toBe('a')
  })

  it('makes a chat for a branch whose chats are all closed', () => {
    const onFeature = { ...closedMix, rows: [row('a', { updatedAt: 3 }), row('f', { current: true, updatedAt: 1 })], assignments: { a: 'main', f: 'feature' } }
    expect(decideChat(view({ ...onFeature, branch: 'main', open: new Set(['f']) }))).toEqual({ action: 'create' })
    expect(decideChat(view({ ...onFeature, branch: 'main', open: new Set(['a', 'f']) }))).toEqual({ action: 'open', id: 'a' })
  })

  it('opens the latest chat with a turn of each branch, the chat on screen and the chats with a tab; the rest is closed', () => {
    const rows = [row('m2', { updatedAt: 5 }), row('f2', { current: true, updatedAt: 4 }), row('m1', { updatedAt: 3 }), row('f1', { updatedAt: 2 }), row('t', { updatedAt: 1 })]
    const real = new Map(['m2', 'f2', 'm1', 'f1', 't'].map(id => [id, 'x']))
    const assignments = { m2: 'main', m1: 'main', f2: 'feature', f1: 'feature', t: 'main' }
    expect(initialOpenChats({ rows, real, running: new Set(), assignments })).toEqual(['m2', 'f2'])
    expect(initialOpenChats({ rows, real, running: new Set(), assignments }, new Set(['t']))).toEqual(['m2', 'f2', 't'])
  })

  it('does not open a blank stray session nobody recorded', () => {
    const rows = [row('stray', { current: true, updatedAt: 9 }), row('m1', { updatedAt: 1 })]
    expect(initialOpenChats({ rows, real: new Map([['m1', 'x']]), running: new Set(), assignments: { m1: 'main' } })).toEqual(['m1'])
  })

  it('an app with many chats and no decision opens with only the latest chat per branch', async () => {
    const t = setup({ ids: ['m3', 'm2', 'm1', 'f1'], recorded: { m3: 'main', m2: 'main', m1: 'main', f1: 'feature' }, real: ['m3', 'm2', 'm1', 'f1'], open: null })
    await t.start()
    expect([...t.map.getOpen()].sort()).toEqual(['f1', 'm3'])
    expect(t.openWrites).toEqual([['m3', 'f1']])
    expect(t.dsh.opened.at(-1)).toBe('m3')
  })

  it('shows a closed chat of the branch as a tab and keeps it open from then on', async () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    const t = setup({ ids: ['m2', 'm1'], recorded: { m2: 'main', m1: 'main' }, real: ['m2', 'm1'], open: ['m2'], tabs })
    await t.start()
    expect(t.map.isOpen('m1')).toBe(false)
    t.chats.show('m1')
    await settle()
    expect(t.map.isOpen('m1')).toBe(true)
    expect(t.openWrites).toContainEqual(['m1', true])
    expect(tabs.getSnapshot().tabs.map(tab => tab.id)).toEqual(['chat', 'chat:m1'])
    expect(tabs.getSnapshot().active).toBe('chat:m1')
    expect(t.dsh.shown()).toBe('m1')
  })

  it('closing the chat on screen closes it and shows the base tab\'s chat, and the chat stays closed', async () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    const t = setup({ ids: ['m2', 'm1'], recorded: { m2: 'main', m1: 'main' }, real: ['m2', 'm1'], open: ['m2', 'm1'], tabs })
    await t.start()
    t.chats.show('m1')
    await settle()
    expect(t.dsh.shown()).toBe('m1')
    t.prefer(undefined)
    tabs.close('chat:m1')
    t.chats.closeChat('m1', new Set())
    await settle()
    expect(t.map.isOpen('m1')).toBe(false)
    expect(t.dsh.shown()).toBe('m2')
    expect(t.openWrites).toContainEqual(['m1', false])
    // Reconciling again never reopens it.
    t.chats.reconcile()
    await settle()
    expect(t.map.isOpen('m1')).toBe(false)
  })

  it('closing the only open chat on screen makes a new chat for the base tab', async () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    const t = setup({ ids: ['m1'], recorded: { m1: 'main' }, real: ['m1'], open: ['m1'], tabs })
    await t.start()
    t.chats.closeChat('m1', new Set())
    await settle()
    expect(t.map.isOpen('m1')).toBe(false)
    expect(t.dsh.created).toHaveBeenCalledTimes(1)
    expect(t.dsh.shown()).toBe('s2')
    expect(t.map.isOpen('s2')).toBe(true)
  })

  it('closing a chat that is not on screen only closes it', async () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    const t = setup({ ids: ['m2', 'm1'], recorded: { m2: 'main', m1: 'main' }, real: ['m2', 'm1'], open: ['m2', 'm1'], tabs })
    await t.start()
    const shown = t.dsh.shown()
    t.chats.closeChat('m1', new Set())
    await settle()
    expect(t.dsh.shown()).toBe(shown)
    expect(t.map.isOpen('m1')).toBe(false)
  })

  it('the chat on screen is open', async () => {
    const t = setup({ ids: ['m2', 'm1'], recorded: { m2: 'main', m1: 'main' }, real: ['m2', 'm1'], open: ['m2'] })
    await t.start()
    t.dsh.show('m1')
    await settle()
    expect(t.map.isOpen('m1')).toBe(true)
  })

  it('gives every open chat of the branch a tab on a page that has none, except the one the base tab shows', async () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    const t = setup({ ids: ['m3', 'm2', 'm1'], recorded: { m3: 'main', m2: 'main', m1: 'main' }, real: ['m3', 'm2', 'm1'], open: ['m3', 'm2'], tabs })
    await t.start()
    expect(tabs.getSnapshot().tabs.map(tab => tab.id)).toEqual(['chat', 'chat:m2'])
    expect(tabs.getSnapshot().active).toBe('chat')
    expect(t.dsh.shown()).toBe('m3')
    // The tab belongs to the branch the chat is on, even when the strip has not heard of a branch switch yet.
    tabs.setBranch('elsewhere')
    t.switchTo('feature')
    await settle()
    expect(tabsForBranch(tabs.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['chat', 'chat:m2'])
  })

  it('a chat tab of a chat that is not open is dropped from the strip', () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    tabs.open(chatTab('a'))
    tabs.open(chatTab('b'))
    tabs.open({ kind: 'files', id: 'files' })
    expect(tabs.closeChatsNotIn(new Set(['a']))).toBe(true)
    expect(tabs.getSnapshot().tabs.map(tab => tab.id)).toEqual(['chat', 'chat:a', 'files'])
    expect(tabs.closeChatsNotIn(new Set(['a']))).toBe(false)
    tabs.activate('chat:a')
    tabs.closeChatsNotIn(new Set())
    expect(tabs.getSnapshot().active).toBe('chat')
  })
})

describe('BranchChatsStore: open chats', () => {
  const api = (open: string[] | null) => {
    const writes: unknown[] = []
    let fail = false
    return {
      writes,
      failWrites: () => { fail = true },
      api: {
        read: async () => ({ chats: { a: 'main' }, open }),
        assign: async () => {},
        setOpen: async (id: string, on: boolean) => { if (fail) throw new Error('no'); writes.push([id, on]) },
        initOpen: async (ids: readonly string[]) => { writes.push([...ids]) },
      },
    }
  }

  it("takes the Host's open chats, and decides only when the Host has none", async () => {
    const known = api(['a'])
    const map = new BranchChatsStore(known.api)
    await map.load()
    expect(map.isOpenKnown()).toBe(true)
    map.initOpen(['z'])
    expect([...map.getOpen()]).toEqual(['a'])
    const fresh = api(null)
    const undecided = new BranchChatsStore(fresh.api)
    await undecided.load()
    expect(undecided.isOpenKnown()).toBe(false)
    undecided.initOpen(['x', 'y'])
    undecided.initOpen(['other'])
    expect([...undecided.getOpen()]).toEqual(['x', 'y'])
    expect(fresh.writes).toEqual([['x', 'y']])
  })

  it('opens and closes at once, writes it, and puts a refused write back', async () => {
    const host = api(['a'])
    const map = new BranchChatsStore(host.api)
    await map.load()
    let told = 0
    map.subscribe(() => { told += 1 })
    map.setOpen('b', true)
    expect(map.isOpen('b')).toBe(true)
    map.setOpen('b', true)
    expect(told).toBe(1)
    host.failWrites()
    map.setOpen('a', false)
    expect(map.isOpen('a')).toBe(false)
    await settle()
    expect(map.isOpen('a')).toBe(true)
    expect(host.writes).toEqual([['b', true]])
  })

  it('a chat opened or closed before the open chats are known is left to the first decision', async () => {
    const map = new BranchChatsStore(api(null).api)
    map.setOpen('a', true)
    expect(map.isOpenKnown()).toBe(false)
  })
})

/** DSH's sessions as the store sees them: a list that tells its subscribers, creation, and the navigation that moves the main view. */
function fakeDsh(initial: string[] = [], stepwise = false) {
  const ids = [...initial]
  let current: string | undefined
  const subscribers = new Set<() => void>()
  const opened: string[] = []
  const snapshot = () => ({
    ids: [...ids],
    byId: Object.fromEntries(ids.map((id, index) => [id, { id, title: null, retainedBy: { mainView: id === current ? 1 : 0 }, running: false, updatedAt: 1000 - index }])),
  })
  const sessions = {
    list: { getSnapshot: snapshot, subscribe: (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener) } } },
    create: vi.fn(async () => { const id = `s${String(ids.length + 1)}`; ids.unshift(id); for (const listener of subscribers) listener(); return id }),
    retain: vi.fn(),
  }
  const notify = () => { for (const listener of subscribers) listener() }
  return {
    sessions: sessions as never,
    opened,
    show(id: string) { current = id; notify() },
    /** DSH moving its main view: the chat is set, subscribers are told, and the move ends by setting it again (a chat opened meanwhile is replaced). */
    move(id: string) { current = id; notify(); current = id },
    shown: () => current,
    // `stepwise`: DSH releases the old chat and tells its subscribers, then retains the new one (a view with no chat in between).
    navigation: {
      openSession: (id: unknown) => {
        opened.push(String(id))
        if (!stepwise) { current = String(id); notify(); return }
        current = undefined
        notify()
        queueMicrotask(() => { current = String(id); notify() })
      },
    } as never,
    created: sessions.create,
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

function setup(options: { ids?: string[]; recorded?: Record<string, string>; real?: string[]; branch?: string; stepwise?: boolean; open?: string[] | null; tabs?: FrameTabs } = {}) {
  const dsh = fakeDsh(options.ids ?? [], options.stepwise)
  const written: Array<[string, string]> = []
  const openWrites: Array<[string, boolean] | string[]> = []
  // Unless a test says which chats are open, every chat the app has is (the model before chats could be closed).
  const map = new BranchChatsStore({
    read: async () => ({ chats: { ...options.recorded }, open: options.open === undefined ? [...(options.ids ?? [])] : options.open }),
    assign: async (id, branch) => { written.push([id, branch]) },
    setOpen: async (id, open) => { openWrites.push([id, open]) },
    initOpen: async ids => { openWrites.push([...ids]) },
  })
  let branch = options.branch ?? 'main'
  let preferred: string | undefined
  const real = new Set(options.real ?? [])
  const chats = new ChatsStore({
    navigation: () => dsh.navigation,
    realChats: { read: async () => [...real].map(id => ({ id, title: `title ${id}` })) },
    branchChats: map,
    branch: () => branch,
    appRoot: () => '/app',
    preferred: () => preferred,
    ...(options.tabs === undefined ? {} : { tabs: options.tabs }),
  })
  return {
    dsh, map, chats, written, real, openWrites,
    switchTo: (next: string) => { branch = next; chats.reconcile() },
    prefer: (id: string | undefined) => { preferred = id },
    start: async () => { await map.load(); chats.watch(dsh.sessions); await settle() },
  }
}

describe('ChatsStore keeps the chat on screen on the checked-out branch', () => {
  it('shows main\'s chat on main and feature\'s on feature, and records nobody twice', async () => {
    const t = setup({ ids: ['f1', 'm1'], recorded: { m1: 'main', f1: 'feature' }, real: ['m1', 'f1'] })
    await t.start()
    expect(t.dsh.opened.at(-1)).toBe('m1')
    t.switchTo('feature')
    await settle()
    expect(t.dsh.opened.at(-1)).toBe('f1')
    t.switchTo('main')
    await settle()
    expect(t.dsh.opened.at(-1)).toBe('m1')
    // Nothing was recorded by switching: both chats were recorded before.
    expect(t.written).toEqual([])
  })

  it('asks DSH for a chat once while DSH swaps the view in steps, even though a step has no chat on screen', async () => {
    const t = setup({ ids: ['f1', 'm1'], recorded: { m1: 'main', f1: 'feature' }, real: ['m1', 'f1'], stepwise: true })
    await t.start()
    expect(t.dsh.opened).toEqual(['m1'])
    t.switchTo('feature')
    await settle()
    expect(t.dsh.opened).toEqual(['m1', 'f1'])
    t.switchTo('main')
    await settle()
    expect(t.dsh.opened).toEqual(['m1', 'f1', 'm1'])
  })

  it('lets someone else\'s navigation stand in the way of the ask: the next decision opens the branch\'s chat again', async () => {
    const t = setup({ ids: ['f1', 'm1', 'm2'], recorded: { m1: 'main', m2: 'main', f1: 'feature' }, real: ['m1', 'm2', 'f1'] })
    await t.start()
    t.dsh.show('m2')
    t.switchTo('feature')
    await settle()
    expect(t.dsh.opened.at(-1)).toBe('f1')
    // The person opens main's other chat from somewhere else (a link): feature's chat is asked for again, once.
    t.dsh.show('m1')
    await settle()
    expect(t.dsh.opened.filter(id => id === 'f1')).toHaveLength(2)
  })

  it('opens its chat after DSH has finished moving the view, not from inside the notification (DSH keeps the view it started with)', async () => {
    const t = setup({ ids: ['x', 'm1'], recorded: { m1: 'main' }, real: ['m1'] })
    await t.start()
    // DSH's own start-up made a blank chat and moves the main view to it.
    t.dsh.move('x')
    await settle()
    expect(t.dsh.shown()).toBe('m1')
  })

  it('makes a chat for a branch that has none, records it for that branch, and shows it', async () => {
    const t = setup({ ids: ['m1'], recorded: { m1: 'main' }, real: ['m1'] })
    await t.start()
    t.switchTo('feature')
    await settle()
    expect(t.dsh.created).toHaveBeenCalledTimes(1)
    expect(t.written).toEqual([['s2', 'feature']])
    expect(t.map.getSnapshot().s2).toBe('feature')
    expect(t.dsh.opened.at(-1)).toBe('s2')
    // The same switch heard again makes no second chat.
    t.chats.reconcile()
    await settle()
    expect(t.dsh.created).toHaveBeenCalledTimes(1)
  })

  it('does nothing before the Host\'s map and chat list are read (an unrecorded chat may only be one it has not heard of)', async () => {
    const t = setup({ ids: ['m1'], recorded: { m1: 'main' }, real: ['m1'] })
    t.dsh.show('m1')
    t.chats.watch(t.dsh.sessions)
    t.chats.reconcile()
    await settle()
    // The map loaded by the reconcile itself; only then did it act, and main's chat on main needs no change.
    expect(t.written).toEqual([])
    expect(t.dsh.created).not.toHaveBeenCalled()
  })

  it('records a chat made by DSH on first sight, on the branch it is open on, and never moves it afterwards', async () => {
    const t = setup({ ids: ['x'], real: ['x'] })
    t.dsh.show('x')
    await t.start()
    expect(t.written).toEqual([['x', 'main']])
    t.switchTo('feature')
    await settle()
    // feature has no chat, so one is made for it; x stays main's.
    expect(t.written).toEqual([['x', 'main'], ['s2', 'feature']])
    expect(t.map.getSnapshot().x).toBe('main')
  })

  it('+ then Chat makes a new chat on the current branch, and reuses the one on screen while it has no turn', async () => {
    const t = setup({ ids: ['m1'], recorded: { m1: 'main' }, real: ['m1'] })
    await t.start()
    const first = await t.chats.startChat()
    expect(first).toEqual({ id: 's2', made: true })
    expect(t.map.getSnapshot().s2).toBe('main')
    await settle()
    // s2 is on screen and has no turn: another + Chat is the same chat.
    expect(await t.chats.startChat()).toEqual({ id: 's2', made: false })
    expect(t.dsh.created).toHaveBeenCalledTimes(1)
    // Once it has a turn, + Chat makes the next one.
    t.real.add('s2')
    t.dsh.show('s2')
    await settle()
    expect(await t.chats.startChat()).toEqual({ id: 's3', made: true })
    expect(t.map.getSnapshot().s3).toBe('main')
  })

  it('shows the chat of the active chat tab when the strip asks for it', async () => {
    const t = setup({ ids: ['b', 'a'], recorded: { a: 'main', b: 'main' }, real: ['a', 'b'] })
    await t.start()
    t.prefer('b')
    t.chats.reconcile()
    await settle()
    expect(t.dsh.opened.at(-1)).toBe('b')
  })

  it('openPrimary shows the branch chat that has no tab of its own', async () => {
    const t = setup({ ids: ['b', 'a'], recorded: { a: 'main', b: 'main' }, real: ['a', 'b'] })
    await t.start()
    t.chats.openPrimary(new Set(['b']))
    expect(t.dsh.opened.at(-1)).toBe('a')
  })
})

describe('chat tabs', () => {
  it('keeps the base tab on every branch and a chat tab only on its own branch', () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    tabs.open(chatTab('s1'))
    tabs.setBranch('feature')
    tabs.open(chatTab('s2'))
    expect(tabsForBranch(tabs.getSnapshot(), 'main').map(tab => tab.id)).toEqual(['chat', 'chat:s1'])
    expect(tabsForBranch(tabs.getSnapshot(), 'feature').map(tab => tab.id)).toEqual(['chat', 'chat:s2'])
  })

  it('closes the base tab too, finds the tab that shows a chat, and reopens the base when a chat is activated', () => {
    const tabs = new FrameTabs()
    tabs.setBranch('main')
    tabs.open(chatTab('s1'))
    expect(tabs.chatTabId('s1')).toBe('chat:s1')
    expect(tabs.chatTabId('other')).toBe('chat')
    expect(tabs.close('chat')?.id).toBe('chat')
    expect(tabs.close('chat')).toBeUndefined()
    expect(tabs.getSnapshot().baseClosed).toBe(true)
    expect(tabs.close('chat:s1')?.id).toBe('chat:s1')
    // The strip is empty; asking for the chat again brings the base tab back.
    expect(tabs.getSnapshot().active).toBe('')
    tabs.activate('chat')
    expect(tabs.getSnapshot().baseClosed).toBeUndefined()
    expect(tabs.getSnapshot().active).toBe('chat')
  })

  it('remembers a chat tab with its branch across a reload', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } }
    const tabs = new FrameTabs(storage)
    tabs.setBranch('main')
    tabs.open(chatTab('s1'))
    const again = new FrameTabs(storage).getSnapshot()
    expect(again.tabs).toEqual([{ kind: 'chat', id: 'chat' }, { kind: 'chat', id: 'chat:s1', session: 's1', branch: 'main' }])
    expect(again.active).toBe('chat:s1')
    expect(parseStoredTabs('{"tabs":[{"kind":"chat","session":""}]}').tabs).toEqual([{ kind: 'chat', id: 'chat' }])
  })
})

describe('BranchChatsStore.isLoaded', () => {
  it('is false until the Host answers, and a failed read leaves it false', async () => {
    let fail = true
    const map = new BranchChatsStore({
      read: async () => { if (fail) throw new Error('down'); return { chats: { a: 'main' }, open: null } },
      assign: async () => {},
      setOpen: async () => {},
      initOpen: async () => {},
    })
    expect(map.isLoaded()).toBe(false)
    await map.load()
    expect(map.isLoaded()).toBe(false)
    fail = false
    await map.load()
    expect(map.isLoaded()).toBe(true)
    expect(map.getSnapshot()).toEqual({ a: 'main' })
  })
})
