// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VersionsApi } from '../src/client/api.ts'
import { formatRelativeTime, VersionsSection } from '../src/client/VersionsSection.tsx'
import type { VersionsEntry, VersionsLogView } from '../src/contract.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const newest = (): VersionsEntry => ({
  hash: 'b'.repeat(40),
  short: 'bbbbbbb',
  subject: 'second version',
  author: 'Test Person',
  at: new Date().toISOString(),
})

const older: VersionsEntry = {
  hash: 'a'.repeat(40),
  short: 'aaaaaaa',
  subject: 'first version',
  author: 'Test Person',
  at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
}

function logView(): VersionsLogView {
  return {
    path: '/repo',
    branch: 'main',
    upstream: 'origin/main',
    ahead: 1,
    behind: 0,
    entries: [newest(), older],
  }
}

const plan = { upstream: 'origin/main', address: 'github.com/ana/notes', ahead: 2, head: 'a'.repeat(40) }

function api(overrides: Partial<VersionsApi> = {}): VersionsApi {
  return {
    log: vi.fn(async () => logView()),
    save: vi.fn(async (_path: string, message: string) => ({
      entry: { ...newest(), subject: message },
      commit: { hash: 'b'.repeat(40), short: 'bbbbbbb', subject: message },
    })),
    restore: vi.fn(async () => ({
      restored: older.short,
      commit: { hash: 'c'.repeat(40), short: 'ccccccc', subject: `Restore ${older.short}` },
    })),
    planShare: vi.fn(async () => plan),
    share: vi.fn(async () => ({ pushed: true as const, upstream: 'origin/main' })),
    ...overrides,
  }
}

describe('formatRelativeTime', () => {
  it('says how old a version is in plain English', () => {
    const now = Date.parse('2026-11-03T12:00:00.000Z')
    expect(formatRelativeTime('2026-11-03T11:59:30.000Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-11-03T11:45:00.000Z', now)).toBe('15 min ago')
    expect(formatRelativeTime('2026-11-03T09:00:00.000Z', now)).toBe('3 h ago')
    expect(formatRelativeTime('2026-11-01T12:00:00.000Z', now)).toBe('2 d ago')
    expect(formatRelativeTime('2026-09-01T12:00:00.000Z', now)).toBe('2026-09-01')
  })
})

describe('VersionsSection', () => {
  it('renders the branch versions with the newest marked current', async () => {
    const client = api()
    render(<VersionsSection path="/repo" api={client} />)

    expect(await screen.findByText('second version')).toBeTruthy()
    expect(screen.getByText('bbbbbbb')).toBeTruthy()
    expect(screen.getByText('aaaaaaa')).toBeTruthy()
    expect(screen.getByText('current')).toBeTruthy()
    expect(screen.getByText('origin/main, 1 ahead, 0 behind')).toBeTruthy()
    expect(screen.getByText('just now')).toBeTruthy()
    expect(client.log).toHaveBeenCalledWith('/repo')
  })

  it('shows an API error instead of throwing', async () => {
    const client = api({ log: vi.fn(async () => { throw new Error('not a git repository') }) })
    render(<VersionsSection path="/repo" api={client} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('not a git repository')
    expect(screen.queryByText('second version')).toBeNull()
  })

  it('sends the typed message with Save point and reports the commit', async () => {
    const client = api()
    render(<VersionsSection path="/repo" api={client} />)
    await screen.findByText('second version')

    fireEvent.change(screen.getByLabelText('Version message'), { target: { value: 'my save point' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save point' }))

    await waitFor(() => { expect(client.save).toHaveBeenCalledWith('/repo', 'my save point') })
    expect((await screen.findByRole('status')).textContent).toBe('Saved bbbbbbb: my save point')
    expect((screen.getByLabelText('Version message') as HTMLInputElement).value).toBe('')
  })

  it('keeps Save point disabled until a message is typed', async () => {
    const client = api()
    render(<VersionsSection path="/repo" api={client} />)
    await screen.findByText('second version')

    const button = screen.getByRole('button', { name: 'Save point' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Version message'), { target: { value: '   ' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Version message'), { target: { value: 'x' } })
    expect(button.disabled).toBe(false)
  })

  it('restores a version only after confirmation', async () => {
    const client = api()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<VersionsSection path="/repo" api={client} />)
    await screen.findByText('first version')

    fireEvent.click(screen.getByRole('button', { name: `Restore ${older.short}` }))

    await waitFor(() => { expect(client.restore).toHaveBeenCalledWith('/repo', older.hash) })
    expect(confirm).toHaveBeenCalled()
    expect((await screen.findByRole('status')).textContent).toBe(`Restored ${older.short} as ccccccc`)
  })

  it('does nothing when the confirmation is declined', async () => {
    const client = api()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<VersionsSection path="/repo" api={client} />)
    await screen.findByText('first version')

    fireEvent.click(screen.getByRole('button', { name: `Restore ${older.short}` }))
    await waitFor(() => { expect(client.restore).not.toHaveBeenCalled() })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('asks before a share, with Cancel focused, and pushes only the plan the person confirmed', async () => {
    const client = api()
    render(<VersionsSection path="/repo" api={client} />)
    await screen.findByText('second version')

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await screen.findByText('Push 2 versions to origin/main (github.com/ana/notes)?')
    expect(client.share).not.toHaveBeenCalled()
    expect(document.activeElement?.textContent).toBe('Cancel')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Push 2 versions to origin/main (github.com/ana/notes)?')).toBeNull()
    expect(client.share).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Push' }))
    await screen.findByText('Pushed to origin/main.')
    expect(client.share).toHaveBeenCalledWith('/repo', plan)
  })

  it('shows the reason a share was refused', async () => {
    const client = api({ planShare: vi.fn(async () => { throw new Error('the branch has no upstream: publish it first') }) })
    render(<VersionsSection path="/repo" api={client} />)
    await screen.findByText('second version')

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('the branch has no upstream: publish it first')
  })

  it('renders nothing for an empty path and asks the Host nothing', async () => {
    const client = api()
    const { container } = render(<VersionsSection path="" api={client} />)
    expect(container.firstChild).toBeNull()
    expect(client.log).not.toHaveBeenCalled()
  })
})
