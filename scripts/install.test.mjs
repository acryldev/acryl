import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const script = new URL('./install.sh', import.meta.url)
const text = readFileSync(script, 'utf8')

test('the installer is valid bash', () => {
  const result = spawnSync('bash', ['-n', script.pathname], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('the installer asks the hardware for the CPU, so a Rosetta shell on an Apple silicon Mac still gets the arm64 build', () => {
  assert.match(text, /hw\.optional\.arm64/u)
})

test('the installer refuses an Intel Mac with a pointer to the desktop app instead of a 404', () => {
  assert.match(text, /not available for Intel Macs/u)
})

test('the installer verifies the SHA-256 against the release manifest and fails closed without it', () => {
  assert.match(text, /acryl-release-manifest\.json/u)
  assert.match(text, /refusing to install/u)
  assert.match(text, /ACRYL_SKIP_VERIFY/u)
})

test('the installer changes the shell files once, between markers, and can be told not to', () => {
  assert.match(text, />>> ACRYL CLI >>>/u)
  assert.match(text, /grep -qF "\$MARK_BEGIN"/u)
  assert.match(text, /ACRYL_NO_PATH_MODIFY/u)
})

test('the installer never runs sudo', () => {
  const code = text.split('\n').filter(line => !/^\s*#/u.test(line)).join('\n')
  assert.doesNotMatch(code.replace(/'[^']*'|"[^"]*"/gu, ''), /\bsudo\b/u)
})
