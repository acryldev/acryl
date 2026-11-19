import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeHtml, faviconDataUrl, parseIdentity } from '../lib/identity.js'

test('a name alone is a valid identity and gets a mark from its first letter', () => {
  const identity = parseIdentity({ name: 'orbit' })
  assert.equal(identity.name, 'orbit')
  assert.equal(identity.mark, 'O')
})

test('accentDark defaults to accent and both must be #rrggbb', () => {
  assert.equal(parseIdentity({ name: 'X', accent: '#112233' }).accentDark, '#112233')
  assert.throws(() => parseIdentity({ name: 'X', accent: 'red' }), /#rrggbb/)
})

test('missing name, wrong types and oversized values are rejected at the boundary', () => {
  assert.throws(() => parseIdentity({}), /name/)
  assert.throws(() => parseIdentity({ name: 5 }), /string/)
  assert.throws(() => parseIdentity({ name: 'a'.repeat(41) }), /at most 40/)
  assert.throws(() => parseIdentity({ name: 'X', mark: 'abcd' }), /at most 3/)
})

test('markup in a name cannot reach the page title or the favicon', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&#60;b&#62;&#34;x&#34;&#60;/b&#62;')
  assert.ok(!decodeURIComponent(faviconDataUrl({ mark: '<S>', accent: '#000000' })).includes('<S>'))
})
