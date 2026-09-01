import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyArtifactManifest } from './inspect-artifact.mjs'
import { artifactReceipt, nodeDistribution, webNativeAllowlist, webTarget } from './web-archive-contract.mjs'

test('allows only target-native node-pty Windows ConPTY binaries', () => {
  const manifest = {
    product: 'web', platform: 'win32', arch: 'x64',
    requiredPaths: ['runtime/bin/acryl-web.cmd', 'runtime/bin/node.exe', 'lib/bin.js'],
    forbiddenPathPatterns: ['**/*.map', '**/tests/**'],
    allowedNativePackagePatterns: webNativeAllowlist(webTarget('windows-x64')),
    maximumBytes: 1_000_000_000,
  }
  const inventory = extra => ({ paths: ['runtime/bin/acryl-web.cmd', 'runtime/bin/node.exe', 'lib/bin.js', ...extra], bytes: 10 })
  // node-pty embeds the target's own ConPTY binaries here.
  verifyArtifactManifest(manifest, inventory(['node_modules/node-pty/build/Release/conpty/OpenConsole.exe',
    'node_modules/node-pty/build/Release/conpty/conpty.dll',
    'node_modules/node-pty/third_party/conpty/1.25.260303002/win10-x64/OpenConsole.exe',
    'node_modules/node-pty/third_party/conpty/1.25.260303002/win10-x64/conpty.dll']))
  // The other architecture's vendored binary must still be rejected.
  assert.throws(() => verifyArtifactManifest(manifest, inventory(['node_modules/node-pty/third_party/conpty/1.25.260303002/win10-arm64/OpenConsole.exe'])), /foreign native paths/)
})

test('defines portable Web targets and emits a release-contract receipt', () => {
  assert.deepEqual(webTarget('linux-x64'), { nodePlatform: 'linux', nodeArch: 'x64', windows: false })
  assert.throws(() => webTarget('freebsd-x64'), /unsupported Web target/)
  assert.deepEqual(nodeDistribution('windows-x64', '24.19.0'), {
    basename: 'node-v24.19.0-win-x64',
    extension: 'zip',
  })
  assert.ok(webNativeAllowlist(webTarget('windows-x64')).includes('node_modules/**/*win10-x64*/**'))
  assert.ok(webNativeAllowlist(webTarget('windows-x64')).includes('node_modules/*node-pty*/build/Release/conpty/**'))
  assert.deepEqual(artifactReceipt({ version: '0.1.19', target: 'darwin-arm64', archive: 'https://example.test/acryl-web-darwin-arm64.tar.gz', sha256: 'a'.repeat(64) }), {
    schemaVersion: 1, surface: 'web', target: 'darwin-arm64', version: '0.1.19', capabilityBaseline: 'acryl-capability-baseline-v1', location: 'https://example.test/acryl-web-darwin-arm64.tar.gz', integrity: { algorithm: 'sha256', value: 'a'.repeat(64) },
  })
})
