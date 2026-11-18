// Real-execution tests for validate-registry.mjs (spec 038-ui-component-library, T037): each
// rule gets a fixture engineered to fail it, run through the actual script as a subprocess
// against a scratch registry, not a unit test of internal functions.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const SCRIPT = join(fileURLToPath(import.meta.url), '..', 'validate-registry.mjs')
// A subdirectory of the real package, not os.tmpdir(): the copied script's bare `import ... from
// 'yaml'` resolves by walking up from its own location, and only finds the real node_modules
// (already installed here) if it stays inside this tree.
const SCRATCH_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '.scratch-validate-registry-tests')
mkdirSync(SCRATCH_ROOT, { recursive: true })

function scratchRegistry(itemYaml, css, tsx = "import { useId } from 'react'\nexport const X = () => null\n") {
  const root = mkdtempSync(join(SCRATCH_ROOT, 'case-'))
  const registrySeed = join(root, 'registry-seed')
  const itemDir = join(registrySeed, 'acryl.ui.fixture', 'web')
  mkdirSync(itemDir, { recursive: true })
  writeFileSync(join(registrySeed, 'acryl.ui.fixture', 'item.yaml'), itemYaml)
  writeFileSync(join(itemDir, 'Fixture.tsx'), tsx)
  writeFileSync(join(itemDir, 'Fixture.module.css'), css)
  writeFileSync(join(registrySeed, 'index.json'), JSON.stringify({ items: [{ id: 'acryl.ui.fixture' }] }))
  return { root, registrySeed }
}

// The script resolves registry-seed/ as a sibling of its own scripts/ directory, so the
// faithful way to test it as a real subprocess (not by importing its internals) is to copy
// it one level under a scratch tree shaped the same way, rather than refactor it to take a
// path argument just for testing.
function runOn(root) {
  const scriptCopy = join(root, 'scripts', 'validate-registry.mjs')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(scriptCopy, readFileSync(SCRIPT, 'utf8'))
  try {
    const out = execFileSync('node', [scriptCopy], { encoding: 'utf8' })
    return { ok: true, out }
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const GOOD_CSS = '.fixture { color: var(--dsw-alias-label-primary); }'
const GOOD_YAML = `id: acryl.ui.fixture
version: 0.1.0
origin:
  source: deepseek-harness 5dda764ed3
  from: some/path.tsx
  note: extracted
contract:
  summary: A fixture.
`

test('a good fixture passes the ingest gate', () => {
  const { root, registrySeed } = scratchRegistry(GOOD_YAML, GOOD_CSS)
  try {
    const result = runOn(root)
    assert.equal(result.ok, true)
    assert.match(result.out, /1 item\(s\) passed/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a hex color is rejected', () => {
  const { root } = scratchRegistry(GOOD_YAML, '.fixture { color: #ff0000; }')
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /hex color/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a theme selector is rejected', () => {
  const { root } = scratchRegistry(GOOD_YAML, '.dark .fixture { color: red; }')
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /theme selector/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an undocumented static token is rejected', () => {
  const { root } = scratchRegistry(GOOD_YAML, '.fixture { color: var(--dsw-static-neutral-bluish-400); }')
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /static token/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a cross-item relative import is rejected (real bug: SwitchField once imported ../fields/fields.module.css)', () => {
  const { root } = scratchRegistry(GOOD_YAML, GOOD_CSS, "import css from '../other-item/other.module.css'\nexport const X = () => null\n")
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /cross-item import '\.\.\/other-item\/other\.module\.css'/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a disallowed import is rejected', () => {
  const { root } = scratchRegistry(GOOD_YAML, GOOD_CSS, "import axios from 'axios'\nexport const X = () => null\n")
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /disallowed import 'axios'/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('missing provenance is rejected', () => {
  const { root } = scratchRegistry('id: acryl.ui.fixture\nversion: 0.1.0\ncontract:\n  summary: A fixture.\n', GOOD_CSS)
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /missing origin/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a ported item with no licence mentioned is rejected', () => {
  const yaml = `id: acryl.ui.fixture
version: 0.1.0
origin:
  source: some-lib
  from: some/path.tsx
  note: ported (nothing said about where it came from)
contract:
  summary: A fixture.
`
  const { root } = scratchRegistry(yaml, GOOD_CSS)
  try {
    const result = runOn(root)
    assert.equal(result.ok, false)
    assert.match(result.out, /must record the source licence/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cleanup', () => {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true })
})
