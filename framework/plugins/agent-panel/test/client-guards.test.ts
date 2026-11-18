// The panel's send guards: a submit that cannot send says why in the panel's log instead of returning silently. The frame gate saw the silent path once
// (empty log, enabled Send, no run); these are the reasons it could have been, named.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sendRefusal } from '../client/main.ts'

test('a submit with nothing typed, or while a run is going, is refused with a reason the panel shows', () => {
  assert.equal(sendRefusal('', false), 'empty')
  assert.equal(sendRefusal('   ', false), 'empty')
  assert.equal(sendRefusal('', true), 'empty')
  assert.equal(sendRefusal('add 2 3', true), 'busy')
  assert.equal(sendRefusal('add 2 3', false), undefined)
})
