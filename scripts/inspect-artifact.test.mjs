import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyArtifactManifest } from './inspect-artifact.mjs'

const baseManifest = {
  product: 'cli',
  platform: 'darwin',
  arch: 'arm64',
  requiredPaths: ['bin/acryl', 'bin/node', 'lib/bin.js'],
  allowedNativePackagePatterns: ['node_modules/node-pty/prebuilds/darwin-arm64/**'],
  forbiddenPathPatterns: ['**/*.map', '**/tests/**'],
  maximumBytes: 100,
}

test('accepts a complete target-specific artifact', () => {
  assert.doesNotThrow(() => verifyArtifactManifest(baseManifest, {
    paths: [
      'bin/acryl',
      'bin/node',
      'lib/bin.js',
      'node_modules/node-pty/prebuilds/darwin-arm64/pty.node',
    ],
    bytes: 100,
  }))
})

test('reports every missing required path', () => {
  assert.throws(() => verifyArtifactManifest(baseManifest, {
    paths: ['bin/acryl'],
    bytes: 1,
  }), /missing required paths: bin\/node, lib\/bin\.js/)
})

test('reports forbidden release files', () => {
  assert.throws(() => verifyArtifactManifest(baseManifest, {
    paths: [...baseManifest.requiredPaths, 'lib/bin.js.map', 'node_modules/example/tests/unit.js'],
    bytes: 1,
  }), /forbidden paths: lib\/bin\.js\.map, node_modules\/example\/tests\/unit\.js/)
})

test('reports native files outside the target allowlist', () => {
  assert.throws(() => verifyArtifactManifest(baseManifest, {
    paths: [...baseManifest.requiredPaths, 'node_modules/node-pty/prebuilds/win32-x64/conpty.node'],
    bytes: 1,
  }), /foreign native paths: node_modules\/node-pty\/prebuilds\/win32-x64\/conpty\.node/)
})

test('reports byte-budget overflow', () => {
  assert.throws(() => verifyArtifactManifest(baseManifest, {
    paths: baseManifest.requiredPaths,
    bytes: 101,
  }), /exceeds byte budget: 101 > 100/)
})
