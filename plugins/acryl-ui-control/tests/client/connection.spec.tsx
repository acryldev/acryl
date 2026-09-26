// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageChannel, type ChannelSocket } from '../../src/client/connection.ts'
import { UiDriver } from '../../src/client/driver/driver.ts'
import { AgentDrivingIndicator } from '../../src/client/Indicator.tsx'
import { UserInputClock } from '../../src/client/user-input.ts'

class FakeSocket implements ChannelSocket {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 0
  sent: unknown[] = []
  closed = false
  send(data: string): void { this.sent.push(JSON.parse(data)) }
  close(): void { this.closed = true }
  open(): void { this.readyState = 1; this.onopen?.(new Event('open')) }
  receive(message: object): void { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) })) }
  drop(): void { this.readyState = 3; this.onclose?.(new CloseEvent('close')) }
}

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => { document.body.innerHTML = '<button>Go</button>' })

function setup() {
  const sockets: FakeSocket[] = []
  const driver = new UiDriver({ document: () => document })
  const channel = new PageChannel(driver, { windowId: 'w1', focused: () => true, createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s }, url: () => 'ws://x/channel' })
  return { sockets, driver, channel }
}

describe('PageChannel', () => {
  it('introduces the window, answers a call by running it on the driver, and reports refusals', async () => {
    const { sockets, channel } = setup()
    channel.connect()
    sockets[0]!.open()
    expect(sockets[0]!.sent).toEqual([{ t: 'hello', windowId: 'w1', focused: true }])
    sockets[0]!.receive({ t: 'call', id: 7, request: { op: 'snapshot' } })
    await vi.waitFor(() => { expect(sockets[0]!.sent).toHaveLength(2) })
    expect(sockets[0]!.sent[1]).toMatchObject({ t: 'result', id: 7, value: { nodes: [{ role: 'button', name: 'Go' }] } })
    sockets[0]!.receive({ t: 'call', id: 8, request: { op: 'click', ref: '99.1' } })
    await vi.waitFor(() => { expect(sockets[0]!.sent).toHaveLength(3) })
    expect(sockets[0]!.sent[2]).toMatchObject({ t: 'error', id: 8, code: 'stale-ref' })
  })

  it('ignores a malformed call and a non-text frame instead of acting on it', async () => {
    const { sockets, channel, driver } = setup()
    channel.connect()
    sockets[0]!.open()
    sockets[0]!.receive({ t: 'call', id: 1, request: { op: 'eval', code: 'document.cookie' } })
    sockets[0]!.onmessage?.(new MessageEvent('message', { data: new ArrayBuffer(4) }))
    await Promise.resolve()
    expect(sockets[0]!.sent).toHaveLength(1)
    expect(driver.activity.busy).toBe(false)
  })

  it('reports focus and reconnects with backoff after the link drops', () => {
    vi.useFakeTimers()
    const { sockets, channel } = setup()
    channel.connect()
    sockets[0]!.open()
    channel.reportFocus(false)
    expect(sockets[0]!.sent.at(-1)).toEqual({ t: 'focus', focused: false })
    sockets[0]!.drop()
    vi.advanceTimersByTime(500)
    expect(sockets).toHaveLength(2)
    sockets[1]!.drop()
    vi.advanceTimersByTime(500)
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(500)
    expect(sockets).toHaveLength(3)
  })

  it('stops for good when disposed', () => {
    vi.useFakeTimers()
    const { sockets, channel } = setup()
    channel.connect()
    sockets[0]!.open()
    channel.dispose()
    expect(sockets[0]!.closed).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(1)
  })
})

describe('UserInputClock', () => {
  it('counts the user’s own input but never a script’s synthetic event', () => {
    let now = 1000
    const clock = new UserInputClock(() => now)
    const detach = clock.attach(document)
    expect(clock.msSince()).toBe(Number.POSITIVE_INFINITY)
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(clock.msSince()).toBe(Number.POSITIVE_INFINITY)
    detach()
    now += 1
  })
})

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
    expect(bar.hasAttribute('data-acryl-ui-control')).toBe(true)
    expect(bar.hasAttribute('data-acryl-no-agent')).toBe(true)
    driver.kill()
    await busy.catch(() => {})
    const snap = new UiDriver({ document: () => document })
    const result = await snap.handle({ op: 'snapshot' })
    expect(JSON.stringify(result)).not.toContain('Allow again')
  })
})
