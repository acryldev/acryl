// The Chrome launch's one piece of parsing that can run without a browser: the port Chrome writes into its own profile when started with
// --remote-debugging-port=0. The rest (spawn, DevTools readiness, the kill) is exercised by every page gate.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { devToolsActivePort } from './door-probe.mjs'

test('the port Chrome chose is read from DevToolsActivePort; an absent or malformed file is undefined', () => {
  const profile = mkdtempSync(join(tmpdir(), 'door-probe-port-'))
  try {
    assert.equal(devToolsActivePort(profile), undefined)
    writeFileSync(join(profile, 'DevToolsActivePort'), '54321\n/devtools/browser/6d2f\n')
    assert.equal(devToolsActivePort(profile), 54321)
    writeFileSync(join(profile, 'DevToolsActivePort'), 'not-a-port\n/devtools/browser/6d2f\n')
    assert.equal(devToolsActivePort(profile), undefined)
    writeFileSync(join(profile, 'DevToolsActivePort'), '')
    assert.equal(devToolsActivePort(profile), undefined)
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})
