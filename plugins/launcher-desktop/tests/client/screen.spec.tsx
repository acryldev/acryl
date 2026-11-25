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
  { id: 'acrylblends.notes-desktop', name: 'Notes', version: '0.1.0', category: 'productivity', description: 'a notes app', origin: 'official' as const },
  { id: 'acrylblends.accounting', name: 'Accounting', version: '0.2.0', category: 'finance', description: 'invoices and a VAT summary', origin: 'community' as const, source: 'github:ana/accounting#v0.2.0' },
]

const CATALOG = {
  domains: [
    { id: '02', name: 'Application', subs: [{ id: '02-02', name: 'Personal information tools' }, { id: '02-06', name: 'Application shell components' }] },
    { id: '03', name: 'Business', subs: [{ id: '03-01', name: 'Business entity modules' }] },
    { id: '41', name: 'Gaming', subs: [{ id: '41-04', name: 'Multiplayer and live operations' }] },
  ],
  kinds: [{ slug: 'ui', name: 'UI Panels & Views', description: 'Panels' }, { slug: 'fun', name: 'Fun', description: 'Just for fun.' }],
  plugins: [
    { id: 'acryl-quick-notes', name: 'acryl-quick-notes', description: 'Quick notes in the top bar', kind: 'ui', domain: { id: '02-02', category: 'Application', sub: 'Personal information tools' }, compatibility: 'Both', origin: 'community' as const, publisher: 'inboxxobni', version: '0.3.0', repo: 'https://github.com/inboxxobni/acryl-quick-notes', source: 'github:inboxxobni/acryl-quick-notes@0.3.0' },
    { id: 'dsh-doudizhu', name: 'dsh-doudizhu', description: 'A card game', kind: 'fun', domain: { id: '41-04', category: 'Gaming', sub: 'Multiplayer and live operations' }, compatibility: 'DSH stock', origin: 'community' as const, publisher: 'ana', version: '1.0.0', repo: 'https://github.com/ana/dsh-doudizhu', source: 'github:ana/dsh-doudizhu@1.0.0' },
    { id: 'office-preview', name: 'office-preview', description: 'Office files as PDF', compatibility: 'ACRYL Blends', origin: 'official' as const, publisher: 'acrylblends', version: '0.1.0', repo: 'https://github.com/acrylblends/office-preview' },
  ],
}

const PLUGINS = [
  { name: 'hello', version: 'e4bc', state: 'active' },
  { name: 'pomodoro', version: '6388', state: 'active', pulledFrom: 'github:a/b@0.1.0', author: 'a' },
]
const PLAN = { owner: 'o', repo: 'demo', version: '0.1.0', visibility: 'public', license: 'MIT', createsRepository: true, files: ['index.ts'], integrity: 'sha512-x', digest: 'abc', pullLine: 'npm run acryl -- plugin pull github:o/demo@0.1.0@sha256:abc' }
const SHARE_PLAN = { repository: 'o/shop', create: true, visibility: 'private' as const, changes: 2 }

