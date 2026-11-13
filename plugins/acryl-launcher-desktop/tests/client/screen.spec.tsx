// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppView, StateResponse } from '../../src/contract.ts'
import type { LauncherApi } from '../../src/client/api.ts'
import { LauncherScreen } from '../../src/client/Screen.tsx'
import { LauncherVisibility } from '../../src/client/store.ts'
import { createLauncherApi } from '../../src/client/api.ts'
import { iconColor, tilesOf, visibleApps } from '../../src/client/model.ts'

afterEach(cleanup)

const app = (over: Partial<AppView>): AppView => ({ id: 'shop', name: 'shop', path: '/h/ACRYL/shop', blend: 'acrylblends.notes', madeBy: 'person', surface: 'web', state: 'stopped', ...over })
const STARTERS = [{ value: 'blank', label: 'Blank', description: 'the smallest app' }, { value: 'notes', label: 'Notes', description: 'a multi-user notes app' }]
const state = (apps: AppView[], job: StateResponse['job'] = null): StateResponse => ({ apps, appsFolder: '/h/ACRYL', starters: STARTERS, job })

const BLENDS = [
  { id: 'acrylblends.notes-desktop', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app' },
  { id: 'acrylblends.accounting', name: 'Accounting', version: '0.2.0', category: 'finance', description: 'invoices and a VAT summary' },
]

const PLUGINS = [
  { name: 'hello', version: 'e4bc', state: 'active' },
  { name: 'pomodoro', version: '6388', state: 'active', pulledFrom: 'github:a/b@0.1.0', author: 'a' },
]
const PLAN = { owner: 'o', repo: 'demo', version: '0.1.0', visibility: 'public', license: 'MIT', createsRepository: true, files: ['index.ts'], integrity: 'sha512-x', digest: 'abc', pullLine: 'npm run acryl -- plugin pull github:o/demo@0.1.0@sha256:abc' }

function fake(initial: StateResponse, over: Partial<LauncherApi> = {}): LauncherApi {
  return {
    state: vi.fn(async () => initial),
    blends: vi.fn(async () => BLENDS),
    assistantFolder: vi.fn(async () => '/h/ACRYL'), plugins: vi.fn(async () => PLUGINS), pullPlugin: vi.fn(async () => ({ text: 'ok', plugins: PLUGINS })),
    publishPlan: vi.fn(async () => PLAN), publish: vi.fn(async () => ({ releaseUrl: 'https://github.com/o/demo/releases/tag/v0.1.0', pullLine: PLAN.pullLine })),
    health: vi.fn(async () => ({ node: '24.19.0', npm: '11.1.0', modelKey: true, home: '/h/.acryl', keyMask: 'sk-...6789' })),
    add: vi.fn(async () => initial), remove: vi.fn(async () => initial), create: vi.fn(async () => initial), start: vi.fn(async () => initial), stop: vi.fn(async () => initial),
    ...over,
  }
}

function open(api: LauncherApi, visibility = new LauncherVisibility(true), openExternal: (url: string) => void = () => {}) {
  render(<LauncherScreen api={api} visibility={visibility} openExternal={openExternal} />)
  return visibility
}

describe('the model', () => {
  it('counts what the list says, filters by search and surface, and colors an icon the same every time', () => {
    const apps = [app({ id: 'shop', state: 'running', address: 'http://127.0.0.1:3101/' }), app({ id: 'crm', name: 'crm', blend: 'acrylblends.crm', surface: 'desktop' }), app({ id: 'x', name: 'x', surface: 'tui' })]
    expect(tilesOf(apps)).toEqual({ apps: 3, running: 1, updates: 0, cloud: 0 })
    expect(visibleApps(apps, 'CRM', 'all').map(entry => entry.id)).toEqual(['crm'])
    expect(visibleApps(apps, '', 'desktop').map(entry => entry.id)).toEqual(['crm'])
    expect(visibleApps(apps, '/h/acryl', 'web').map(entry => entry.id)).toEqual(['shop'])
    expect(iconColor('shop')).toBe(iconColor('shop'))
  })
})

describe('the ACRYL screen', () => {
  it('shows the numbers, a card per app with its surface, and the panel of the first app with its real folder', async () => {
    open(fake(state([app({ state: 'running', address: 'http://127.0.0.1:3101/?token=t' }), app({ id: 'crm', name: 'crm', surface: 'desktop', madeBy: 'agent', path: '/h/work/crm' })])))
    expect(await screen.findByText('apps on this machine')).toBeTruthy()
    const tiles = document.querySelector('.acrylHomeTiles')!
    expect(within(tiles as HTMLElement).getAllByText(/^[0-9]$/u).map(node => node.textContent)).toEqual(['2', '1', '0', '0'])
    const cards = document.querySelectorAll('.acrylHomeApp:not([data-code])')
    expect(cards).toHaveLength(2)
    expect(within(cards[0] as HTMLElement).getByText('Web')).toBeTruthy()
    expect(within(cards[0] as HTMLElement).getByText(/running/u)).toBeTruthy()
    expect(within(cards[1] as HTMLElement).getByText('Desktop')).toBeTruthy()
    expect(within(cards[1] as HTMLElement).getByText('by agent')).toBeTruthy()
    // The address shows without its token.
    expect(document.body.textContent).toContain('http://127.0.0.1:3101/')
    expect(document.body.textContent).not.toContain('token=t')
    fireEvent.click(cards[1] as HTMLElement)
    expect(document.querySelector('.acrylHomePanel dd')?.textContent).toBe('acrylblends.notes')
    expect(document.body.textContent).toContain('/h/work/crm')
  })

  it('shows CLI (TUI) greyed out with "coming" in the filter and in the New app form, and the not-built buttons disabled', async () => {
    open(fake(state([app({})])))
    const filter = await screen.findByRole('button', { name: /CLI \(TUI\) \(coming\)/u })
    expect((filter as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Deploy to WebBoxes.ai' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '+ New app' }))
    const radio = screen.getByRole('radio', { name: /CLI \(TUI\) \(coming\)/u }) as HTMLInputElement
    expect(radio.disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /^Web/u }) as HTMLInputElement).checked).toBe(true)
  })

  it('makes an app from the form: the folder is suggested, the equivalent command is shown, and the request carries what was chosen', async () => {
    const create = vi.fn(async () => state([]))
    open(fake(state([]), { create }))
    fireEvent.click(await screen.findByRole('button', { name: '+ New app' }))
    expect((screen.getByLabelText('Where does it go') as HTMLInputElement).value).toBe('/h/ACRYL')
    expect((screen.getByRole('button', { name: 'Make it' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'notes-app' } })
    fireEvent.click(screen.getByRole('radio', { name: /Notes/u }))
    fireEvent.click(screen.getByRole('radio', { name: /^Desktop/u }))
    expect(screen.getByText('cd /h/ACRYL && acryl new notes-app notes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => { expect(create).toHaveBeenCalledWith({ where: '/h/ACRYL', name: 'notes-app', starter: 'notes', surface: 'desktop' }) })
  })

  it('shows the reason when the Host refuses, and keeps the form', async () => {
    const create = vi.fn(async () => { throw new Error('there is already a folder named shop in /h/ACRYL') })
    open(fake(state([]), { create }))
    fireEvent.click(await screen.findByRole('button', { name: '+ New app' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'shop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    expect((await screen.findByRole('alert')).textContent).toBe('there is already a folder named shop in /h/ACRYL')
    expect(screen.getByLabelText('Name')).toBeTruthy()
  })

  it('adds a folder, starts and stops an app, opens a running one at its address, and removes one from the list', async () => {
    const add = vi.fn(async () => state([app({})]))
    const start = vi.fn(async () => state([app({})]))
    const remove = vi.fn(async () => state([]))
    const opened: string[] = []
    const view = fake(state([app({})]), { add, start, remove })
    open(view, new LauncherVisibility(true), url => opened.push(url))
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    await waitFor(() => { expect(start).toHaveBeenCalledWith('shop') })
    fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }))
    await waitFor(() => { expect(remove).toHaveBeenCalledWith('shop') })
    fireEvent.click(screen.getByRole('button', { name: 'Add a folder' }))
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: '/h/work/crm' } })
    expect(screen.getByText('acryl apps add /h/work/crm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }))
    await waitFor(() => { expect(add).toHaveBeenCalledWith('/h/work/crm') })
    cleanup()
    const stop = vi.fn(async () => state([app({})]))
    open(fake(state([app({ state: 'running', address: 'http://127.0.0.1:3101/?token=t' })]), { stop }), new LauncherVisibility(true), url => opened.push(url))
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(opened).toEqual(['http://127.0.0.1:3101/?token=t'])
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => { expect(stop).toHaveBeenCalledWith('shop') })
  })

  it('says what is being made, and why it failed', async () => {
    open(fake(state([], { name: 'shop', line: 'cd /h/ACRYL && acryl new shop blank', status: 'failed', message: 'npm error code ENOTFOUND' })))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('shop could not be made')
    expect(banner.textContent).toContain('npm error code ENOTFOUND')
  })

  it('opens ACRYL ADE from its card and comes back with the ACRYL button, and reads nothing while it is closed', async () => {
    const api = fake(state([app({})]))
    const visibility = open(api)
    await screen.findByRole('dialog', { name: 'ACRYL' })
    fireEvent.click(screen.getByRole('button', { name: 'Open ACRYL ADE' }))
    expect(visibility.isOpen()).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    const reads = (api.state as ReturnType<typeof vi.fn>).mock.calls.length
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect((api.state as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads)
    fireEvent.click(screen.getByRole('button', { name: 'ACRYL' }))
    expect(await screen.findByRole('dialog', { name: 'ACRYL' })).toBeTruthy()
  })

  it('shows Health from the machine, and the views that are not built say so in a sentence', async () => {
    open(fake(state([app({})])))
    fireEvent.click(await screen.findByRole('button', { name: 'Health' }))
    expect(await screen.findByText('Node 24.19.0')).toBeTruthy()
    expect(screen.getByText(/saved once for every app \(sk-\.\.\.6789\)/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'WebBoxes.ai' }))
    expect(screen.getByText(/Deploying an app to WebBoxes.ai from its card is coming/u)).toBeTruthy()
  })
})

describe('the plugins of a running app', () => {
  const running = app({ id: 'shop', state: 'running', address: 'http://127.0.0.1:3101/' })

  it('lists them, marks the pulled one, and pulls a source the person types', async () => {
    const api = fake(state([running]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: /shop/u }))
    expect(await screen.findByText('hello')).toBeTruthy()
    expect(screen.getByText(/pulled from github:a\/b@0.1.0 · by a/u)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Plugin to pull' }), { target: { value: 'github:o/p@0.2.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pull a plugin' }))
    await waitFor(() => { expect(api.pullPlugin).toHaveBeenCalledWith('shop', 'github:o/p@0.2.0') })
    expect(await screen.findByText('Pulled github:o/p@0.2.0.')).toBeTruthy()
  })

  it('shows what would be sent and sends it only on the person\'s yes', async () => {
    const api = fake(state([running]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: /shop/u }))
    fireEvent.click(await screen.findByRole('button', { name: 'Share plugin' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'GitHub account' }), { target: { value: 'o' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review what would be sent' }))
    expect(await screen.findByText('Nothing has been sent. It is sent only when you say yes.')).toBeTruthy()
    expect(api.publishPlan).toHaveBeenCalledWith({ id: 'shop', plugin: 'hello', owner: 'o' })
    expect(api.publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, publish o/demo' }))
    await waitFor(() => { expect(api.publish).toHaveBeenCalledWith({ id: 'shop', plugin: 'hello', owner: 'o', plan: PLAN }) })
    expect(await screen.findByText(/releases\/tag\/v0.1.0/u)).toBeTruthy()
  })

  it('says why when the app cannot list its plugins, and shows no plugin tools for an app that is stopped', async () => {
    const api = fake(state([running, app({ id: 'crm', name: 'crm' })]), { plugins: vi.fn(async () => { throw new Error('the app is not running: start it from this screen, then try again') }) })
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: /shop/u }))
    expect((await screen.findByRole('alert')).textContent).toContain('the app is not running')
    cleanup()
    open(fake(state([app({ id: 'crm', name: 'crm' })])))
    fireEvent.click(await screen.findByRole('button', { name: /crm/u }))
    expect(await screen.findByText(/Start the app to pull plugins into it/u)).toBeTruthy()
  })
})

describe('the assistant', () => {
  it('asks the assistant column to open (with the apps folder) and to close, and the screen stops where the column starts', async () => {
    const asked: Array<{ open: boolean, cwd?: string }> = []
    const onAsk = (event: Event): void => { asked.push((event as CustomEvent<{ open: boolean, cwd?: string }>).detail) }
    window.addEventListener('acryl:assistant', onAsk)
    open(fake(state([])))
    fireEvent.click(await screen.findByRole('button', { name: /^Assistant/u }))
    await waitFor(() => { expect(asked).toEqual([{ open: true, cwd: '/h/ACRYL' }]) })
    const pane = document.createElement('aside')
    pane.setAttribute('data-acryl-assistant', 'open')
    pane.getBoundingClientRect = () => ({ left: window.innerWidth - 440, width: 440, right: window.innerWidth, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) })
    document.body.appendChild(pane)
    await waitFor(() => { expect((screen.getByRole('dialog', { name: 'ACRYL' }) as HTMLElement).style.right).toBe('440px') }, { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: /^Assistant/u }))
    expect(asked.at(-1)).toEqual({ open: false })
    pane.remove()
    window.removeEventListener('acryl:assistant', onAsk)
  })

  it('collapses the sidebar to a rail that stays on screen, and remembers it', async () => {
    localStorage.clear()
    open(fake(state([])))
    const root = await screen.findByRole('dialog', { name: 'ACRYL' })
    expect(root.getAttribute('data-nav')).toBe('full')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }))
    expect(root.getAttribute('data-nav')).toBe('rail')
    expect(screen.getByRole('button', { name: 'Blends store' })).toBeTruthy()
    expect(localStorage.getItem('acryl-launcher-nav-rail')).toBe('1')
    cleanup()
    open(fake(state([])))
    const again = await screen.findByRole('dialog', { name: 'ACRYL' })
    expect(again.getAttribute('data-nav')).toBe('rail')
    fireEvent.click(screen.getByRole('button', { name: 'Expand the sidebar' }))
    expect(again.getAttribute('data-nav')).toBe('full')
    localStorage.clear()
  })
})

