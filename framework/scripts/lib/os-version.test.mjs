import assert from 'node:assert/strict'
import { test } from 'node:test'
import { osVersion } from './os-version.mjs'

test("a packed app carries the higher of package.json's version and its Blend's", () => {
  assert.equal(osVersion('0.1.0', '0.1.4'), '0.1.4')
  assert.equal(osVersion('0.2.8', '0.1.0'), '0.2.8')
  assert.equal(osVersion('0.10.0', '0.9.9'), '0.10.0')
  assert.equal(osVersion('1.0.0', '1.0.0'), '1.0.0')
  assert.equal(osVersion('0.1.0', undefined), '0.1.0')
  assert.equal(osVersion(undefined, '0.3.0'), '0.3.0')
  assert.equal(osVersion('0.1.0', '0.2.0-beta.1'), '0.1.0')
})
