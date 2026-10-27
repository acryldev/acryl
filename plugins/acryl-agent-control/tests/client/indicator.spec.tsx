// @vitest-environment jsdom

/** The React indicator over the door's driver (the channel, the driver and the input clock are tested in `acryl-door`). */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UiDriver } from 'acrylblends/door/page'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentDrivingIndicator } from '../../src/client/Indicator.tsx'

afterEach(() => { cleanup() })
beforeEach(() => { document.body.innerHTML = '<button>Go</button>' })

describe('AgentDrivingIndicator', () => {
  it('is hidden until the agent works, then shows what it is doing with a Stop that kills it', async () => {
    const driver = new UiDriver({ document: () => document })
    render(<AgentDrivingIndicator driver={driver} />)
    expect(screen.queryByRole('status')).toBeNull()
    const pending = driver.handle({ op: 'wait', text: 'never', timeoutMs: 5000 })
    pending.catch(() => {})
    expect((await screen.findByRole('status')).textContent).toContain('Agent is driving: waiting')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect((await screen.findByRole('status')).textContent).toContain('Agent stopped')
    await expect(pending).rejects.toMatchObject({ code: 'killed' })
    fireEvent.click(screen.getByRole('button', { name: 'Allow again' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('status')).toBeNull()
    expect(driver.activity.killed).toBe(false)
  })

  it('is itself off limits to the agent and invisible to its snapshots', async () => {
    const driver = new UiDriver({ document: () => document })
    render(<AgentDrivingIndicator driver={driver} />)
    const busy = driver.handle({ op: 'wait', text: 'never', timeoutMs: 5000 })
    busy.catch(() => {})
    await screen.findByRole('status')
    const bar = document.querySelector('.acrylDrivingBar')!
    expect(bar.hasAttribute('data-acryl-agent-control')).toBe(true)
    expect(bar.hasAttribute('data-acryl-no-agent')).toBe(true)
    driver.kill()
    await busy.catch(() => {})
    const snap = new UiDriver({ document: () => document })
    const result = await snap.handle({ op: 'snapshot' })
    expect(JSON.stringify(result)).not.toContain('Allow again')
  })
})
