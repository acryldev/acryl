// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupportSection } from '../../src/client/SupportSection.tsx'
import { createSupportApi, fileNameFrom, type SupportApi } from '../../src/client/support-api.ts'
import { en } from '../../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]
const props = (api: SupportApi) => ({ api, t }) as unknown as Parameters<typeof SupportSection>[0]

describe('fileNameFrom', () => {
  it('takes the Host-suggested name and refuses anything odd', () => {
    expect(fileNameFrom('attachment; filename="acryl-diagnostics-1.zip"')).toBe('acryl-diagnostics-1.zip')
    expect(fileNameFrom('attachment; filename="../../etc/passwd"')).toBe('acryl-diagnostics.zip')
    expect(fileNameFrom(null)).toBe('acryl-diagnostics.zip')
  })
})

describe('createSupportApi', () => {
  const respond = (status: number, headers: Record<string, string> = {}) => vi.fn(async () => new Response(status === 200 ? 'zipdata' : 'no', { status, headers }))
  it('returns the archive and its name', async () => {
    const download = await createSupportApi(respond(200, { 'content-disposition': 'attachment; filename="x.zip"' })).fetchDiagnostics()
    expect(download.fileName).toBe('x.zip')
    expect(await download.blob.text()).toBe('zipdata')
  })
  it('says what went wrong in words', async () => {
    await expect(createSupportApi(respond(429)).fetchDiagnostics()).rejects.toThrow('already running')
    await expect(createSupportApi(respond(500)).fetchDiagnostics()).rejects.toThrow('HTTP 500')
  })
})

describe('SupportSection', () => {
  it('exports on click, shows the working state, then a confirmation', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    let finish!: (value: { blob: Blob; fileName: string }) => void
    const api: SupportApi = { fetchDiagnostics: () => new Promise((resolve) => { finish = resolve }) }
    render(<SupportSection {...props(api)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export diagnostics' }))
    expect((screen.getByRole('button', { name: 'Preparing...' }) as HTMLButtonElement).disabled).toBe(true)
    finish({ blob: new Blob(['z']), fileName: 'x.zip' })
    expect((await screen.findByRole('status')).textContent).toContain('Downloaded')
  })

  it('shows the failure and lets the user try again', async () => {
    const api: SupportApi = { fetchDiagnostics: vi.fn(async () => { throw new Error('An export is already running. Try again in a moment.') }) }
    render(<SupportSection {...props(api)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export diagnostics' }))
    expect((await screen.findByRole('alert')).textContent).toContain('already running')
    await waitFor(() => { expect((screen.getByRole('button', { name: 'Export diagnostics' }) as HTMLButtonElement).disabled).toBe(false) })
  })
})
