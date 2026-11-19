import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countByRule, lowered, overCeiling } from './anti-slop-ratchet.mjs'

const report = (...codes) => ({ diagnostics: codes.map(code => ({ code })) })

test('counts findings per rule', () => {
  assert.deepEqual(countByRule(report('a', 'b', 'a')), { a: 2, b: 1 })
  assert.deepEqual(countByRule({}), {})
})

test('a rule above its ceiling, or a rule with no ceiling, fails; at or below passes', () => {
  assert.deepEqual(overCeiling({ a: 3, b: 1, c: 1 }, { a: 2, b: 1 }), [
    'a: 3 findings, the ceiling is 2',
    'c: 1 findings, the ceiling is 0',
  ])
  assert.deepEqual(overCeiling({ a: 1 }, { a: 2 }), [])
})

test('lowering never raises a ceiling, and a rule at zero drops out', () => {
  assert.deepEqual(lowered({ a: 1, b: 9 }, { a: 2, b: 5, c: 4 }), { a: 1, b: 5 })
})
