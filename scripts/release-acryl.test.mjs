import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaFor, versionsAgree } from './release-acryl.mjs'

test('npm latest and the GitHub Latest release agree only on the same version', () => {
  assert.equal(versionsAgree('0.3.5', 'acryl-v0.3.5'), true)
  assert.equal(versionsAgree('0.3.5', 'acryl-v0.3.1'), false)
  assert.equal(versionsAgree(undefined, 'acryl-v0.3.5'), false)
  assert.equal(versionsAgree('0.3.5', 'v0.3.5'), false)
})

test('the Homebrew formula follows the release: url and sha256 change, nothing else', () => {
  const before = 'class Acryl < Formula\n  url "https://registry.npmjs.org/acryl/-/acryl-0.3.6.tgz"\n  sha256 "aa11"\n  license "MIT"\nend\n'
  const after = formulaFor(before, '0.3.7', 'bb22')
  assert.equal(after, 'class Acryl < Formula\n  url "https://registry.npmjs.org/acryl/-/acryl-0.3.7.tgz"\n  sha256 "bb22"\n  license "MIT"\nend\n')
  assert.throws(() => formulaFor('class Acryl < Formula\nend\n', '0.3.7', 'bb22'))
})
