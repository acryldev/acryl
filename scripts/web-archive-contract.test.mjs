import assert from 'node:assert/strict'
import test from 'node:test'
import { artifactReceipt, nodeDistribution, webTarget } from './web-archive-contract.mjs'

test('defines portable Web targets and emits a release-contract receipt', () => {
  assert.deepEqual(webTarget('linux-x64'), { nodePlatform: 'linux', nodeArch: 'x64', windows: false })
  assert.throws(() => webTarget('freebsd-x64'), /unsupported Web target/)
  assert.deepEqual(nodeDistribution('windows-x64', '24.19.0'), {
    basename: 'node-v24.19.0-win-x64',
    extension: 'zip',
  })
  assert.deepEqual(artifactReceipt({ version: '0.1.19', target: 'darwin-arm64', archive: 'https://example.test/acryl-web-darwin-arm64.tar.gz', sha256: 'a'.repeat(64) }), {
    schemaVersion: 1, surface: 'web', target: 'darwin-arm64', version: '0.1.19', capabilityBaseline: 'acryl-capability-baseline-v1', location: 'https://example.test/acryl-web-darwin-arm64.tar.gz', integrity: { algorithm: 'sha256', value: 'a'.repeat(64) },
  })
})
