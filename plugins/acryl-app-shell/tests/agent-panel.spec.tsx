// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentPanel } from '../src/client/AgentPanel.tsx'

afterEach(() => { cleanup(); localStorage.clear() })

describe('the agent panel of a Blend app', () => {
  it('collapses to a rail and opens again, keeping the conversation mounted', () => {
    render(<AgentPanel className="app-agent" storageKey="app" renderConversation={() => <textarea aria-label="composer" />} />)
    const panel = screen.getByRole('complementary', { name: 'Agent' })
    expect(panel.hasAttribute('data-collapsed')).toBe(false)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Hide agent panel' })) })
    expect(panel.hasAttribute('data-collapsed')).toBe(true)
    expect(screen.getByLabelText('composer')).toBeTruthy()
    expect(localStorage.getItem('acryl-agent-panel:app')).toBe('collapsed')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show agent panel' })) })
    expect(panel.hasAttribute('data-collapsed')).toBe(false)
  })

  it('starts collapsed when the app was left collapsed', () => {
    localStorage.setItem('acryl-agent-panel:app', 'collapsed')
    render(<AgentPanel storageKey="app" />)
    expect(screen.getByRole('complementary', { name: 'Agent' }).hasAttribute('data-collapsed')).toBe(true)
  })
})
