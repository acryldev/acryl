import assert from 'node:assert/strict'
import { test } from 'node:test'
import { osVersion } from './os-version.mjs'

test("a packed app carries the higher of package.json's version and its Blend's", () => {
  assert.equal(osVersion('0.1.0', '0.1.4'), '0.1.4')
  assert.equal(osVersion('0.2.8', '0.1.0'), '0.2.8')
  assert.equal(osVersion('0.10.0', '0.9.9'), '0.10.0')
  assert.equal(osVersion('1.0.0', '1.0.0'), '1.0.0')
  assert.equal(osVersion('0.1.0', undefined), '0.1.0')
  assert.equal(osVersion(undefined, '0.3.0'), '0.3.0')
  assert.equal(osVersion('0.1.0', '0.2.0-beta.1'), '0.1.0')
})

test("the packed blend.yaml carries the version the OS shows, so the frame's bar agrees with About and Installed apps", async () => {
  const { withManifestVersion } = await import('./os-version.mjs')
  const yaml =
    'apiVersion: acryl/v1\nkind: Blend\nmetadata:\n  id: acryl.control-center\n  version: 0.1.0 # raised by share\n  name: ACRYL Control Center\nspec:\n  version: 9.9.9\n'
  assert.equal(
    withManifestVersion(yaml, '0.2.11'),
    yaml.replace('  version: 0.1.0 # raised by share', '  version: 0.2.11'),
  )
  assert.equal(
    withManifestVersion('metadata:\n  id: x\nspec: {}\n', '1.2.3'),
    'metadata:\n  version: 1.2.3\n  id: x\nspec: {}\n',
  )
  assert.equal(withManifestVersion('kind: Blend\n', '1.0.0'), 'kind: Blend\n')
})
