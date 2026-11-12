import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MINIMUM, supportedNode, unsupportedMessage } from '../node-version.js'

test('acryl runs on Node 22.19 and later only', () => {
  for (const ok of ['22.19.0', '22.19.1', '22.20.0', '23.0.0', '24.0.0', '26.1.2']) assert.equal(supportedNode(ok), true, ok)
  for (const old of ['18.19.1', '20.18.0', '22.0.0', '22.18.9', '12.22.12']) assert.equal(supportedNode(old), false, old)
})

test('the published engines field is this same minimum', () => {
  const publish = readFileSync(new URL('../../../scripts/publish-npm-cli.mjs', import.meta.url), 'utf8')
  assert.match(publish, /import \{ MINIMUM as MINIMUM_NODE \} from '\.\.\/distribution\/acryl-npm-launcher\/node-version\.js'/)
  assert.match(publish, /engines: \{ node: `>=\$\{MINIMUM_NODE\}` \}/)
})

test('an older Node is told what is wrong and what to do', () => {
  const message = unsupportedMessage('18.19.1')
  assert.match(message, /needs Node\.js 22\.19\.0 or later; this is Node\.js 18\.19\.1/)
  assert.match(message, /https:\/\/nodejs\.org/)
})

test('the entry and the version check keep to syntax an old Node parses', () => {
  for (const file of ['../bin.js', '../node-version.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    // No regex flag v, no optional chaining or nullish operators, no static import of anything but the version check.
    assert.doesNotMatch(source, /\?\.|\?\?|\/[a-z]*v[a-z]*\.test\(/, file)
    const imports = [...source.matchAll(/^import .* from '(.+)'$/gm)].map(m => m[1])
    assert.ok(imports.every(name => name === './node-version.js'), `${file} imports ${imports.join(', ')}`)
  }
})
