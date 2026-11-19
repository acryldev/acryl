// The guard behind the panel's choose(): a terminal that finishes loading after the person picked another driver
// must not apply. The gate proves the whole switch; this pins the rule choose() consults.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPickGeneration } from '../client/driver-pick.ts'

test('a stale terminal pick never applies after a newer pick', () => {
  const picks = createPickGeneration()
  const terminal = picks.begin()
  const agent = picks.begin()
  assert.equal(picks.isCurrent(terminal), false)
  assert.equal(picks.isCurrent(agent), true)
  // A third pick invalidates the second the same way.
  const third = picks.begin()
  assert.equal(picks.isCurrent(agent), false)
  assert.equal(picks.isCurrent(third), true)
})

test('the first pick is current until another begins', () => {
  const picks = createPickGeneration()
  const first = picks.begin()
  assert.equal(picks.isCurrent(first), true)
  assert.equal(picks.isCurrent(first - 1), false)
})
