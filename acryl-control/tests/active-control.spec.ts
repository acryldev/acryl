import { describe, expect, it } from 'vitest'
import { ActiveControlLeaseStore } from '../src/ownership/active-control.ts'

describe('ActiveControlLeaseStore', () => {
  it('revokes mutation authority after its heartbeat expires', () => {
    let now = new Date('2026-08-26T00:00:00.000Z')
    const leases = new ActiveControlLeaseStore({
      now: () => now,
      expiresAfterMs: 1_000,
    })

    const lease = leases.acquire('controller-a')
    expect(leases.authorize(lease.id)).toBe(true)

    now = new Date('2026-08-26T00:00:01.001Z')
    expect(leases.authorize(lease.id)).toBe(false)
    expect(leases.active()).toBeUndefined()
  })

  it('accepts heartbeats only from the active lease generation', () => {
    const leases = new ActiveControlLeaseStore({ expiresAfterMs: 1_000 })
    const first = leases.acquire('controller-a')

    expect(() => leases.heartbeat({ ...first, generationId: 'forged' })).toThrow('does not match')
    expect(leases.heartbeat(first)).toEqual(expect.objectContaining({ id: first.id }))
  })
})
