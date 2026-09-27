import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureLocalAdvancedMode, resolveLocalDesktopRoots } from './dev-local.mjs'

test('isolates macOS user data from the installed ACRYL app', () => {
  const roots = resolveLocalDesktopRoots('darwin', '/Users/example', {})
  assert.equal(roots.dshHome, join('/Users/example', '.acryl-dev', '.dsh'))
  assert.equal(
    roots.userData,
    join('/Users/example', 'Library', 'Application Support', 'ACRYL Development'),
  )
})

test('isolates Windows user data under APPDATA', () => {
  const roots = resolveLocalDesktopRoots('win32', 'C:\\Users\\example', {
    APPDATA: 'C:\\Users\\example\\AppData\\Roaming',
  })
  assert.equal(roots.dshHome, join('C:\\Users\\example', '.acryl-dev', '.dsh'))
  assert.equal(roots.userData, join('C:\\Users\\example\\AppData\\Roaming', 'ACRYL Development'))
})

test('seeds advanced mode so Development Canvas can mount', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-acryl-mode-'))
  assert.equal(ensureLocalAdvancedMode(home), 'created')
  assert.match(readFileSync(join(home, 'settings.yaml'), 'utf8'), /mode: advanced/u)
  writeFileSync(join(home, 'settings.yaml'), 'dsh-desktop:\n  mode: compatibility\n')
  assert.equal(ensureLocalAdvancedMode(home), 'switched')
  assert.match(readFileSync(join(home, 'settings.yaml'), 'utf8'), /mode: advanced/u)
})

test('another product can have its own home and user-data folder, and only a plain folder name is accepted', () => {
  const roots = resolveLocalDesktopRoots('darwin', '/Users/example', { ACRYL_LOCAL_HOME_DIR: '.acryl-blank', ACRYL_LOCAL_PRODUCT_NAME: 'ACRYL Blank' })
  assert.equal(roots.dshHome, join('/Users/example', '.acryl-blank', '.dsh'))
  assert.equal(roots.userData, join('/Users/example', 'Library', 'Application Support', 'ACRYL Blank'))
  assert.throws(() => resolveLocalDesktopRoots('darwin', '/Users/example', { ACRYL_LOCAL_HOME_DIR: '../evil' }), /plain folder name/)
  assert.throws(() => resolveLocalDesktopRoots('darwin', '/Users/example', { ACRYL_LOCAL_PRODUCT_NAME: 'a/b' }), /plain folder name/)
})
