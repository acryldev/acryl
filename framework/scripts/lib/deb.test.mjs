import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEB_DEPENDS, debPackageName } from './deb.mjs'

test('a product is a Debian package named after the product, never just `blend`', () => {
  assert.equal(debPackageName('ACRYL Control Center'), 'acryl-control-center')
  assert.equal(debPackageName('acryl-ade'), 'acryl-ade')
  assert.equal(debPackageName('ACRYL SDE'), 'acryl-sde')
  assert.equal(debPackageName('ACRYL Blends Blank'), 'acryl-blends-blank')
  assert.equal(debPackageName('  C++ Notes & Todo!  '), 'c++-notes-todo')
  assert.equal(debPackageName('-Odd.name_'), 'odd.name')
})

test('a name Debian would refuse is an error, not a package called something else', () => {
  assert.throws(() => debPackageName(''), /no Debian package name/u)
  assert.throws(() => debPackageName('!!'), /no Debian package name/u)
  assert.throws(() => debPackageName(undefined), /no Debian package name/u)
  for (const product of ['ACRYL Control Center', 'x1', 'My App 2'])
    assert.match(debPackageName(product), /^[a-z0-9][a-z0-9+.-]+$/u)
})

test("the .deb depends on the sound library under both its names, and keeps electron-builder's own libraries", () => {
  assert.ok(DEB_DEPENDS.includes('libasound2t64 | libasound2'))
  for (const need of ['libgtk-3-0', 'libnss3', 'libsecret-1-0', 'xdg-utils'])
    assert.ok(DEB_DEPENDS.includes(need), need)
  assert.equal(new Set(DEB_DEPENDS).size, DEB_DEPENDS.length)
})
