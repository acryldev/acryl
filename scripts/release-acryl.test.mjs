import { test } from 'node:test'
import assert from 'node:assert/strict'
import { versionsAgree } from './release-acryl.mjs'

test('npm latest and the GitHub Latest release agree only on the same version', () => {
  assert.equal(versionsAgree('0.3.5', 'acryl-v0.3.5'), true)
  assert.equal(versionsAgree('0.3.5', 'acryl-v0.3.1'), false)
  assert.equal(versionsAgree(undefined, 'acryl-v0.3.5'), false)
  assert.equal(versionsAgree('0.3.5', 'v0.3.5'), false)
})
