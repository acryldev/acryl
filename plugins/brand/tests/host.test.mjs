import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../index.js'

/** A minimal Context: effects run at once, `on` records its rows, `get` serves the given services. */
function fakeContext(services) {
  const provided = {}
  const taps = []
  const rows = []
  return {
    provided,
    taps,
    rows,
    get: name => services[name],
    provide: (name, value) => { provided[name] = value },
    effect: run => run(),
    on: (event, handler) => { if (event === 'webserver/index-inject') handler(rows); return () => {} },
    _tap: transform => taps.push(transform),
  }
}

test('without a web server it still provides the identity and injects its rows', () => {
  const ctx = fakeContext({})
  apply(ctx, { name: 'Orbit' })
  assert.equal(ctx.provided.acrylBrand.identity.name, 'Orbit')
  assert.ok(ctx.rows.some(row => row.kind === 'global' && row.name === '__ACRYL_BRAND__'))
})

test('a web server that has no tapIndex (Desktop, test doubles) does not fail the row', () => {
  const ctx = fakeContext({ webServer: {} })
  assert.doesNotThrow(() => apply(ctx, { name: 'Orbit' }))
})

test('a web server with tapIndex gets the escaped product name as the page title', () => {
  const ctx = fakeContext({})
  let transform
  ctx.get = name => (name === 'webServer' ? { tapIndex: fn => { transform = fn; return () => {} } } : undefined)
  apply(ctx, { name: 'A<B' })
  assert.equal(transform('<title>x</title>'), '<title>A&#60;B</title>')
})
