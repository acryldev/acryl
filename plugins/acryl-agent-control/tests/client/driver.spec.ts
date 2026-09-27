// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UiControlError, type UiActionResult, type UiSnapshot } from '../../src/contract.ts'
import { UiDriver } from '../../src/client/driver/driver.ts'
import { renderSnapshot } from '../../src/snapshot-text.ts'

/** A driver whose sleeping is instant, so waits and yields need no real time. */
function makeDriver(options: { userIdleMs?: () => number } = {}): UiDriver {
  return new UiDriver({
    document: () => document,
    sleep: async (_ms, signal) => { if (signal.aborted) throw signal.reason; await Promise.resolve() },
    ...(options.userIdleMs === undefined ? {} : { msSinceUserInput: options.userIdleMs }),
  })
}

const snap = async (driver: UiDriver): Promise<UiSnapshot> => (await driver.handle({ op: 'snapshot' })) as UiSnapshot
const refOf = (snapshot: UiSnapshot, role: string, name: string): string => {
  const node = snapshot.nodes.find(n => n.role === role && n.name === name)
  if (node === undefined) throw new Error(`no ${role} "${name}" in snapshot: ${renderSnapshot(snapshot)}`)
  return node.ref
}
const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try { await promise; return 'ok' } catch (cause) { return cause instanceof UiControlError ? cause.code : `other: ${String(cause)}` }
}

beforeEach(() => { document.title = 'ACRYL'; document.body.innerHTML = '' })
afterEach(() => { document.body.innerHTML = '' })

describe('snapshot', () => {
  it('lists interactive controls, headings and landmarks with roles, names and states', async () => {
    document.body.innerHTML = `
      <nav aria-label="Main"><a href="/x">Projects</a></nav>
      <main>
        <h1>Workspace</h1>
        <button>Add project</button>
        <button disabled>Save</button>
        <label>Branch <input type="text" value="main"></label>
        <input type="checkbox" aria-label="Show hidden" checked>
        <button aria-expanded="true" aria-label="Menu">≡</button>
        <select aria-label="Model"><option>fast</option><option selected>pro</option></select>
      </main>`
    const s = await snap(makeDriver())
    const by = (role: string, name: string) => s.nodes.find(n => n.role === role && n.name === name)
    expect(by('navigation', 'Main')).toBeDefined()
    expect(by('link', 'Projects')).toBeDefined()
    expect(by('heading', 'Workspace')?.level).toBe(1)
    expect(by('button', 'Add project')?.states).toEqual([])
    expect(by('button', 'Save')?.states).toContain('disabled')
    expect(by('textbox', 'Branch')?.value).toBe('main')
    expect(by('checkbox', 'Show hidden')?.states).toContain('checked')
    expect(by('button', 'Menu')?.states).toContain('expanded')
    expect(by('combobox', 'Model')?.value).toBe('pro')
    expect(s.title).toBe('ACRYL')
    expect(renderSnapshot(s)).toContain('- button "Add project" [ref=')
  })

  it('leaves out hidden content, script, and the driver’s own indicator', async () => {
    document.body.innerHTML = `
      <button hidden>Ghost</button><div aria-hidden="true"><button>Aria hidden</button></div>
      <div style="display:none"><button>Not shown</button></div>
      <div data-acryl-agent-control><button>Stop</button></div>
      <button>Real</button>`
    const names = (await snap(makeDriver())).nodes.map(n => n.name)
    expect(names).toEqual(['Real'])
  })

  it('never lists secret or payment fields, by type, autocomplete, name, or marked area', async () => {
    document.body.innerHTML = `
      <input type="password" aria-label="Pass">
      <input type="text" name="api_key" aria-label="Key field">
      <input type="text" autocomplete="cc-number" aria-label="Card number">
      <input type="text" placeholder="Enter your token">
      <input type="text" autocomplete="one-time-code" aria-label="Code">
      <div data-acryl-sensitive><input type="text" aria-label="Inside marked area"><button>Inside button</button></div>
      <input type="text" aria-label="Project name" value="acryl">`
    const s = await snap(makeDriver())
    expect(s.nodes.map(n => n.name)).toEqual(['Project name'])
    expect(JSON.stringify(s)).not.toMatch(/Pass|Key field|Card number|token|Inside/)
  })

  it('caps the size and pages through the rest without losing or repeating elements', async () => {
    document.body.innerHTML = Array.from({ length: 25 }, (_, i) => `<button>b${String(i)}</button>`).join('')
    const driver = makeDriver()
    const first = (await driver.handle({ op: 'snapshot', maxNodes: 10 })) as UiSnapshot
    expect(first.nodes).toHaveLength(10)
    expect(first.total).toBe(25)
    expect(first.nextCursor).toBe(10)
    const second = (await driver.handle({ op: 'snapshot', cursor: 10, maxNodes: 10 })) as UiSnapshot
    const third = (await driver.handle({ op: 'snapshot', cursor: 20, maxNodes: 10 })) as UiSnapshot
    expect(third.nextCursor).toBeUndefined()
    expect([...first.nodes, ...second.nodes, ...third.nodes].map(n => n.name)).toEqual(Array.from({ length: 25 }, (_, i) => `b${String(i)}`))
    expect(new Set([first.generation, second.generation, third.generation]).size).toBe(1)
  })

  it('lists what is in the window first when the page has layout', async () => {
    document.body.innerHTML = '<button id="a">Below</button><button id="b">Visible</button>'
    const rect = (top: number): DOMRect => ({ top, bottom: top + 20, left: 0, right: 50, width: 50, height: 20, x: 0, y: top, toJSON: () => ({}) })
    document.getElementById('a')!.getBoundingClientRect = () => rect(5000)
    document.getElementById('b')!.getBoundingClientRect = () => rect(10)
    const s = await snap(makeDriver())
    expect(s.nodes.map(n => n.name)).toEqual(['Visible', 'Below'])
  })

  it('refuses a page of a snapshot that was replaced', async () => {
    document.body.innerHTML = '<button>a</button><button>b</button><button>c</button>'
    const driver = makeDriver()
    await driver.handle({ op: 'snapshot', maxNodes: 1 })
    expect(await codeOf(driver.handle({ op: 'snapshot', cursor: 99 }))).toBe('stale-ref')
  })
})

