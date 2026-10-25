import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { upstreamNameFromLicense, upstreamNameIn } from './upstream-name.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// The name comes from the ported router's LICENSE, as the port check reads it; this file does not spell it.
const name = upstreamNameFromLicense(join(root, 'plugins', 'acryl-router'))
const Name = `${name[0].toUpperCase()}${name.slice(1)}`
const found = text => upstreamNameIn(text, name).map(hit => hit.found)

test('the name is read from a LICENSE', () => {
  assert.match(name, /^[a-z]+$/u)
  assert.equal(upstreamNameFromLicense(join(root, 'plugins', 'acryl-node-server')), name)
})

test('the name is found in every case and inside any longer name', () => {
  for (const text of [
    `import { ${Name} } from '${name}'`,
    `const app = is${Name}App(x)`,
    `get${Name}Context()`,
    `acryl${Name}`,
    `const key = '__${name}_cache_key'`,
    `export const X_${name.toUpperCase()}_DISABLE = 1`,
    `${name.toUpperCase()}_PORTAL_ELEMENT`,
    `'x-${name}-disable-ssg'`,
    `@${name}/node-server`,
    `${name}js`,
  ]) assert.ok(found(text).length > 0, text)
})

test('the English words it starts are allowed, but not inside a longer name', () => {
  for (const text of [
    `it('${name}rs strictContentLength', () => {})`,
    `| '${name}rific-prefix'`,
    `${Name}ured guests, ${name}r and ${name}urs`,
    `an ${name}rary member, ${name}rable mention, ${name}red`,
  ]) assert.deepEqual(found(text), [], text)
  assert.deepEqual(found(`x${name}r`), [`${name}r`])
  assert.deepEqual(found(`${name}rsCount`), [`${name}rsCount`])
})

test('a hit names its line', () => {
  assert.deepEqual(upstreamNameIn(`ok\nuse ${name}\n`, name), [{ line: 2, found: name }])
})
