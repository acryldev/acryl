import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_IDENTITY, normalizeVolatile, shapeSections, tagName, upstreamSnapshot } from '../lib/transform.js'

const sections = [
  { name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' },
  { name: 'deployment:persona-prefix', text: 'You are a coding agent powered by {{model}}.' },
  { name: 'plan:policy', text: '' },
  { name: 'tool:read', text: 'Use the read tool - not cat.' },
  { name: 'acryl:extension-router', text: '<acryl_extension_docs>\nroute\n</acryl_extension_docs>' },
  { name: 'deployment:persona-suffix', text: 'Your working directory is {{cwd}}.' },
]

test('the ACRYL identity replaces the harness identity, first and untagged', () => {
  const out = shapeSections(sections)
  assert.equal(out[0].name, 'harness:identity')
  assert.equal(out[0].text, DEFAULT_IDENTITY)
  assert.doesNotMatch(out.map(s => s.text).join('\n'), /powered by DeepSeek Harness/)
})

test('every other section is tagged pi-style, empties are dropped, upstream text passes through unchanged', () => {
  const out = shapeSections(sections)
  assert.deepEqual(out.map(s => s.name), ['harness:identity', 'deployment:persona-prefix', 'tool:read', 'acryl:extension-router', 'deployment:persona-suffix'])
  assert.equal(out[1].text, '<persona>\nYou are a coding agent powered by {{model}}.\n</persona>')
  assert.equal(out[2].text, '<tool_read>\nUse the read tool - not cat.\n</tool_read>')
  assert.equal(out[4].text, '<cwd>\nYour working directory is {{cwd}}.\n</cwd>')
})

test('an already tagged section is not wrapped twice', () => {
  const router = shapeSections(sections).find(s => s.name === 'acryl:extension-router')
  assert.equal((router.text.match(/<acryl_extension_docs>/gu) ?? []).length, 1)
})

test('options turn tagging and dropping off and set the identity', () => {
  const out = shapeSections(sections, { identity: 'You are X.', tagSections: false, dropEmpty: false })
  assert.equal(out.length, sections.length)
  assert.equal(out[0].text, 'You are X.')
  assert.equal(out[3].text, 'Use the read tool - not cat.')
})

test('tag names are safe', () => {
  assert.equal(tagName('tool:web_fetch'), 'tool_web_fetch')
  assert.equal(tagName('ui:deliverable-file-references'), 'ui_deliverable-file-references')
  assert.equal(tagName('123:x'), 'x')
  assert.equal(tagName('deployment:persona-suffix'), 'cwd')
})

test('the drift snapshot excludes ACRYL sections and changes when upstream text changes', () => {
  const a = upstreamSnapshot(sections)
  assert.ok(!a.some(s => s.name.startsWith('acryl:')))
  const b = upstreamSnapshot(sections.map(s => s.name === 'tool:read' ? { ...s, text: 'changed' } : s))
  assert.notDeepEqual(a.find(s => s.name === 'tool:read'), b.find(s => s.name === 'tool:read'))
  assert.deepEqual(a.find(s => s.name === 'tool:read').hash.length, 12)
})

test('a run-specific local port does not count as drift', () => {
  assert.equal(normalizeVolatile('open http://127.0.0.1:51234/x and localhost:3080'), 'open http://127.0.0.1:<port>/x and localhost:<port>')
  const a = upstreamSnapshot([{ name: 'app:web-surface', text: 'GUI at http://127.0.0.1:51234' }])
  const b = upstreamSnapshot([{ name: 'app:web-surface', text: 'GUI at http://127.0.0.1:60000' }])
  assert.deepEqual(a, b)
})