function fake(initial: StateResponse, over: Partial<LauncherApi> = {}): LauncherApi {
  return {
    state: vi.fn(async () => initial),
    blends: vi.fn(async () => BLENDS),
    pluginCatalog: vi.fn(async () => CATALOG),
    assistantFolder: vi.fn(async () => '/h/ACRYL'), plugins: vi.fn(async () => PLUGINS), pullPlugin: vi.fn(async () => ({ text: 'ok', plugins: PLUGINS })),
    github: vi.fn(async () => ({ available: false, login: null })), githubStart: vi.fn(async () => ({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', interval: 5 })),
    githubPoll: vi.fn(async () => ({ state: 'pending' as const })), githubDisconnect: vi.fn(async () => ({ available: true, login: null })),
    sharePlan: vi.fn(async () => SHARE_PLAN), share: vi.fn(async () => ({ remote: 'https://github.com/o/shop.git', created: true })),
    publishPlan: vi.fn(async () => PLAN), publish: vi.fn(async () => ({ releaseUrl: 'https://github.com/o/demo/releases/tag/v0.1.0', pullLine: PLAN.pullLine })),
    health: vi.fn(async () => ({ node: '24.19.0', npm: '11.1.0', modelKey: true, home: '/h/.acryl', keyMask: 'sk-...6789' })),
    add: vi.fn(async () => initial), remove: vi.fn(async () => initial), inApplications: vi.fn(async () => initial), create: vi.fn(async () => initial), start: vi.fn(async () => initial), stop: vi.fn(async () => initial), openAde: vi.fn(async () => initial), update: vi.fn(async () => initial), buildInstaller: vi.fn(async () => initial), updateSelf: vi.fn(async () => initial),
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
    // The card shows the plain address; the detail's Address is the full link with its token, since the bare address is refused.
    expect(screen.getByRole('link', { name: 'http://127.0.0.1:3101/?token=t' })).toBeTruthy()
    fireEvent.click(cards[1] as HTMLElement)
    expect(document.querySelector('.acrylHomePanel dd')?.textContent).toBe('acrylblends.notes')
    expect(document.body.textContent).toContain('/h/work/crm')
  })

  it('shows CLI (TUI) greyed out with "coming" in the filter and in the New app form, and the not-built buttons disabled', async () => {
    open(fake(state([app({})])))
    const filter = await screen.findByRole('button', { name: /CLI \(TUI\) \(coming\)/u })
    expect((filter as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Deploy to WebBoxes.ai' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Open folder' }) as HTMLButtonElement).disabled).toBe(true)
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
    // The reason shows beside the form's own button, not only at the top of the page.
    expect((await screen.findByRole('alert')).textContent).toBe('Not made: there is already a folder named shop in /h/ACRYL')
    expect(screen.getByLabelText('Name')).toBeTruthy()
  })

  it('takes any name and makes the folder from it, shown as it is typed', async () => {
    const create = vi.fn(async () => state([]))
    open(fake(state([]), { create }))
    fireEvent.click(await screen.findByRole('button', { name: '+ New app' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ACRYL ADE (EB)' } })
    expect(screen.getByText(/\/acryl-ade-eb$/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => { expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'acryl-ade-eb' })) })
  })

  it('adds an app to the OS Applications and takes it out again, the button saying which', async () => {
    const inApplications = vi.fn(async () => state([app({ inApplications: true })]))
    open(fake(state([app({})]), { inApplications }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Applications' }))
    await waitFor(() => { expect(inApplications).toHaveBeenCalledWith('shop', true) })
    cleanup()
    const off = vi.fn(async () => state([app({})]))
    open(fake(state([app({ inApplications: true })]), { inApplications: off }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from Applications' }))
    await waitFor(() => { expect(off).toHaveBeenCalledWith('shop', false) })
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
    fireEvent.click(await screen.findByRole('button', { name: 'Open in the browser' }))
    expect(opened).toEqual(['http://127.0.0.1:3101/?token=t'])
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => { expect(stop).toHaveBeenCalledWith('shop') })
  })

  it('says what is being made, and why it failed', async () => {
    open(fake(state([], { name: 'shop', kind: 'make', line: 'cd /h/ACRYL && acryl new shop blank', status: 'failed', step: 'Step 1 of 3', since: 0, output: '', message: 'npm error code ENOTFOUND' })))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('shop could not be made')
    expect(banner.textContent).toContain('npm error code ENOTFOUND')
  })

  it('shows the step, what comes next and the live output while making', async () => {
    open(fake(state([], { name: 'shop', kind: 'make', line: 'acryl new shop', status: 'running', step: 'Step 2 of 3: installing its dependencies. Next: starting it.', since: Date.now(), output: 'npm http fetch GET 200 https://registry.npmjs.org/hono' })))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('Step 2 of 3')
    expect(banner.textContent).toContain('Next: starting it')
    expect(banner.textContent).toContain('npm http fetch GET 200')
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
    expect(screen.getByText(/Share it to GitHub as Public .* then press Deploy to WebBoxes.ai on its card/u)).toBeTruthy()
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

  it('shares a whole app that is not running: the plan first, sent only on the person\'s yes, and a refusal is shown', async () => {
    const api = fake(state([app({})]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'GitHub account' }), { target: { value: 'o' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review what would be sent' }))
    expect(await screen.findByText('github.com/o/shop (a new repository)')).toBeTruthy()
    expect(screen.getByText('Only you and people you invite (private)')).toBeTruthy()
    expect(screen.getByText('2 changed files are saved first, then every saved version')).toBeTruthy()
    expect(api.sharePlan).toHaveBeenCalledWith({ id: 'shop', owner: 'o', visibility: 'private' })
    expect(api.share).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, share shop' }))
    await waitFor(() => { expect(api.share).toHaveBeenCalledWith({ id: 'shop', owner: 'o', plan: SHARE_PLAN }) })
    expect(await screen.findByText('git clone https://github.com/o/shop.git')).toBeTruthy()
  })

  it('makes an app from a community Blend from its GitHub source, and says its code is not reviewed', async () => {
    const api = fake(state([]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Community (1)' }))
    expect(screen.queryByText('Notes')).toBeNull()
    const card = (await screen.findByText('Accounting')).closest('.acrylHomeApp') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'Make an app' }))
    expect((await screen.findByRole('note')).textContent).toMatch(/not reviewed/u)
    expect(screen.getByText(/--from github:ana\/accounting#v0.2.0/u)).toBeTruthy()
  })

  it('deploys a shared app to WebBoxes.ai by opening its New WebBox form with the repository filled in; an app not shared yet cannot', async () => {
    const opened: string[] = []
    const shared = { ...app({}), github: 'https://github.com/ana/shop' }
    render(<LauncherScreen api={fake(state([shared]))} visibility={new LauncherVisibility(true)} openExternal={(url) => { opened.push(url) }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Deploy to WebBoxes.ai' }))
    expect(opened).toEqual(['https://webboxes.ai/dashboard/webboxes?github=https%3A%2F%2Fgithub.com%2Fana%2Fshop&name=shop'])
    cleanup()
    render(<LauncherScreen api={fake(state([app({})]))} visibility={new LauncherVisibility(true)} openExternal={() => {}} />)
    expect((await screen.findByRole('button', { name: 'Deploy to WebBoxes.ai' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('deploys a store Blend to WebBoxes.ai with ?blend=<id>; a community Blend from GitHub deploys from its repository', async () => {
    const opened: string[] = []
    render(<LauncherScreen api={fake(state([]))} visibility={new LauncherVisibility(true)} openExternal={(url) => { opened.push(url) }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    const buttons = await screen.findAllByRole('button', { name: 'Deploy to WebBoxes.ai' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0] as HTMLElement)
    fireEvent.click(buttons[1] as HTMLElement)
    expect(opened).toEqual([
      'https://webboxes.ai/dashboard/webboxes?blend=acrylblends.notes-desktop&name=notes-desktop',
      'https://webboxes.ai/dashboard/webboxes?github=https%3A%2F%2Fgithub.com%2Fana%2Faccounting&name=accounting',
    ])
  })

  it('shares publicly when the person picks Public', async () => {
    const api = fake(state([app({})]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Who can see it' }), { target: { value: 'public' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review what would be sent' }))
    await waitFor(() => { expect(api.sharePlan).toHaveBeenCalledWith({ id: 'shop', visibility: 'public' }) })
  })

  it('connects GitHub in the app: the code to type, the GitHub page opened, and who is signed in once approved', async () => {
    let polls = 0
    const api = fake(state([app({})]), {
      github: vi.fn(async () => ({ available: true, login: null })),
      githubStart: vi.fn(async () => ({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', interval: 0.01 })),
      githubPoll: vi.fn(async () => { polls += 1; return polls < 2 ? { state: 'pending' as const, interval: 0.01 } : { state: 'connected' as const, login: 'ana' } }),
    })
    const opened: string[] = []
    render(<LauncherScreen api={api} visibility={new LauncherVisibility(true)} openExternal={(url) => { opened.push(url) }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))
    expect((await screen.findByLabelText('GitHub code')).textContent).toBe('ABCD-1234')
    expect(opened).toEqual(['https://github.com/login/device'])
    expect(await screen.findByText('ana', {}, { timeout: 8000 })).toBeTruthy()
  }, 10000)

  it('says in words why an app cannot be shared', async () => {
    const api = fake(state([app({})]), { sharePlan: vi.fn(async () => { throw new Error('Not shared: you are not signed in to GitHub on this computer') }) })
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review what would be sent' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Not shared: you are not signed in to GitHub on this computer')
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

describe('the sidebar', () => {
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

describe('its own update', () => {
  it('says a newer release is out and updates itself; while it runs and after, says where it is', async () => {
    const available = { ...state([]), self: { name: 'ACRYL Control Center', version: '0.2.14', update: '0.2.15', status: 'available' as const } }
    const api = fake(available, { updateSelf: vi.fn(async () => ({ ...state([]), self: { name: 'ACRYL Control Center', version: '0.2.14', update: '0.2.15', status: 'updating' as const, since: Date.now(), output: 'npm http fetch' } })) })
    open(api)
    const banner = await screen.findByRole('status', { name: 'ACRYL Control Center update' })
    expect(banner.textContent).toMatch(/ACRYL Control Center 0\.2\.15 is out.*You have 0\.2\.14/su)
    fireEvent.click(within(banner).getByRole('button', { name: 'Update to 0.2.15' }))
    await waitFor(() => { expect(api.updateSelf).toHaveBeenCalled() })
    expect((await screen.findByText(/Updating ACRYL Control Center to 0\.2\.15/u))).toBeTruthy()
    expect(screen.getByText('npm http fetch')).toBeTruthy()
  })
})

describe('the Blends store', () => {
  it('lists the registry, searches it, and makes an app from a chosen Blend with its name filled in', async () => {
    const api = fake(state([]))
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    expect(await screen.findByText('Accounting')).toBeTruthy()
    expect(screen.getByText('Notes')).toBeTruthy()
    // Each card says who released it: the ACRYL project (official) or someone else (community, not reviewed).
    expect(screen.getByText('Official').getAttribute('title')).toBe('Released by the ACRYL project')
    expect(screen.getByText('Community').getAttribute('title')).toMatch(/not reviewed/u)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Blends' }), { target: { value: 'vat' } })
    expect(screen.queryByText('Notes')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Blends' }), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Make an app' })[0]!)
    expect((await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('notes-desktop')
    expect(screen.getByText(/acryl new notes-desktop --from acrylblends.notes-desktop/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => { expect(api.create).toHaveBeenCalledWith({ where: '/h/ACRYL', name: 'notes-desktop', surface: 'web', blend: 'acrylblends.notes-desktop' }) })
  })

  it('browses by category and subcategory, together with who released it', async () => {
    const PLACED = [
      { id: 'acryl.ade', name: 'ACRYL ADE', version: '0.2.11', category: 'AI › ADE', description: 'the agent development environment', origin: 'official' as const, place: { category: 'AI', subcategory: 'ADE', order: 5 } },
      { id: 'acrylblends.acryl-ade-eb', name: 'ACRYL ADE (Electrobun)', version: '0.1.0', category: 'AI › ADE', description: 'the ADE, smallest build', origin: 'official' as const, place: { category: 'AI', subcategory: 'ADE', order: 5 } },
      { id: 'acrylblends.sde', name: 'SDE', version: '0.1.0', category: 'AI › SDE', description: 'synthetic data', origin: 'official' as const, place: { category: 'AI', subcategory: 'SDE', order: 5 } },
      { id: 'ana.shop', name: 'Shop', version: '0.1.0', category: 'Business › Shops', description: 'a shop', origin: 'community' as const, source: 'github:ana/shop#v0.1.0', place: { category: 'Business', subcategory: 'Shops', order: 2 } },
    ]
    open(fake(state([]), { blends: vi.fn(async () => PLACED) }))
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    const categories = await screen.findByRole('group', { name: 'Categories' })
    // In the store's own order (Business before AI here), each with how many Blends it holds.
    const names = (group: HTMLElement): string[] => within(group).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? '')
    expect(names(categories)).toEqual(['All categories (4)', 'Business (1)', 'AI (3)'])
    fireEvent.click(within(categories).getByRole('button', { name: 'AI (3)' }))
    expect(screen.queryByText('Shop')).toBeNull()
    const subs = screen.getByRole('group', { name: 'Subcategories of AI' })
    fireEvent.click(within(subs).getByRole('button', { name: 'ADE (2)' }))
    expect(screen.getByText('ACRYL ADE (Electrobun)')).toBeTruthy()
    expect(screen.queryByText('SDE')).toBeNull()
    // Community only: no AI Blend is community, so the AI category leaves the list.
    fireEvent.click(screen.getByRole('button', { name: 'Community (1)' }))
    expect(names(screen.getByRole('group', { name: 'Categories' }))).toEqual(['All categories (1)', 'Business (1)'])
  })

  it('opens a Blend page with its picture, what it is and where it sits, and makes an app from there', async () => {
    const ADE = { id: 'acrylblends.acryl-ade-eb', name: 'ACRYL ADE (Electrobun)', version: '0.1.0', category: 'AI › ADE', description: 'ACRYL ADE in its smallest build: everything on Bun', origin: 'official' as const, place: { category: 'AI', subcategory: 'ADE', order: 5 }, page: 'https://acrylblends.github.io/blends/ai/ade/acrylblends.acryl-ade-eb', screenshot: 'https://acrylblends.github.io/registry/blends/acrylblends.acryl-ade-eb/docs/screenshot.png' }
    const opened: string[] = []
    const api = fake(state([]), { blends: vi.fn(async () => [ADE]) })
    open(api, new LauncherVisibility(true), url => opened.push(url))
    fireEvent.click(await screen.findByRole('button', { name: 'Blends store' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open ACRYL ADE (Electrobun)' }))
    const page = screen.getByRole('article', { name: 'ACRYL ADE (Electrobun)' })
    expect((within(page).getByRole('img') as HTMLImageElement).src).toBe(ADE.screenshot)
    expect(within(page).getByText(/everything on Bun/u)).toBeTruthy()
    expect(screen.getByText('AI › ADE', { selector: '.acrylHomeMeta' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open its store page' }))
    expect(opened).toEqual([ADE.page])
    // Back to the list, and in again.
    fireEvent.click(screen.getByRole('button', { name: '‹ All Blends' }))
    expect(screen.queryByRole('article')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open ACRYL ADE (Electrobun)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make an app' }))
    expect((await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('acryl-ade-eb')
    fireEvent.click(screen.getByRole('button', { name: 'Make it' }))
    await waitFor(() => { expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'acryl-ade-eb', blend: 'acrylblends.acryl-ade-eb' })) })
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

describe('the plugin catalog', () => {
  const running = state([app({ id: 'shop', name: 'shop', state: 'running', address: 'http://127.0.0.1:3101/' })])

  it('lists the plugins, filters by kind chip and domain, and searches', async () => {
    open(fake(running))
    fireEvent.click(await screen.findByRole('button', { name: 'Plugin catalog' }))
    expect(await screen.findByText('3 plugins')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /UI Panels & Views \(1\)/u }))
    expect(screen.getByText('1 of 3 plugins')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open acryl-quick-notes' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open dsh-doudizhu' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Unclassified \(1\)/u }))
    expect(screen.getByRole('button', { name: 'Open office-preview' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Every kind' }))
    fireEvent.click(screen.getByRole('button', { name: /^41 Gaming \(1\)/u }))
    expect(screen.getByText('1 of 3 plugins')).toBeTruthy()
    // An empty domain stays listed (dimmed) and clickable, and says so.
    const business = screen.getByRole('button', { name: /^03 Business \(0\)/u })
    expect(business.hasAttribute('data-empty')).toBe(true)
    fireEvent.click(business)
    expect(screen.getByText('0 of 3 plugins')).toBeTruthy()
    expect(screen.getByRole('button', { name: /03-01 Business entity modules \(0\)/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /All domains/u }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search plugins' }), { target: { value: 'card' } })
    expect(screen.getByRole('button', { name: 'Open dsh-doudizhu' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open acryl-quick-notes' })).toBeNull()
  })

  it('adds a plugin to a running app through the pull, and shows a refusal in words', async () => {
    const api = fake(running)
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Plugin catalog' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open acryl-quick-notes' }))
    expect(screen.getByText(/A Community plugin/u)).toBeTruthy()
    expect(screen.getByText('02 Application › 02-02 Personal information tools')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to shop' }))
    await waitFor(() => expect(api.pullPlugin).toHaveBeenCalledWith('shop', 'github:inboxxobni/acryl-quick-notes@0.3.0'))
    const added = await screen.findByText(/Added acryl-quick-notes to shop/u)
    expect(added.textContent).not.toContain('{')
    vi.mocked(api.pullPlugin).mockRejectedValueOnce(new Error('it needs a service this app does not have'))
    fireEvent.click(screen.getByRole('button', { name: 'Add to shop' }))
    expect((await screen.findByRole('alert')).textContent).toContain('it needs a service this app does not have')
  })

  it('says to start a stopped app first, warns about a DeepSeek Harness plugin, and has nothing to add without a release', async () => {
    open(fake(state([app({ id: 'shop', name: 'shop', state: 'stopped' })])))
    fireEvent.click(await screen.findByRole('button', { name: 'Plugin catalog' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open dsh-doudizhu' }))
    expect(screen.getByText(/Made for DeepSeek Harness/u)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add to shop' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Start shop first/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '‹ All plugins' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open office-preview' }))
    expect(screen.getByText(/names no release of this plugin/u)).toBeTruthy()
  })

  it('says why the registry could not be read, and tries again', async () => {
    const api = fake(running, { pluginCatalog: vi.fn().mockRejectedValueOnce(new Error('The registry could not be read.')).mockResolvedValue(CATALOG) })
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Plugin catalog' }))
    expect((await screen.findByRole('alert')).textContent).toContain('The registry could not be read.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('3 plugins')).toBeTruthy()
  })
})
