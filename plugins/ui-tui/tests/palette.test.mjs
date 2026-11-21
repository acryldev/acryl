import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('the committed palette.js is what the token file compiles to (regenerate with scripts/compile-palette.mjs)', () => {
  const script = fileURLToPath(new URL('../scripts/compile-palette.mjs', import.meta.url))
  assert.equal(spawnSync(process.execPath, [script, '--check']).status, 0)
})
