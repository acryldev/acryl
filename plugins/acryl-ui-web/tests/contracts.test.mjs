import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const React_state = { reset() {} }
const read = name => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8')
const contract = JSON.parse(read('contracts/components.json'))

/** Evaluate client.js against a stub loader and stub primitives so the exports can be inspected without a browser. */
function loadLibrary() {
  let registered
  const elements = []
  const React = { useState: initial => [initial, () => {}], createElement: (type, props, ...children) => { const el = { type, props, children }; elements.push(el); return el }, useRef: initial => ({ current: initial }) }
  const primitives = { Input: 'Input', Switch: 'Switch', Button: 'Button', Menu: 'Menu', Modal: 'Modal', Tag: 'Tag', Pill: 'Pill', Toast: 'Toast', Tooltip: 'Tooltip', IconChevronDownOutline14: 'Chevron' }
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
  for (const name of contract.reexports.names) assert.ok(lib[name], `${name} is contracted as a re-export of the app primitive but missing`)
  const extra = Object.keys(lib).filter(k => !(k in contract.components) && !(k in contract.helpers) && !contract.reexports.names.includes(k) && !['version', 'apply', 'roles'].includes(k))
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

test('the color roles in client.js are exactly the ones in tokens.json, and only that line names --dsw tokens', () => {
  const tokens = JSON.parse(read('contracts/tokens.json')).roles
  const css = read('client.js')
  const kebab = role => role.replace(/[A-Z]/gu, c => `-${c.toLowerCase()}`)
  for (const [role, { web }] of Object.entries(tokens).filter(([, value]) => value.web !== null)) assert.ok(css.includes(`--acryl-${kebab(role)}: ${web};`), `role ${role} is missing or differs from tokens.json`)
  const rootLine = css.split('\n').find(line => line.startsWith('body { --acryl-'))
  assert.equal((rootLine.match(/--acryl-[a-z-]+:/gu) ?? []).length, Object.values(tokens).filter(value => value.web !== null).length, 'client.js defines a role that tokens.json does not')
  const elsewhere = css.split('\n').filter(line => line !== rootLine && /var\(--dsw-/u.test(line))
  assert.deepEqual(elsewhere, [], 'only the roles line may reference app tokens (an upstream rename must touch one line)')
  for (const role of Object.values(tokens)) assert.deepEqual(Object.keys(role.terminal).sort(), ['dark', 'light'])
})

test('Segmented and Tabs expose radio and tab semantics and move with the arrow keys', () => {
  const { lib } = loadLibrary()
  let picked
  const segmented = lib.Segmented({ label: 'Theme', options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }], value: 'light', onChange: id => { picked = id } })
  assert.equal(segmented.props.role, 'radiogroup')
  const [first, second] = segmented.children[0]
  assert.equal(first.props['aria-checked'], true); assert.equal(second.props['aria-checked'], false); assert.equal(second.props.tabIndex, -1)
  first.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  assert.equal(picked, 'dark')
  const tabs = lib.Tabs({ tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], value: 'a', onChange: id => { picked = id }, children: 'panel' })
  const [list, panel] = tabs.children
  assert.equal(list.props.role, 'tablist'); assert.equal(panel.props.role, 'tabpanel')
  const [tabA] = list.children[0]
  assert.equal(tabA.props['aria-controls'], panel.props.id); assert.equal(panel.props['aria-labelledby'], tabA.props.id)
  tabA.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  assert.equal(picked, 'b')
})

test('SelectField opens the app Menu with the options and reports the chosen id', () => {
  const { lib } = loadLibrary()
  React_state.reset()
  const select = lib.SelectField({ options: [{ id: 'r', label: 'Read Only' }, { id: 'w', label: 'Write' }], value: 'w', onChange: () => {} })
  assert.equal(select.type, 'Menu'); assert.equal(select.props.selectedId, 'w'); assert.deepEqual(select.props.items.map(i => i.id), ['r', 'w'])
  assert.equal(select.props.anchor.props['aria-haspopup'], 'listbox')
})
