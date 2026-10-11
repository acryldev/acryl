import { describe, expect, it } from 'vitest'
import { createRepeatSuppressor } from '../../src/shell/repeat-suppressor.ts'

function harness() {
  let clock = 0
  const written: string[] = []
  const pending: (() => void)[] = []
  const suppressor = createRepeatSuppressor({
    windowMs: 5000,
    write: line => { written.push(line) },
    now: () => clock,
    schedule: callback => { pending.push(callback); return () => { pending.splice(pending.indexOf(callback), 1) } },
  })
  return { suppressor, written, advance: (ms: number) => { clock += ms }, fire: () => { for (const callback of pending.splice(0)) callback() } }
}

describe('createRepeatSuppressor', () => {
  it('writes the first line at once and folds identical repeats into one summary when the window ends', () => {
    const { suppressor, written, advance, fire } = harness()
    suppressor.log('React error #185')
    for (let i = 0; i < 400; i++) { advance(5); suppressor.log('React error #185') }
    expect(written).toEqual(['React error #185'])
    advance(3000)
    fire()
    expect(written).toEqual(['React error #185', 'React error #185 [repeated 400 more times in 5s]'])
  })

  it('writes a different line at once, after the pending summary', () => {
    const { suppressor, written } = harness()
    suppressor.log('a'); suppressor.log('a'); suppressor.log('b')
    expect(written).toEqual(['a', 'a [repeated 1 more times in 1s]', 'b'])
  })

  it('starts a new window after the old one has passed', () => {
    const { suppressor, written, advance } = harness()
    suppressor.log('a')
    advance(6000)
    suppressor.log('a')
    expect(written).toEqual(['a', 'a'])
  })

  it('flushes a pending summary on demand and writes nothing more for a single line', () => {
    const { suppressor, written } = harness()
    suppressor.log('a'); suppressor.log('a')
    suppressor.flush()
    suppressor.flush()
    expect(written).toEqual(['a', 'a [repeated 1 more times in 1s]'])
  })
})
