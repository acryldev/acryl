// Real-execution tests for scripts/acryl-ui.mjs (spec 038-ui-component-library, tasks.md T038).
// Runs the actual generator against the real package, then the actual add/diff commands against a
// real scratch directory - no mocked filesystem, so a bug in the digest logic (there was one: diff
// compared the registry to itself) shows up here the same way it showed up by hand.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const GENERATE = join(ROOT, 'scripts', 'generate-registry.mjs')
const CLI = join(ROOT, 'scripts', 'acryl-ui.mjs')

function run(script, args) {
  return execFileSync('node', [script, ...args], { encoding: 'utf8' })
}

test('generate-registry produces a valid, non-empty index with digests', () => {
  const out = run(GENERATE, [])
  assert.match(out, /generated \d+ registry item/u)
  const index = JSON.parse(readFileSync(join(ROOT, 'registry-seed', 'index.json'), 'utf8'))
  assert.ok(index.items.length > 0)
  for (const item of index.items) {
    assert.equal(item.kind, 'ui-component')
    assert.ok(item.files.length > 0, `${item.id} has no files`)
  }
})

test('acryl-ui add copies real source, diff detects a real edit, and a second add is idempotent', () => {
  const target = mkdtempSync(join(tmpdir(), 'acryl-ui-add-'))
  try {
    const added = run(CLI, ['add', 'acryl.ui.card', target])
    assert.match(added, /added acryl\.ui\.card \(web\)/u)
    const cardFile = join(target, 'ui', 'card', 'Card.tsx')
    assert.ok(existsSync(cardFile))

    assert.match(run(CLI, ['diff', 'acryl.ui.card', target]), /unchanged/u)

    appendFileSync(cardFile, '\n// edited by the plugin\n')
    assert.match(run(CLI, ['diff', 'acryl.ui.card', target]), /locally edited.*Card\.tsx/u)

    run(CLI, ['add', 'acryl.ui.card', target])   // re-add restores the registry copy
    assert.match(run(CLI, ['diff', 'acryl.ui.card', target]), /unchanged/u)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})

test('acryl-ui add rejects an unknown id and a surface the item does not have', () => {
  const target = mkdtempSync(join(tmpdir(), 'acryl-ui-add-'))
  try {
    assert.throws(() => run(CLI, ['add', 'acryl.ui.nonexistent', target]), /unknown registry item/u)
    assert.throws(() => run(CLI, ['add', 'acryl.ui.card', target, '--surface', 'tui']), /has no 'tui' surface/u)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
