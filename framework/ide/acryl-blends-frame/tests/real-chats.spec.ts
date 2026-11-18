import { describe, expect, it } from 'vitest'
import type { ChatRow } from '../src/client/LeftPanel.tsx'
import { visibleChats } from '../src/client/chats.ts'
import { type ChatLook, lookAtLog, RealChats } from '../src/real-chats.ts'

const row = (id: string, title = 'New chat', current = false): ChatRow => ({ id, title, current })
const user = (text: string) => ({ type: 'user/message', data: { content: [{ type: 'text', text }] } })

describe('the left panel lists only real chats, named', () => {
  it('hides a chat with no turn unless it is the open one or is running, and names an unloaded one from the Host', () => {
    const rows = [row('a'), row('b', 'New chat', true), row('c'), row('d'), row('e', 'Own title')]
    const real = new Map([['c', 'Add due dates'], ['e', 'From the log']])
    expect(visibleChats(rows, real, new Set(['d'])).map(r => [r.id, r.title])).toEqual([['b', 'New chat'], ['c', 'Add due dates'], ['d', 'New chat'], ['e', 'Own title']])
    expect(visibleChats(rows, new Map()).map(r => r.id)).toEqual(['b'])
  })
})

describe('what the Host reads from a session log', () => {
  it("takes DSH's own title (the latest) over the first message", () => {
    const look = lookAtLog([user('Add due dates to the cards'), { type: 'turn/start' }, { type: 'session/title', data: { title: 'Old' } }, { type: 'session/title', data: { title: 'Due dates' } }])
    expect(look).toEqual({ hasTurn: true, title: 'Due dates', named: true })
  })

  it('falls back to the first user message cut short, and to nothing for an empty log', () => {
    const look = lookAtLog([user('Show the due date on every card and sort the board by it. Then more.'), { type: 'turn/start' }])
    expect(look.hasTurn).toBe(true)
    expect(look.named).toBe(false)
    expect(look.title).toBe('Show the due date on every card…')
    expect(lookAtLog([])).toEqual({ hasTurn: false, title: undefined, named: false })
  })
})

describe('RealChats', () => {
  const make = (looks: Record<string, ChatLook>, asked: string[], now: { t: number }) => new RealChats({
    list: async () => Object.keys(looks),
    look: async (id) => { asked.push(id); return looks[id] as ChatLook },
    now: () => now.t,
    refreshMs: 100,
  })

  it('lists the chats with a turn with their titles, and reads a named chat only once', async () => {
    const asked: string[] = []
    const now = { t: 0 }
    const real = make({ a: { hasTurn: true, title: 'Due dates', named: true }, b: { hasTurn: false, title: undefined, named: false } }, asked, now)
    expect(await real.read()).toEqual([{ id: 'a', title: 'Due dates' }])
    now.t = 10_000
    await real.read()
    expect(asked).toEqual(['a', 'b', 'b'])
  })

  it('reads a chat named from its first message again after a while, so DSH title can replace it', async () => {
    const asked: string[] = []
    const now = { t: 0 }
    const looks: Record<string, ChatLook> = { a: { hasTurn: true, title: 'First message', named: false } }
    const real = make(looks, asked, now)
    await real.read()
    now.t = 50
    await real.read()
    looks.a = { hasTurn: true, title: 'DSH title', named: true }
    now.t = 500
    expect(await real.read()).toEqual([{ id: 'a', title: 'DSH title' }])
    expect(asked).toEqual(['a', 'a'])
  })
})
