#!/usr/bin/env node
/**
 * Seal an unsigned macOS app bundle with an ad-hoc signature.
 *
 * electron-builder skips signing when there is no Developer ID, and a skipped build leaves only the Electron binary's linker signature: `codesign --verify --deep
 * --strict` then fails ("code has no resources but signature indicates they must be present"), and macOS on Apple silicon treats a downloaded copy of such a bundle as
 * damaged rather than from an unidentified developer. Sealing the whole bundle ad hoc makes it a valid, verifiable bundle (the person still confirms the first launch
 * until a Developer ID signature and notarization replace this, which `dist:mac` does on a credentialed machine).
 *
 * The entitlements are the ones electron-builder itself applies when it signs (JIT, unsigned executable memory, library validation off), so the sealed app
 * behaves like a signed one. Usage: node scripts/seal-mac-app.mjs <path/to/ACRYL.app>
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const app = process.argv[2] === undefined ? undefined : resolve(process.argv[2])
if (process.platform !== 'darwin') {
  console.error('seal-mac-app: macOS only')
  process.exit(2)
}
if (app === undefined || !app.endsWith('.app') || !existsSync(app)) {
  console.error('usage: node scripts/seal-mac-app.mjs <path/to/App.app>')
  process.exit(2)
}

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const entitlements = join(dirname(builderRequire.resolve('app-builder-lib/package.json')), 'templates', 'entitlements.mac.plist')
if (!existsSync(entitlements)) {
  console.error(`seal-mac-app: electron-builder's default entitlements are missing: ${entitlements}`)
  process.exit(1)
}

/** Run codesign and stop on any failure. */
function codesign(args) {
  const result = spawnSync('codesign', args, { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`seal-mac-app: codesign ${args.slice(0, 3).join(' ')} ... exited with ${String(result.status)}`)
    process.exit(1)
  }
}

codesign(['--force', '--deep', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, app])
codesign(['--verify', '--deep', '--strict', app])
console.log(`seal-mac-app: ${app} is sealed (ad hoc) and verifies strictly`)
