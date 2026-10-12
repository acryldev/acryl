import { describe, expect, it, vi } from 'vitest'
import { startUiHealth, type UiHealthPorts } from '../src/client/ui-health.ts'

function harness() {
  let clock = 0
  const ticks: (() => void)[] = []
  const warnings: string[] = []
  const errors: unknown[][] = []
  let longTask: ((ms: number) => void) | undefined
  const fakeConsole = { error: (...args: unknown[]) => { errors.push(args) }, warn: (line: string) => { warnings.push(line) } } as unknown as Pick<Console, 'error' | 'warn'>
  const ports: UiHealthPorts = {
    now: () => clock,
    setInterval: (callback) => { ticks.push(callback); return () => { ticks.splice(ticks.indexOf(callback), 1) } },
    console: fakeConsole,
    observeLongTasks: (onTask) => { longTask = onTask; return () => { longTask = undefined } },
  }
  const health = startUiHealth(ports, { heartbeatMs: 500, stallMs: 2000, longTaskMs: 250, runawayCount: 20 })
  return {
    health, fakeConsole, warnings, errors,
    advance: (ms: number) => { clock += ms },
    beat: () => { for (const tick of ticks) tick() },
    longTask: (ms: number) => { longTask?.(ms) },
  }
}

describe('startUiHealth', () => {
  it('records a stall when the heartbeat fires much later than due, and nothing for an on-time beat', () => {
    const h = harness()
    h.advance(500); h.beat()
    expect(h.health.record.incidents).toEqual([])
    h.advance(4500); h.beat()
    expect(h.health.record.incidents).toEqual([{ kind: 'stall', at: 5000, ms: 4000 }])
    expect(h.warnings[0]).toContain('[acryl-health] {"kind":"stall"')
  })

  it('does not count a hidden page\'s throttled timers as a stall', () => {
    let visible = false
    const ticks: (() => void)[] = []
    const ports = {
      now: (() => { let t = 0; return () => (t += 5000) })(),
      setInterval: (callback: () => void) => { ticks.push(callback); return () => {} },
      console: { error: () => {}, warn: () => {} } as unknown as Pick<Console, 'error' | 'warn'>,
      isVisible: () => visible,
    }
    const health = startUiHealth(ports)
    ticks[0]?.()
    expect(health.record.incidents).toEqual([])
    visible = true
    ticks[0]?.()
    expect(health.record.incidents).toHaveLength(1)
    health.stop()
  })

  it('records long tasks over the threshold only', () => {
    const h = harness()
    h.longTask(120); h.longTask(900)
    expect(h.health.record.incidents).toEqual([{ kind: 'long-task', at: 0, ms: 900 }])
  })

  it('opens one runaway incident for a repeated error, with its first stack and the crashed slot, and counts later repeats on it', () => {
    const h = harness()
    h.fakeConsole.error("slot entry crashed in 'main.conversation':", new Error('Minified React error #185'))
    const loop = new Error('Minified React error #185')
    for (let i = 0; i < 60; i++) { h.advance(5); h.fakeConsole.error(loop) }
    const incidents = h.health.record.incidents
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ kind: 'runaway', message: 'Error: Minified React error #185', slot: 'main.conversation', count: 60 })
    expect((incidents[0] as { stack?: string }).stack).toContain('Minified React error #185')
    // One report for the incident, not one per repeat; every error still reaches the real console.
    expect(h.warnings.filter(line => line.includes('"runaway"'))).toHaveLength(1)
    expect(h.errors).toHaveLength(61)
  })

  it('catches a slow loop: an error repeated a few times a second, as a frozen page manages', () => {
    const h = harness()
    for (let i = 0; i < 30; i++) { h.advance(330); h.fakeConsole.error('[client-store] subscriber failed: Error: Minified React error #185') }
    expect(h.health.record.incidents.filter(incident => incident.kind === 'runaway')).toHaveLength(1)
  })

  it('keeps one incident through gaps in a burst, and reports the same error again after five quiet seconds', () => {
    const h = harness()
    const burst = (): void => { for (let i = 0; i < 25; i++) { h.advance(2); h.fakeConsole.error('loop') } }
    burst()
    h.advance(1500)
    h.fakeConsole.error('loop')
    h.advance(1500)
    burst()
    expect(h.health.record.incidents.filter(incident => incident.kind === 'runaway')).toHaveLength(1)
    h.advance(6000)
    h.fakeConsole.error('loop')
    burst()
    expect(h.health.record.incidents.filter(incident => incident.kind === 'runaway')).toHaveLength(2)
  })

  it('leaves occasional errors alone and restores the console when stopped', () => {
    const h = harness()
    const observed = h.fakeConsole.error
    for (let i = 0; i < 5; i++) { h.advance(300); h.fakeConsole.error('rare') }
    expect(h.health.record.incidents).toEqual([])
    h.health.stop()
    expect(h.fakeConsole.error).not.toBe(observed)
    const spy = vi.fn()
    h.fakeConsole.error = spy
    h.beat()
    expect(h.health.record.incidents).toEqual([])
  })
})
