import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNpmEvidence } from './assert-npm-evidence.mjs'

const baseline = {
  canonicalInstalledPackageCount: 100,
  installedBytes: 1_000,
  installWallTimeMs: 1_000,
}

test('accepts a candidate meeting reduction and time budgets', () => {
  assert.doesNotThrow(() => assertNpmEvidence(baseline, {
    canonicalInstalledPackageCount: 80,
    installedBytes: 800,
    installWallTimeMs: 1_100,
  }))
})

test('reports every exceeded budget', () => {
  assert.throws(() => assertNpmEvidence(baseline, {
    canonicalInstalledPackageCount: 81,
    installedBytes: 801,
    installWallTimeMs: 1_101,
  }), /package count.*installed bytes.*install time/su)
})
