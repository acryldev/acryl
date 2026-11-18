// @vitest-environment jsdom

/** The picked element's name and selector, the context a message carries for it, and the rule for when that context is written. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SelectionStore, carriesSelection, elementLabel, elementSelector, handOffSelection, selectedElement,
} from '../src/client/selection.ts'

afterEach(() => { document.body.innerHTML = '' })

function element(html: string): Element {
  document.body.innerHTML = html
  const first = document.body.firstElementChild
  if (first === null) throw new Error('the fixture rendered no element')
  return first
}

describe('elementLabel', () => {
  it('prefers what the element says it is', () => {
    const target = element('<div aria-label="Task card" title="Ignored">Fix the invite link</div>')
    expect(elementLabel(target)).toBe('Task card')
  })

  it('else names the words it shows, clipped', () => {
    const target = element('<div><h3>Fix the invite link</h3><span>Ben · due Thu</span></div>')
    expect(elementLabel(target)).toBe('"Fix the invite link"')
    // A card with no heading is named by its first line, not by every line run together.
    expect(elementLabel(element('<div class="task">Fix the invite link<div class="who">Ben · due Thu</div></div>'))).toBe('"Fix the invite link"')
    // A bold name inside the card is not its title.
    expect(elementLabel(element('<div class="task">Fix the invite link<div class="who"><b>Ben</b> · due Thu</div></div>'))).toBe('"Fix the invite link"')
    const long = element(`<div>${'a'.repeat(40)}</div>`)
    expect(elementLabel(long)).toBe(`"${'a'.repeat(34)}…"`)
  })

  it('falls back to the tag when it names nothing', () => {
    expect(elementLabel(element('<span></span>'))).toBe('span')
  })
})

describe('elementSelector', () => {
  it('walks up to the nearest id and names each step', () => {
    const target = element('<section id="board"><div class="task">Fix the invite link</div></section>').querySelector('div')
    expect(elementSelector(target as Element)).toBe('#board > div')
  })

  it('names a sibling by its place among the same tag', () => {
    const target = element('<div><p>one</p><p>two</p></div>').querySelectorAll('p')[1]
    expect(elementSelector(target as Element)).toBe('body > div > p:nth-of-type(2)')
  })

  it('names the page itself', () => {
    expect(elementSelector(document.body)).toBe('body')
  })
})

describe('the element as the chat carries it', () => {
  it('keeps the page the canvas showed, the name, and the selector', () => {
    const target = element('<section id="board"><div aria-label="Task card"><button>Fix the invite link</button></div></section>').querySelector('div')
    expect(selectedElement(target as Element, '/board?filter=mine')).toEqual({
      label: 'Task card',
      selector: '#board > div',
      page: '/board?filter=mine',
    })
  })

})

describe('the pick at the send gesture', () => {
  const picked = { label: 'Task card', selector: '#board > div', page: '/board' }

  it('belongs to a draft with words, and to no blank draft or slash command', () => {
    expect(carriesSelection('Fix the invite link.')).toBe(true)
    expect(carriesSelection('   ')).toBe(false)
    expect(carriesSelection('/help')).toBe(false)
  })

  it('is posted to the Host before the message, once, with its chat and element', async () => {
    const calls: { url: string; body: unknown }[] = []
    const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response(null, { status: 202 })
    }
    expect(await handOffSelection(fetcher, 'chat-1', picked)).toBe(true)
    expect(calls).toEqual([{ url: '/api/acryl-blends-frame/selection', body: { session: 'chat-1', ...picked } }])
  })

  it('costs only the context when the Host refuses it or the post fails', async () => {
    expect(await handOffSelection(async () => new Response(null, { status: 400 }), 'chat-1', picked)).toBe(false)
    expect(await handOffSelection(async () => { throw new Error('offline') }, 'chat-1', picked)).toBe(false)
  })
})

describe('SelectionStore', () => {
  it('publishes the picked element and clears it, telling subscribers each time', () => {
    const store = new SelectionStore()
    const seen: Array<string | undefined> = []
    const stop = store.subscribe(() => seen.push(store.getSnapshot().selection?.label))
    expect(store.getSnapshot().selection).toBeUndefined()
    store.select({ label: 'Task card', selector: '#board > div', page: '/board' })
    expect(store.getSnapshot().selection).toEqual({ label: 'Task card', selector: '#board > div', page: '/board' })
    store.clear()
    expect(store.getSnapshot().selection).toBeUndefined()
    store.clear()
    stop()
    store.select({ label: 'Other', selector: 'p', page: '/' })
    expect(seen).toEqual(['Task card', undefined])
    expect(vi.isMockFunction(store.subscribe)).toBe(false)
  })
})