describe('refs', () => {
  it('go stale when a new snapshot is taken', async () => {
    document.body.innerHTML = '<button>Go</button>'
    const driver = makeDriver()
    const old = refOf(await snap(driver), 'button', 'Go')
    await snap(driver)
    expect(await codeOf(driver.handle({ op: 'click', ref: old }))).toBe('stale-ref')
  })

  it('go stale when the element was replaced or now says something else, never acting on another element', async () => {
    document.body.innerHTML = '<div id="host"><button>Save</button></div><button>Delete everything</button>'
    const driver = makeDriver()
    const clicked: string[] = []
    document.body.addEventListener('click', (event) => { clicked.push((event.target as Element).textContent ?? '') })
    const ref = refOf(await snap(driver), 'button', 'Save')
    // Same position, different control (a re-render).
    document.getElementById('host')!.innerHTML = '<button>Remove</button>'
    expect(await codeOf(driver.handle({ op: 'click', ref }))).toBe('stale-ref')
    // The very same node changing meaning.
    const again = refOf(await snap(driver), 'button', 'Remove')
    document.querySelector('#host button')!.textContent = 'Delete'
    expect(await codeOf(driver.handle({ op: 'click', ref: again }))).toBe('stale-ref')
    // A removed node.
    const third = refOf(await snap(driver), 'button', 'Delete everything')
    document.querySelectorAll('button')[1]!.remove()
    expect(await codeOf(driver.handle({ op: 'click', ref: third }))).toBe('stale-ref')
    expect(clicked).toEqual([])
  })

  it('reject a ref that was never issued', async () => {
    document.body.innerHTML = '<button>Go</button>'
    const driver = makeDriver()
    const s = await snap(driver)
    expect(await codeOf(driver.handle({ op: 'click', ref: `${String(s.generation)}.99` }))).toBe('unknown-ref')
  })
})

