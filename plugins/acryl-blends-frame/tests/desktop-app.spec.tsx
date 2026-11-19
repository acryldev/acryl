// @vitest-environment jsdom

/** A desktop product's App pages: the first start's "Name your app", and Settings > App over the shell's bridge (`window.acrylBlendsApp`). */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppSection } from '../src/client/AppSection.tsx'
import { DesktopApp, desktopApp, formatSize, type DesktopAppState } from '../src/client/desktop-app.ts'
import { NameYourApp } from '../src/client/NameYourApp.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The shell's side, scripted: the state it holds, and every call the page made. */
function shell(initial: Partial<DesktopAppState> = {}) {
  let state: DesktopAppState = { id: 'blank-3f2a', name: 'Blank', named: false, others: [], fileManager: 'Finder', git: true, ...initial }
  const calls: [string, unknown][] = []
  const answers: Record<string, unknown> = { size: { bytes: 3_460_000, files: 709 }, export: { file: '/Users/z/Documents/Blank.acrylblend' } }
  const call = vi.fn(async (op: string, arg?: unknown) => {
    calls.push([op, arg])
    if (op === 'state') return { ok: true as const, value: state }
    if (op === 'rename') {
      if (typeof arg !== 'string' || arg.trim() === '') return { ok: false as const, message: 'an app name is one line of 1 to 80 characters' }
      state = { ...state, name: arg.trim(), named: true }
      return { ok: true as const, value: state }
    }
    if (op in answers) return { ok: true as const, value: answers[op] }
    return { ok: true as const }
  })
  return { app: new DesktopApp({ call }), calls, answers }
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

describe('the bridge', () => {
  it('is there only in a product window', () => {
    expect(desktopApp({})).toBeUndefined()
    expect(desktopApp({ acrylBlendsApp: { call: () => Promise.resolve({ ok: true }) } })).toBeInstanceOf(DesktopApp)
  })

  it('turns a refused request into the message the shell gave', async () => {
    const app = new DesktopApp({ call: async () => ({ ok: false, message: 'git bundle failed: disk full' }) })
    await expect(app.export(false)).rejects.toThrow('git bundle failed: disk full')
  })

  it('reads sizes as a person does', () => {
    expect(formatSize(900)).toBe('900 B')
    expect(formatSize(3_460_000)).toBe('3.3 MB')
    expect(formatSize(422 * 1024 * 1024)).toBe('422 MB')
  })
})

describe('Name your app', () => {
  it('offers the product’s name selected, so Enter keeps it, and never shows again once named', async () => {
    const { app, calls } = shell()
    render(<NameYourApp app={app} />)
    await settle()
    const input = screen.getByRole('textbox', { name: 'App name' }) as HTMLInputElement
    expect(screen.getByRole('dialog', { name: 'Name your app' })).toBeTruthy()
    expect(input.value).toBe('Blank')
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await settle()
    expect(calls).toContainEqual(['rename', 'Blank'])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the focus while it asks, so the chat composer starting up never takes the Enter', async () => {
    const { app } = shell()
    render(<><textarea aria-label="composer" /><NameYourApp app={app} /></>)
    await settle()
    const input = screen.getByRole('textbox', { name: 'App name' })
    screen.getByRole('textbox', { name: 'composer' }).focus()
    expect(document.activeElement).toBe(input)
  })

  it('takes the person’s own name, and is not shown for an app already named', async () => {
    const { app, calls } = shell()
    render(<NameYourApp app={app} />)
    await settle()
    const input = screen.getByRole('textbox', { name: 'App name' })
    fireEvent.change(input, { target: { value: 'Zoë’s shop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await settle()
    expect(calls).toContainEqual(['rename', 'Zoë’s shop'])
    cleanup()
    const named = shell({ named: true, name: 'Shop' })
    render(<NameYourApp app={named.app} />)
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Settings > App', () => {
  it('shows the name, the size, and the file manager by its own name', async () => {
    const { app } = shell({ named: true, name: 'Shop', fileManager: 'Explorer' })
    render(<AppSection app={app} />)
    await settle()
    expect((screen.getByRole('textbox', { name: 'App name' }) as HTMLInputElement).value).toBe('Shop')
    expect(screen.getByText(/3\.3 MB in 709 files/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show in Explorer' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('exports with or without the data, and says where the file went', async () => {
    const { app, calls } = shell({ named: true })
    render(<AppSection app={app} />)
    await settle()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
    await settle()
    expect(calls).toContainEqual(['export', { data: true }])
    expect(screen.getByRole('status').textContent).toBe('Exported to /Users/z/Documents/Blank.acrylblend')
  })

  it('starts over only after the confirmation inside the page, where Cancel is the default', async () => {
    const { app, calls } = shell({ named: true })
    render(<AppSection app={app} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Start over…' }))
    const group = screen.getByRole('group', { name: 'Start over' })
    expect(document.activeElement?.textContent).toBe('Cancel')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Start over' })).toBeNull()
    expect(calls.some(([op]) => op === 'startOver')).toBe(false)
    expect(group).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Start over…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    await settle()
    expect(calls.filter(([op]) => op === 'startOver')).toHaveLength(1)
  })

  it('lists the other apps to open one, and offers git’s licence and source', async () => {
    const { app, calls } = shell({ named: true, others: [{ id: 'notes-1a2b', name: 'Notes', created: '2026-11-04T10:00:00.000Z' }] })
    render(<AppSection app={app} />)
    await settle()
    expect(screen.getByText('Notes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Licence' }))
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    await settle()
    expect(calls).toContainEqual(['open', 'notes-1a2b'])
    expect(calls.map(([op]) => op)).toEqual(expect.arrayContaining(['gitLicence', 'gitSource']))
  })

  it('never sends an empty name', async () => {
    const { app } = shell({ named: true })
    render(<AppSection app={app} />)
    await settle()
    fireEvent.change(screen.getByRole('textbox', { name: 'App name' }), { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
