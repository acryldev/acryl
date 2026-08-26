import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureLocalAdvancedMode, resolveLocalDesktopRoots } from './dev-local.mjs'

test('isolates macOS user data from the installed DSH Desktop app', () => {
  const roots = resolveLocalDesktopRoots('darwin', '/Users/example', {})
  assert.equal(roots.dshHome, join('/Users/example', '.dsh-acr'))
  assert.equal(
    roots.userData,
    join('/Users/example', 'Library', 'Application Support', 'DSH Desktop ACR'),
  )
})

test('isolates Windows user data under APPDATA', () => {
  const roots = resolveLocalDesktopRoots('win32', 'C:\\Users\\example', {
    APPDATA: 'C:\\Users\\example\\AppData\\Roaming',
  })
  assert.equal(roots.dshHome, join('C:\\Users\\example', '.dsh-acr'))
  assert.equal(roots.userData, join('C:\\Users\\example\\AppData\\Roaming', 'DSH Desktop ACR'))
})

test('seeds advanced mode so Development Canvas can mount', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-acr-mode-'))
  assert.equal(ensureLocalAdvancedMode(home), 'created')
  assert.match(readFileSync(join(home, 'settings.yaml'), 'utf8'), /mode: advanced/u)
  writeFileSync(join(home, 'settings.yaml'), 'dsh-desktop:\n  mode: compatibility\n')
  assert.equal(ensureLocalAdvancedMode(home), 'switched')
  assert.match(readFileSync(join(home, 'settings.yaml'), 'utf8'), /mode: advanced/u)
})
