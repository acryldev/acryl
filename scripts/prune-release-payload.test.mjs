import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldPruneReleasePath } from './prune-release-payload.mjs'

test('prunes source maps and dependency test fixtures from release payloads', () => {
  assert.equal(shouldPruneReleasePath('lib/bin.js.map'), true)
  assert.equal(shouldPruneReleasePath('node_modules/example/dist/index.js.map'), true)
  assert.equal(shouldPruneReleasePath('node_modules/example/tests/unit.test.js'), true)
  assert.equal(shouldPruneReleasePath('node_modules/example/src/v4/tests/parser.test.ts'), true)
})

test('retains runtime JavaScript, licenses, and runtime assets', () => {
  assert.equal(shouldPruneReleasePath('lib/bin.js'), false)
  assert.equal(shouldPruneReleasePath('node_modules/example/LICENSE'), false)
  assert.equal(shouldPruneReleasePath('node_modules/example/assets/index.html'), false)
})
