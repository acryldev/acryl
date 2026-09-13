import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEV_RESTART_EXIT_CODE, electronAppPath, launchDevelopmentElectron, setPlistString } from './launch-dev.mjs'

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

test(
  'a dev-mode restart exit stages a fresh bundle and spawns again instead of returning',
  // prepareBundle only runs on darwin (see launchDevelopmentElectron); CI's
  // ubuntu-latest runner would exercise the plain non-darwin branch instead
  // and never call prepareBundle at all.
  { skip: process.platform !== 'darwin' && 'darwin-only bundle staging path' },
  async () => {
    const prepared = []
    const cleaned = []
    const spawned = []
    const exitCodes = [DEV_RESTART_EXIT_CODE, DEV_RESTART_EXIT_CODE, 0]

    const code = await launchDevelopmentElectron(['--flag'], {
      importElectron: async () => ({ default: '/fake/Electron.app/Contents/MacOS/Electron' }),
      prepareBundle: async electronExecutable => {
        prepared.push(electronExecutable)
        const generation = prepared.length
        return {
          executable: `/fake/bundle-${String(generation)}/ACRYL`,
          cleanup: async () => { cleaned.push(generation) },
        }
      },
      spawnChild: async (executable, argv) => {
        spawned.push({ executable, argv })
        return exitCodes.shift()
      },
    })

    assert.equal(code, 0)
    // Every restart tears down the bundle it just used before staging the
    // next one - this is the fix: app.relaunch() would instead point a new
    // process at a bundle this same cleanup step had already deleted.
    assert.deepEqual(spawned.map(call => call.executable), [
      '/fake/bundle-1/ACRYL',
      '/fake/bundle-2/ACRYL',
      '/fake/bundle-3/ACRYL',
    ])
    assert.deepEqual(cleaned, [1, 2, 3])
    assert.ok(spawned.every(call => call.argv.includes('--flag')))
  },
)
