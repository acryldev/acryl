import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

test('assembles a selector-only manifest with exact optional target dependencies', () => {
  const output = execFileSync(process.execPath, ['scripts/publish-npm-cli.mjs', '--print-manifests'], { encoding: 'utf8' })
  const { selector, targets } = JSON.parse(output)
  assert.deepEqual(Object.keys(selector.dependencies ?? {}), [])
  assert.deepEqual(Object.keys(selector.optionalDependencies).sort(), [
    'acryl-cli-darwin-arm64', 'acryl-cli-darwin-x64', 'acryl-cli-linux-arm64', 'acryl-cli-linux-x64', 'acryl-cli-windows-x64',
  ])
  for (const [target, manifest] of Object.entries(targets)) {
    assert.equal(manifest.name, `acryl-cli-${target}`)
    assert.equal(manifest.version, selector.version)
    assert.equal(selector.optionalDependencies[manifest.name], selector.version)
    assert.equal(manifest.files.includes('runtime/**'), true)
    assert.equal(manifest.os.length, 1)
    assert.equal(manifest.cpu.length, 1)
  }
})
