// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatusLine } from '../../src/client/chrome/StatusLine.tsx'

afterEach(cleanup)

describe('StatusLine', () => {
  it('shows nothing when there is nothing to say and no action', () => {
    const { container } = render(<StatusLine segments={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows its segments and an action the user can take', () => {
    const run = vi.fn()
    render(<StatusLine segments={[{ id: 'branch', text: 'main', title: 'branch' }]} action={{ label: 'Enable notifications', title: 'why', run }} />)
    expect(screen.getByText('main')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('shows just the action when no worktree is selected yet', () => {
    render(<StatusLine segments={[]} action={{ label: 'Enable notifications', title: 'why', run: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Enable notifications' })).toBeTruthy()
  })
})
