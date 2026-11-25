// @vitest-environment jsdom
// Settings > Updates (owner 2026-11-26: Control Center must offer its own update in more than one place).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SelfView, StateResponse } from '../../src/contract.ts'
import { UpdatesSection } from '../../src/client/UpdatesSection.tsx'

afterEach(cleanup)

const state = (self: SelfView | undefined): StateResponse =>
  ({ apps: [], appsFolder: '/h/ACRYL', starters: [], job: null, ...self === undefined ? {} : { self } }) as StateResponse
const self = (status: SelfView['status'], update = '0.2.31'): SelfView => ({ name: 'ACRYL Control Center', version: '0.2.28', update, status })

it('checks the registry when shown and says the copy is on the latest release', async () => {
  const blends = vi.fn(async () => [])
  render(<UpdatesSection api={{ blends, state: async () => state(self('current', '0.2.28')), updateSelf: vi.fn() }} />)
  await screen.findByText('ACRYL Control Center 0.2.28 is the latest release.')
  expect(blends).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: /Update to/u })).toBeNull()
})

it('offers a newer release and updates the copy', async () => {
  const updateSelf = vi.fn(async () => state(self('updating')))
  let current = self('available')
  render(<UpdatesSection api={{ blends: async () => [], state: async () => state(current), updateSelf }} />)
  const button = await screen.findByRole('button', { name: 'Update to 0.2.31' })
  current = self('updating')
  fireEvent.click(button)
  await waitFor(() => { expect(updateSelf).toHaveBeenCalledOnce() })
  await screen.findByText(/Updating ACRYL Control Center to 0.2.31/u)
})

it('a copy not made from a Blend says how it updates instead', async () => {
  render(<UpdatesSection api={{ blends: async () => [], state: async () => state(undefined), updateSelf: vi.fn() }} />)
  await screen.findByText(/not made from a Blend/u)
})
