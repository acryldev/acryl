import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALLOWED_WORDS, findName, NAME } from './name-gate.mjs'

const cap = NAME[0].toUpperCase() + NAME.slice(1)

test('every naming style of the name is a hit', () => {
  for (const text of [
    NAME,
    cap,
    NAME.toUpperCase(),
    `${cap}Request`,
    `${NAME}Routes`,
    `${NAME}Router`,
    `__${NAME}_cache_key`,
    `${NAME.toUpperCase()}_PORTAL_ELEMENT`,
    `${NAME}-adapter`,
    `my-${NAME}-app`,
    `@${NAME}/node-server`,
    `${cap.slice(0, 2)}${NAME.slice(2).toUpperCase()}`,
  ])
    assert.ok(findName(`x ${text} y`).length > 0, text)
})

test('the allowed English words are not hits, in any case, and each one is allowed on its own', () => {
  for (const w of ALLOWED_WORDS) {
    assert.deepEqual(findName(`a ${w} b`), [], w)
    assert.deepEqual(findName(w.toUpperCase()), [], w)
    assert.deepEqual(findName(`${w[0].toUpperCase()}${w.slice(1)}`), [], w)
  }
  assert.deepEqual(findName('honorific-prefix'), [])
  assert.deepEqual(findName('the process is honoured here'), [])
})

test('a word that only starts with an allowed word, or is built on the name, is still a hit', () => {
  assert.deepEqual(findName(`${cap}Request and honored`), [`${cap}Request`])
  assert.deepEqual(findName(`${NAME}x`), [`${NAME}x`])
  assert.deepEqual(findName(`dis${NAME}red`), [`dis${NAME}red`])
})

test('text without the name has no hits', () => {
  assert.deepEqual(findName('Acryl, AcrylRequest and acrylblends/node-server'), [])
})
