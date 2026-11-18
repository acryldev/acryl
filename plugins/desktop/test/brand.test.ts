import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  appTitle,
  brandedElectron,
  bundleOf,
  DEFAULT_ICON,
  iconFile,
  plistNames,
} from '../brand.ts'

test('the app is named by its package, else its folder', () => {
  const folder = mkdtempSync(join(tmpdir(), 'brand-'))
  assert.equal(appTitle(join(folder)), folder.split('/').pop())
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'shop' }))
  assert.equal(appTitle(folder), 'shop')
  // A packed product: the package is named after the folder it was packed from, the product by productName.
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'app', productName: 'ACRYL Control Center' }))
  assert.equal(appTitle(folder), 'ACRYL Control Center')
})

test('an app icon of its own wins over the ACRYL Blends logo', () => {
  assert.equal(
    iconFile('/app', () => false),
    DEFAULT_ICON,
  )
  assert.equal(
    iconFile('/app', (path) => path === join('/app', 'assets', 'icon.png')),
    join('/app', 'assets', 'icon.png'),
  )
})

test('the bundle gets the app name and its own identifier', () => {
  assert.deepEqual(plistNames('shop', 'shop-ed80'), {
    CFBundleName: 'shop',
    CFBundleDisplayName: 'shop',
    CFBundleIdentifier: 'com.acrylblends.app.shop-ed80',
  })
  assert.equal(bundleOf('/x/Electron.app/Contents/MacOS/Electron'), '/x/Electron.app')
  assert.equal(bundleOf('/usr/bin/electron'), undefined)
})

test('only macOS runs a branded copy; elsewhere the stock executable starts untouched', () => {
  const folder = mkdtempSync(join(tmpdir(), 'brand-'))
  mkdirSync(join(folder, 'out'))
  for (const platform of ['linux', 'win32'] as const)
    assert.deepEqual(
      brandedElectron({
        binary: '/x/electron',
        folder: join(folder, 'out'),
        id: 'shop-ed80',
        name: 'shop',
        icon: DEFAULT_ICON,
        platform,
      }),
      { binary: '/x/electron' },
    )
  // macOS with a bundle that is not there: the stock executable, with the reason, and nothing written.
  const failed = brandedElectron({
    binary: join(folder, 'Missing.app', 'Contents', 'MacOS', 'Electron'),
    folder: join(folder, 'out'),
    id: 'shop-ed80',
    name: 'shop',
    icon: DEFAULT_ICON,
    platform: 'darwin',
  })
  assert.equal(failed.binary, join(folder, 'Missing.app', 'Contents', 'MacOS', 'Electron'))
  assert.equal(typeof failed.problem, 'string')
})
