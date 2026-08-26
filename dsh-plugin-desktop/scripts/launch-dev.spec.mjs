import assert from 'node:assert/strict'
import { test } from 'node:test'
import { electronAppPath, setPlistString } from './launch-dev.mjs'

test('resolves the Electron app containing a macOS development executable', () => {
  assert.equal(
    electronAppPath('/project/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    '/project/node_modules/electron/dist/Electron.app',
  )
  assert.throws(() => electronAppPath('/usr/local/bin/electron'), /not inside a macOS app bundle/u)
})

test('rewrites one existing property-list string without changing neighboring keys', () => {
  const source = [
    '<key>CFBundleDisplayName</key>',
    '<string>Electron</string>',
    '<key>CFBundleName</key>',
    '<string>Electron</string>',
  ].join('\n')

  const rewritten = setPlistString(source, 'CFBundleDisplayName', 'ACRYL')
  assert.match(rewritten, /<key>CFBundleDisplayName<\/key>\n<string>ACRYL<\/string>/u)
  assert.match(rewritten, /<key>CFBundleName<\/key>\n<string>Electron<\/string>/u)
  assert.throws(() => setPlistString(source, 'MissingKey', 'ACRYL'), /no MissingKey string/u)
})
