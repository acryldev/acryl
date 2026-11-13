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

function fake(initial: StateResponse, over: Partial<LauncherApi> = {}): LauncherApi {
  return {
    state: vi.fn(async () => initial),
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
