// @vitest-environment jsdom

/** Settings > Plugins > Share: the person can name the GitHub account or organization the plugin goes to; it travels in the plan and the share. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SharePlan } from '../src/contract.ts'
import { ShareChooser } from '../src/client/ShareChooser.tsx'

afterEach(() => { cleanup() })

const PLAN: SharePlan = { owner: 'acrylworkshop', repo: 'hello', version: '0.1.0', visibility: 'public', createsRepository: true }

function chooser() {
  const plan = vi.fn(async (_target?: string, _owner?: string) => PLAN)
  const publish = vi.fn(async (_confirmed: SharePlan, _owner?: string) => ({ url: 'https://github.com/acrylworkshop/hello', version: '0.1.0' }))
  render(
    <ShareChooser
      plugin={{ name: 'hello', share: { plan, publish } } as never}
      readGithub={async () => ({ status: 'ready', account: 'ana' })}
      copy={async () => true}
      onSaved={() => {}}
      onShared={() => {}}
      onClose={() => {}}
    />,
  )
  return { plan, publish }
}

describe('the owner field of a plugin share', () => {
  it('is blank by default, and the plan and the share then carry no owner', async () => {
    const { plan, publish } = chooser()
    const field = await screen.findByLabelText('GitHub account or organization')
    expect((field as HTMLInputElement).placeholder).toBe('GitHub account or organization (blank: yours)')
    await waitFor(() => { expect((screen.getByText('Share publicly') as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByText('Share publicly'))
    await waitFor(() => { expect(plan).toHaveBeenCalledWith('public', undefined) })
    fireEvent.click(await screen.findByText(/^Share /u, { selector: 'button.acrylBlendsShareConfirm' }))
    await waitFor(() => { expect(publish).toHaveBeenCalledWith(PLAN, undefined) })
  })

  it('carries the typed name, trimmed, in the plan and again in the share', async () => {
    const { plan, publish } = chooser()
    fireEvent.change(await screen.findByLabelText('GitHub account or organization'), { target: { value: '  acrylworkshop ' } })
    await waitFor(() => { expect((screen.getByText('Share publicly') as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByText('Share publicly'))
    await waitFor(() => { expect(plan).toHaveBeenCalledWith('public', 'acrylworkshop') })
    fireEvent.click(await screen.findByText(/^Share /u, { selector: 'button.acrylBlendsShareConfirm' }))
    await waitFor(() => { expect(publish).toHaveBeenCalledWith(PLAN, 'acrylworkshop') })
  })
})

describe('the GitHub note of the chooser', () => {
  const open = (github: Parameters<typeof ShareChooser>[0]['readGithub'], disconnect = vi.fn(async () => ({ status: 'signed-out' as const, say: 'GitHub is not connected.', command: 'gh auth login' }))) => {
    render(
      <ShareChooser
        plugin={{ name: 'hello', share: { plan: async () => PLAN, publish: async () => ({ url: 'u', version: '0.1.0' }) } } as never}
        readGithub={github}
        connectGithub={{ start: async () => ({ status: 'idle' }), state: async () => ({ status: 'idle' }), disconnect }}
        copy={async () => true}
        onSaved={() => {}}
        onShared={() => {}}
        onClose={() => {}}
      />,
    )
    return disconnect
  }

  it('says who is connected, and offers Disconnect only for the connection ACRYL made (shared with Control Center)', async () => {
    const disconnect = open(async () => ({ status: 'ready', account: 'ana', via: 'acryl' }))
    expect(await screen.findByText(/Connected as @ana/u)).toBeTruthy()
    fireEvent.click(screen.getByText('Disconnect'))
    await waitFor(() => { expect(disconnect).toHaveBeenCalledTimes(1) })
    cleanup()
    open(async () => ({ status: 'ready', account: 'bob' }))
    expect(await screen.findByText(/Connected as @bob/u)).toBeTruthy()
    expect(screen.queryByText('Disconnect')).toBeNull()
  })

  it('offers one way in when signed out: Connect GitHub, not a second terminal login', async () => {
    open(async () => ({ status: 'signed-out', say: 'GitHub is not connected.', command: 'gh auth login' }))
    expect(await screen.findByText('Connect GitHub')).toBeTruthy()
    expect(screen.queryByText(/Terminal/u)).toBeNull()
  })
})
