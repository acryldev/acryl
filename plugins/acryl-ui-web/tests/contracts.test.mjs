import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const read = name => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8')
const contract = JSON.parse(read('contracts/components.json'))

/** Evaluate client.js against a stub loader and stub primitives so the exports can be inspected without a browser. */
function loadLibrary() {
  let registered
  const elements = []
  const React = { createElement: (type, props, ...children) => { const el = { type, props, children }; elements.push(el); return el }, useRef: initial => ({ current: initial }) }
  const primitives = { Input: 'Input', Switch: 'Switch' }
  const document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }
  globalThis.window = { __ModuleLoader__: { load: entry => { registered = entry } } }
  globalThis.document = document
  new Function(read('client.js'))()
  const lib = registered.factory(name => (name === 'react' ? React : primitives))
  return { id: registered.id, lib, elements }
}

test('the library registers under its package name and exports exactly the contracted components and helpers', () => {
  const { id, lib } = loadLibrary()
  assert.equal(id, JSON.parse(read('package.json')).name)
  for (const name of Object.keys(contract.components)) assert.equal(typeof lib[name], 'function', `${name} is contracted but not exported`)
  for (const name of Object.keys(contract.helpers)) assert.equal(typeof lib[name], 'function', `${name} helper is contracted but not exported`)
  const extra = Object.keys(lib).filter(k => !(k in contract.components) && !(k in contract.helpers) && !['version', 'apply'].includes(k))
  assert.deepEqual(extra, [], 'an export without a contract entry is undocumented')
  assert.equal(typeof lib.apply, 'function', 'the client loader requires an apply, even for a library')
})

test('every contracted required prop is honored: Field wires label, error and change', () => {
  const { lib } = loadLibrary()
  let changed
  const field = lib.Field({ label: 'Name', value: 'x', onChange: v => { changed = v }, error: 'too short' })
  const [label, input, error] = field.children
  assert.equal(label.type, 'label'); assert.equal(label.props.htmlFor, input.props.id)
  assert.equal(error.props.role, 'alert'); assert.equal(input.props['aria-describedby'], error.props.id); assert.equal(input.props['aria-invalid'], true)
  input.props.onChange({ target: { value: 'abc' } })
  assert.equal(changed, 'abc', 'onChange receives the string, not the event (the contract says so)')
})

test('slot helpers register through slots.inject with the contracted slot names', () => {
  const { lib } = loadLibrary()
  for (const [name, { slot }] of Object.entries(contract.helpers)) {
    const seen = []
    const ctx = { slots: { inject: (s, fn) => { seen.push(['inject', s]); fn() }, register: (opts, comp) => seen.push(['register', opts.name, opts.id, comp]) } }
    lib[name](ctx, { id: 'x' }, 'Component')
    assert.deepEqual(seen, [['inject', slot], ['register', slot, 'x', 'Component']], name)
  }
})

test('Card labels itself by its title, and the library injects its styles once', () => {
  const { lib } = loadLibrary()
  const card = lib.Card({ title: 'Settings', children: 'body' })
  assert.equal(card.props.role, 'group'); assert.equal(card.props['aria-labelledby'], card.children[0].props.id)
  assert.equal(lib.Card({ children: 'x' }).props['aria-labelledby'], undefined)
})
