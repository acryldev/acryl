import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CAPABILITY_BASELINE,
  CLEAN_INSTALL_BUDGET,
  CLI_TARGETS,
  DESKTOP_TARGETS,
  createArtifactReceipt,
  createReleaseManifest,
  releasePromotionAllowed,
  validateReleaseManifest,
  validateReceiptFiles,
  verifyPackageVersions,
} from './release-manifest.mjs'

const digest = 'a'.repeat(64)
const version = '0.1.19'

function receipt(surface, target, suffix = '') {
  return createArtifactReceipt({
    surface,
    target,
    version,
    capabilityBaseline: CAPABILITY_BASELINE,
    location: `acryl-${surface}-${target}${suffix}.archive`,
    integrity: { value: digest },
    cleanInstall: surface === 'cli' ? { bytes: CLEAN_INSTALL_BUDGET.maximumBytes, milliseconds: CLEAN_INSTALL_BUDGET.maximumMilliseconds } : undefined,
  })
}

function completeManifest() {
  return createReleaseManifest({
    version,
    capabilityBaseline: CAPABILITY_BASELINE,
    receipts: [
      ...Object.keys(CLI_TARGETS).map(target => receipt('cli', target)),
      ...Object.keys(CLI_TARGETS).map(target => receipt('web', target)),
      ...DESKTOP_TARGETS.map(target => receipt('desktop', target)),
    ],
  })
}

test('accepts a complete versioned multi-surface release manifest', () => {
  assert.doesNotThrow(() => validateReleaseManifest(completeManifest()))
})

test('rejects a missing required surface target', () => {
  const manifest = completeManifest()
  manifest.artifacts = manifest.artifacts.filter(entry => entry.surface !== 'web' || entry.target !== 'linux-x64')
  assert.throws(() => validateReleaseManifest(manifest), /missing required artifacts: web\/linux-x64/)
})

test('accepts a cli+web-only manifest without desktop targets', () => {
  // release-cli.yml and release-desktop.yml promote independent manifests;
  // a cli+web manifest must not be required to also carry desktop targets.
  const manifest = createReleaseManifest({
    version,
    capabilityBaseline: CAPABILITY_BASELINE,
    receipts: [
      ...Object.keys(CLI_TARGETS).map(target => receipt('cli', target)),
      ...Object.keys(CLI_TARGETS).map(target => receipt('web', target)),
    ],
  })
  assert.doesNotThrow(() => validateReleaseManifest(manifest))
})

test('rejects duplicate surface target entries', () => {
  const manifest = completeManifest()
  manifest.artifacts.push(manifest.artifacts[0])
  assert.throws(() => validateReleaseManifest(manifest), /duplicate artifact entry: cli\/darwin-arm64/)
})

test('rejects manifest and receipt version, checksum, and baseline drift', () => {
  const manifest = completeManifest()
  manifest.artifacts[0].receipt.version = '9.9.9'
  assert.throws(() => validateReleaseManifest(manifest), /receipt version mismatch/)

  const checksumManifest = completeManifest()
  checksumManifest.artifacts[0].receipt.integrity.value = 'b'.repeat(64)
  assert.throws(() => validateReleaseManifest(checksumManifest), /checksum does not match receipt/)

  const baselineManifest = completeManifest()
  baselineManifest.artifacts[0].receipt.capabilityBaseline = 'other-baseline'
  assert.throws(() => validateReleaseManifest(baselineManifest), /receipt capabilityBaseline mismatch/)
})

test('rejects absent and tampered receipt artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'acryl-release-manifest-'))
  const valid = receipt('web', 'linux-x64')
  writeFileSync(join(root, 'receipt.json'), JSON.stringify(valid))
  assert.throws(() => validateReceiptFiles([join(root, 'receipt.json')]), /location is absent/)
  writeFileSync(join(root, valid.location), 'tampered')
  assert.throws(() => validateReceiptFiles([join(root, 'receipt.json')]), /checksum mismatch/)
})

test('rejects CLI clean-install size and time budget regressions', () => {
  const sizeManifest = completeManifest()
  sizeManifest.artifacts[0].receipt.cleanInstall.bytes += 1
  assert.throws(() => validateReleaseManifest(sizeManifest), /clean install size budget exceeded/)

  const timeManifest = completeManifest()
  timeManifest.artifacts[0].receipt.cleanInstall.milliseconds += 1
  assert.throws(() => validateReleaseManifest(timeManifest), /clean install time budget exceeded/)
})

test('rejects package version drift before release assembly', () => {
  assert.doesNotThrow(() => verifyPackageVersions(version, { 'acryl-tui/package.json': { version } }))
  assert.throws(() => verifyPackageVersions(version, { 'acryl-web/package.json': { version: '9.9.9' } }), /version drift: release 0\.1\.19 != acryl-web\/package\.json 9\.9\.9/)
})

test('blocks complete-release promotion when any required gate failed', () => {
  const manifest = completeManifest()
  assert.throws(() => releasePromotionAllowed({ manifest, requiredJobs: [{ name: 'web-linux-x64', status: 'failure' }] }), /complete release promotion blocked by failed gates: web-linux-x64/)
  assert.equal(releasePromotionAllowed({ manifest, requiredJobs: [{ name: 'all-surfaces', status: 'success' }] }), true)
})
