/**
 * Tests for graft-deepscan.
 *
 * The load-bearing assertion is the last one: every patch this script carries
 * must still match the *installed* graft. If it does not, the script would
 * silently no-op and the next deep scan would quietly fall back to ~80%
 * coverage — exactly the failure this script exists to prevent. Skip that case
 * when graft is not installed; the rest are pure.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  GRAFT_PATCHES,
  applyPatch,
  resolveGraftPackageRoot,
} from './graft-deepscan.mjs'

const fixture = {
  id: 'fixture',
  file: 'fixture.js',
  why: 'test',
  find: 'const answer = 41;\n',
  // Mirrors the real contract: every replacement carries its own sentinel, and
  // idempotency is decided by that sentinel rather than by the exact text.
  replace: 'const answer = 42; // ACRYL-LOCAL PATCH (graft-deepscan):fixture\n',
}

describe('applyPatch', () => {
  it('replaces a single match', () => {
    const result = applyPatch('const answer = 41;\n', fixture)
    assert.equal(result.status, 'applied')
    assert.equal(result.text, fixture.replace)
  })

  it('is idempotent', () => {
    const once = applyPatch('const answer = 41;\n', fixture)
    const twice = applyPatch(once.text, fixture)
    assert.equal(twice.status, 'current')
    assert.equal(twice.text, once.text)
  })

  it('reports drift instead of silently doing nothing', () => {
    const result = applyPatch('const answer = 40;\n', fixture)
    assert.equal(result.status, 'drift')
    assert.equal(result.text, 'const answer = 40;\n')
  })

  it('refuses an ambiguous match', () => {
    const result = applyPatch('const answer = 41;\nconst answer = 41;\n', fixture)
    assert.equal(result.status, 'ambiguous')
  })
})

describe('the shipped patch table', () => {
  it('has unique ids and non-empty anchors', () => {
    assert.equal(new Set(GRAFT_PATCHES.map(patch => patch.id)).size, GRAFT_PATCHES.length)
    for (const patch of GRAFT_PATCHES) {
      assert.ok(patch.find.length > 0, `${patch.id}: empty find`)
      assert.ok(patch.replace.includes('ACRYL-LOCAL PATCH (graft-deepscan)'), `${patch.id}: unmarked`)
      assert.ok(patch.replace.includes(patch.find.split('\n')[0]), `${patch.id}: does not build on its anchor`)
    }
  })

  it('applies cleanly to its own anchor and then reports current', () => {
    for (const patch of GRAFT_PATCHES) {
      const first = applyPatch(patch.find, patch)
      assert.equal(first.status, 'applied', `${patch.id}: did not apply to its own anchor`)
      assert.equal(applyPatch(first.text, patch).status, 'current', `${patch.id}: not idempotent`)
    }
  })

  it('matches the installed graft, or is already applied', { skip: !hasGraft() }, () => {
    const packageRoot = resolveGraftPackageRoot()
    for (const patch of GRAFT_PATCHES) {
      const source = readFileSync(join(packageRoot, patch.file), 'utf8')
      const result = applyPatch(source, patch)
      assert.notEqual(
        result.status,
        'drift',
        `${patch.id}: installed graft no longer contains this anchor — re-derive the patch`,
      )
      assert.notEqual(result.status, 'ambiguous', `${patch.id}: anchor matched more than once`)
    }
  })
})

function hasGraft() {
  try {
    resolveGraftPackageRoot()
    return true
  } catch {
    return false
  }
}