describe('the look', () => {
  it('switches the whole screen between ACRYL ADE and acryl.dev in Settings, adds the site fonts only for that skin, and remembers the choice', async () => {
    localStorage.clear()
    open(fake(state([])))
    const root = await screen.findByRole('dialog', { name: 'ACRYL' })
    expect(root.getAttribute('data-skin')).toBe('ade')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('radio', { name: /acryl\.dev/u }))
    expect(root.getAttribute('data-skin')).toBe('site')
    expect(document.getElementById('acryl-launcher-site-fonts')?.textContent).toContain('Space Grotesk Variable')
    expect(localStorage.getItem('acryl-launcher-skin')).toBe('site')
    fireEvent.click(screen.getByRole('radio', { name: /ACRYL ADE/u }))
    expect(root.getAttribute('data-skin')).toBe('ade')
    expect(document.getElementById('acryl-launcher-site-fonts')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /acryl\.dev/u }))
    cleanup()
    open(fake(state([])))
    expect((await screen.findByRole('dialog', { name: 'ACRYL' })).getAttribute('data-skin')).toBe('site')
    localStorage.clear()
  })
})

describe('the Blends store', () => {
  it('lists the registry, searches it, and makes an app from a chosen Blend with its name filled in', async () => {
    const api = fake(state([]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    expect(await screen.findByText('Accounting')).toBeTruthy()
    expect(screen.getByText('Notes')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Blends' }), { target: { value: 'vat' } })
    expect(screen.queryByText('Notes')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Blends' }), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Make an app' })[0]!)
    expect((await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('notes-desktop')
    expect(screen.getByText(/acryl new notes-desktop --from acrylblends.notes-desktop/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => { expect(api.create).toHaveBeenCalledWith({ where: '/h/ACRYL', name: 'notes-desktop', surface: 'web', blend: 'acrylblends.notes-desktop' }) })
  })

  it('says why the registry could not be read and tries again', async () => {
    let attempts = 0
    const api = fake(state([]), { blends: vi.fn(async () => { attempts += 1; if (attempts === 1) throw new Error('The registry could not be read. Check the network and try again.'); return BLENDS }) })
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    expect((await screen.findByRole('alert')).textContent).toContain('The registry could not be read')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Accounting')).toBeTruthy()
  })
})

describe('the same-origin client', () => {
  it('reads with GET and sends JSON with POST, and returns the Host\'s reason when it refuses', async () => {
    const calls: Array<{ path: string, init?: RequestInit | undefined }> = []
    const api = createLauncherApi(async (path, init) => {
      calls.push({ path, init })
      return path.endsWith('/new') ? new Response(JSON.stringify({ error: 'no' }), { status: 409 }) : new Response(JSON.stringify(state([])), { status: 200 })
    })
    await api.state()
    await api.start('shop')
    expect(calls[0]).toMatchObject({ path: '/api/acryl-launcher/state', init: { method: 'GET' } })
    expect(calls[1]).toMatchObject({ path: '/api/acryl-launcher/start', init: { method: 'POST', body: JSON.stringify({ id: 'shop' }) } })
    await expect(api.create({ where: '/x', name: 'a', starter: 'blank', surface: 'web' })).rejects.toThrow('no')
  })
})