describe('actions', () => {
  it('click presses a control the way a user does, and reports which one', async () => {
    document.body.innerHTML = '<button>Add project</button>'
    const events: string[] = []
    const button = document.querySelector('button')!
    for (const type of ['mousedown', 'mouseup', 'click']) button.addEventListener(type, () => { events.push(type) })
    const driver = makeDriver()
    const result = (await driver.handle({ op: 'click', ref: refOf(await snap(driver), 'button', 'Add project') })) as UiActionResult
    expect(events).toEqual(['mousedown', 'mouseup', 'click'])
    expect(result.target).toEqual({ role: 'button', name: 'Add project' })
  })

  it('refuses a disabled or hidden control instead of pretending', async () => {
    document.body.innerHTML = '<button disabled>Save</button><button>Open</button>'
    const driver = makeDriver()
    const s = await snap(driver)
    expect(await codeOf(driver.handle({ op: 'click', ref: refOf(s, 'button', 'Save') }))).toBe('not-actionable')
    const open = refOf(s, 'button', 'Open')
    document.querySelectorAll('button')[1]!.setAttribute('hidden', '')
    expect(await codeOf(driver.handle({ op: 'click', ref: open }))).toBe('not-actionable')
  })

  it('types into a text field with the events a framework listens for, replacing or appending', async () => {
    document.body.innerHTML = '<input type="text" aria-label="Name" value="old">'
    const input = document.querySelector('input')!
    const seen: string[] = []
    input.addEventListener('input', () => { seen.push(input.value) })
    const driver = makeDriver()
    const ref = refOf(await snap(driver), 'textbox', 'Name')
    await driver.handle({ op: 'type', ref, text: 'new' })
    expect(input.value).toBe('new')
    await driver.handle({ op: 'type', ref, text: '!', clear: false })
    expect(input.value).toBe('new!')
    expect(seen).toEqual(['new', 'new!'])
  })

  it('refuses to type into a read-only field, a button, or a field that turned into a password', async () => {
    document.body.innerHTML = '<input type="text" aria-label="Locked" readonly><button>Go</button><input type="text" aria-label="Late">'
    const driver = makeDriver()
    const s = await snap(driver)
    expect(await codeOf(driver.handle({ op: 'type', ref: refOf(s, 'textbox', 'Locked'), text: 'x' }))).toBe('not-actionable')
    expect(await codeOf(driver.handle({ op: 'type', ref: refOf(s, 'button', 'Go'), text: 'x' }))).toBe('not-actionable')
    const late = refOf(s, 'textbox', 'Late')
    ;(document.querySelectorAll('input')[1] as HTMLInputElement).type = 'password'
    expect(await codeOf(driver.handle({ op: 'type', ref: late, text: 'hunter2' }))).toBe('sensitive')
    expect((document.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('')
  })

  it('submits when asked, by pressing Enter in the field', async () => {
    document.body.innerHTML = '<form><input type="text" aria-label="Search"></form>'
    const form = document.querySelector('form')!
    form.requestSubmit = vi.fn()
    const driver = makeDriver()
    await driver.handle({ op: 'type', ref: refOf(await snap(driver), 'textbox', 'Search'), text: 'q', submit: true })
    expect(form.requestSubmit).toHaveBeenCalledOnce()
  })

  it('selects an option by its text or value, and says when there is none', async () => {
    document.body.innerHTML = '<select aria-label="Model"><option value="f">fast</option><option value="p">pro</option><option value="x" disabled>off</option></select>'
    const select = document.querySelector('select')!
    const changed = vi.fn()
    select.addEventListener('change', changed)
    const driver = makeDriver()
    const ref = refOf(await snap(driver), 'combobox', 'Model')
    await driver.handle({ op: 'select', ref, option: 'PRO' })
    expect(select.value).toBe('p')
    expect(changed).toHaveBeenCalledOnce()
    expect(await codeOf(driver.handle({ op: 'select', ref, option: 'huge' }))).toBe('not-found')
    expect(await codeOf(driver.handle({ op: 'select', ref, option: 'off' }))).toBe('not-actionable')
  })

  it('presses keys: Enter activates the focused button', async () => {
    document.body.innerHTML = '<button>Run</button>'
    const clicked = vi.fn()
    document.querySelector('button')!.addEventListener('click', clicked)
    const driver = makeDriver()
    await driver.handle({ op: 'press', key: 'Enter', ref: refOf(await snap(driver), 'button', 'Run') })
    expect(clicked).toHaveBeenCalledOnce()
    const keys: string[] = []
    document.addEventListener('keydown', (event) => { keys.push(event.key) })
    await driver.handle({ op: 'press', key: 'Escape' })
    expect(keys).toEqual(['Escape'])
  })

  it('does not press keys into the focused password field', async () => {
    document.body.innerHTML = '<input type="password" id="p">'
    document.getElementById('p')!.focus()
    expect(await codeOf(makeDriver().handle({ op: 'press', key: 'a' }))).toBe('sensitive')
  })

  it('scrolls the page or an element', async () => {
    document.body.innerHTML = '<div role="region" aria-label="List" id="l"><button>x</button></div>'
    const list = document.getElementById('l')!
    list.scrollBy = vi.fn()
    const driver = makeDriver()
    await driver.handle({ op: 'scroll', direction: 'down', amount: 120, ref: refOf(await snap(driver), 'region', 'List') })
    expect(list.scrollBy).toHaveBeenCalledWith({ left: 0, top: 120 })
  })

  it('waits for something to appear or to go away, and says when it did not', async () => {
    document.body.innerHTML = '<p id="p">Loading</p>'
    const driver = makeDriver()
    let polls = 0
    const patient = new UiDriver({
      document: () => document,
      sleep: async () => { polls += 1; if (polls === 3) document.body.innerHTML = '<p>Ready now</p>' },
    })
    expect(await patient.handle({ op: 'wait', text: 'ready now' })).toMatchObject({ ok: true })
    expect(await codeOf(driver.handle({ op: 'wait', text: 'never', timeoutMs: 100 }))).toBe('not-found')
    document.body.innerHTML = '<p>Loading</p>'
    expect(await codeOf(driver.handle({ op: 'wait', text: 'Loading', gone: true, timeoutMs: 100 }))).toBe('not-found')
    document.body.innerHTML = ''
    expect(await driver.handle({ op: 'wait', text: 'Loading', gone: true, timeoutMs: 100 })).toMatchObject({ ok: true })
  })
})

describe('protected controls', () => {
  it('are listed as protected and never operated', async () => {
    document.body.innerHTML = `
      <section aria-label="Approval policy"><button>Always allow</button></section>
      <div data-acryl-no-agent><button>Locked by marker</button></div>
      <div aria-label="Agent Control"><button>Turn off</button></div>
      <button>Normal</button>`
    const driver = makeDriver()
    const s = await snap(driver)
    for (const name of ['Always allow', 'Locked by marker', 'Turn off']) {
      const node = s.nodes.find(n => n.name === name)!
      expect(node.states).toContain('protected')
      expect(await codeOf(driver.handle({ op: 'click', ref: node.ref }))).toBe('protected')
    }
    expect(s.nodes.find(n => n.name === 'Normal')!.states).not.toContain('protected')
  })
})

describe('kill switch, disposal and the user’s priority', () => {
  it('kill settles a pending wait, refuses new calls, and resume allows them again', async () => {
    document.body.innerHTML = '<button>Go</button>'
    const driver = new UiDriver({ document: () => document })
    const pending = driver.handle({ op: 'wait', text: 'never', timeoutMs: 5000 })
    driver.kill()
    expect(await codeOf(pending)).toBe('killed')
    expect(driver.activity.killed).toBe(true)
    expect(await codeOf(driver.handle({ op: 'snapshot' }))).toBe('killed')
    driver.resume()
    expect(await codeOf(driver.handle({ op: 'snapshot' }))).toBe('ok')
  })

  it('kill makes every earlier ref stale', async () => {
    document.body.innerHTML = '<button>Go</button>'
    const driver = makeDriver()
    const ref = refOf(await snap(driver), 'button', 'Go')
    driver.kill()
    driver.resume()
    expect(await codeOf(driver.handle({ op: 'click', ref }))).toBe('stale-ref')
  })

  it('dispose settles pending calls as unloaded and refuses later ones', async () => {
    const driver = new UiDriver({ document: () => document })
    const pending = driver.handle({ op: 'wait', text: 'never', timeoutMs: 5000 })
    driver.dispose()
    expect(await codeOf(pending)).toBe('unloaded')
    expect(await codeOf(driver.handle({ op: 'snapshot' }))).toBe('unloaded')
  })

  it('a cancelled call settles as aborted', async () => {
    const driver = new UiDriver({ document: () => document })
    const controller = new AbortController()
    const pending = driver.handle({ op: 'wait', text: 'never', timeoutMs: 5000 }, controller.signal)
    controller.abort()
    expect(await codeOf(pending)).toBe('aborted')
  })

  it('makes an action wait while the user is busy on the page, but never a snapshot', async () => {
    document.body.innerHTML = '<button>Go</button>'
    let idle = 0
    const sleeps: number[] = []
    const driver = new UiDriver({
      document: () => document,
      msSinceUserInput: () => idle,
      sleep: async (ms) => { sleeps.push(ms); idle += ms },
    })
    const ref = refOf(await snap(driver), 'button', 'Go')
    expect(sleeps).toEqual([])
    await driver.handle({ op: 'click', ref })
    expect(sleeps.length).toBeGreaterThan(0)
    expect(idle).toBeGreaterThanOrEqual(400)
  })

  it('reports activity while a call runs', async () => {
    document.body.innerHTML = '<button>Go</button>'
    const driver = makeDriver()
    const seen: string[] = []
    driver.subscribe(a => { seen.push(`${a.busy ? 'busy' : 'idle'}:${a.doing}`) })
    await snap(driver)
    expect(seen).toEqual(['busy:snapshot', 'idle:'])
  })
})
