import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildPack } from './build-manifest.mjs'
import { validateManifest } from './lib/manifest.mjs'

const doc = (over = {}) => ({ id: 'start.this-runtime', title: 'This runtime', path: 'start-here/this-runtime.md', when: 'always, first', surfaces: ['tui', 'web', 'desktop'], applies: 'all', ...over })
const example = (over = {}) => ({ id: 'tool.basic', type: 'tool', path: 'tool-basic', surfaces: ['tui'], teaches: 'a tool', docs: ['start.this-runtime'], scenario: 'tool-basic', ...over })
const manifest = (over = {}) => ({ schemaVersion: 1, packVersion: '0.1.0', navigation: [{ title: 'Start here', items: [doc()] }], examples: [example()], ...over })
const files = (over = {}) => ({ docFiles: ['docs.json', 'README.md', 'start-here/this-runtime.md'], exampleFiles: ['README.md', 'scenarios.json', 'packages/tool-basic/package.json', 'packages/tool-basic/index.js'], ...over })
const problems = (m, f = files()) => validateManifest(m, f)

test('a complete manifest is valid', () => assert.deepEqual(problems(manifest()), []))

test('rejects a wrong schemaVersion and a bad packVersion', () => {
  assert.match(problems(manifest({ schemaVersion: 2 })).join('\n'), /schemaVersion/)
  assert.match(problems(manifest({ packVersion: 'one' })).join('\n'), /packVersion/)
})

test('a doc needs id, title, when, path, surfaces and applies', () => {
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ when: '  ' })] }] })).join('\n'), /"when"/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ surfaces: [] })] }] })).join('\n'), /surfaces/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ surfaces: ['cli'] })] }] })).join('\n'), /surfaces/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ applies: 'maybe' })] }] })).join('\n'), /applies/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ id: 'Bad Id' })] }] })).join('\n'), /id must be/)
})

test('a listed doc path must exist and be a safe relative path', () => {
  assert.match(problems(manifest(), files({ docFiles: ['docs.json'] })).join('\n'), /does not exist under docs/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ path: '../escape.md' })] }] })).join('\n'), /safe relative/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ path: '/abs.md' })] }] })).join('\n'), /safe relative/)
})

test('duplicate ids are rejected', () => {
  const dup = manifest({ navigation: [{ title: 'g', items: [doc(), doc()] }] })
  assert.match(problems(dup).join('\n'), /duplicate id/)
})

test('seeAlso, examples and example docs must resolve to real ids', () => {
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ seeAlso: ['nope'] })] }] })).join('\n'), /seeAlso unknown doc id nope/)
  assert.match(problems(manifest({ navigation: [{ title: 'g', items: [doc({ examples: ['nope'] })] }] })).join('\n'), /examples unknown example id nope/)
  assert.match(problems(manifest({ examples: [example({ docs: ['nope'] })] })).join('\n'), /unknown doc id nope/)
})

test('an example needs a known type, teaches, scenario, surfaces and files', () => {
  assert.match(problems(manifest({ examples: [example({ type: 'gadget' })] })).join('\n'), /coverage-matrix type/)
  assert.match(problems(manifest({ examples: [example({ teaches: '' })] })).join('\n'), /teaches/)
  assert.match(problems(manifest({ examples: [example({ scenario: '' })] })).join('\n'), /scenario/)
  assert.deepEqual(problems(manifest({ examples: [example({ scenario: undefined })] })), [])
  assert.match(problems(manifest({ examples: [example({ surfaces: [] })] })).join('\n'), /surfaces/)
  assert.match(problems(manifest(), files({ exampleFiles: ['README.md'] })).join('\n'), /no files under/)
})

test('an unlisted doc or example file fails the index-completeness check', () => {
  assert.match(problems(manifest(), files({ docFiles: ['docs.json', 'README.md', 'start-here/this-runtime.md', 'orphan.md'] })).join('\n'), /docs\/orphan\.md is not listed/)
  assert.match(problems(manifest(), files({ exampleFiles: [...files().exampleFiles, 'packages/stray/index.js'] })).join('\n'), /example-plugins\/packages\/stray\/index\.js is not covered/)
})

test('example files may not live in test/tests directories (release pruner deletes them)', () => {
  const withTests = files({ exampleFiles: [...files().exampleFiles, 'packages/tool-basic/tests/case.js'] })
  assert.match(problems(manifest(), withTests).join('\n'), /test\/tests directory/)
  assert.deepEqual(problems(manifest(), files({ exampleFiles: [...files().exampleFiles, 'packages/tool-basic/checks/case.js'] })), [])
})

test('non-object input is reported, not thrown', () => {
  assert.deepEqual(problems(null), ['manifest is not an object'])
  assert.match(problems({ schemaVersion: 1, packVersion: '1.0.0', navigation: 'x', examples: [] }).join('\n'), /navigation must be an array/)
})

// ---- build-manifest against a real directory

function makePack() {
  const root = mkdtempSync(join(tmpdir(), 'acryl-pack-'))
  const put = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content) }
  put('docs/docs.json', JSON.stringify(manifest()))
  put('docs/start-here/this-runtime.md', '# This runtime\n')
  put('example-plugins/packages/tool-basic/package.json', '{}')
  put('example-plugins/scenarios.json', '[]')
  return { root, put }
}

test('build writes indexes, then --check passes, then a manifest edit makes them stale', () => {
  const { root, put } = makePack()
  try {
    assert.equal(buildPack(root, { check: false }).ok, true)
    const docsIndex = readFileSync(join(root, 'docs/README.md'), 'utf8')
    assert.match(docsIndex, /Generated from docs\.json/)
    assert.match(docsIndex, /\[This runtime\]\(start-here\/this-runtime\.md\)/)
    assert.match(readFileSync(join(root, 'example-plugins/README.md'), 'utf8'), /tool\.basic/)
    assert.equal(buildPack(root, { check: true }).ok, true)
    put('docs/docs.json', JSON.stringify(manifest({ navigation: [{ title: 'Start here', items: [doc({ title: 'Renamed' })] }] })))
    const stale = buildPack(root, { check: true })
    assert.equal(stale.ok, false)
    assert.match(stale.problems.join('\n'), /docs\/README\.md is stale/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('build refuses an invalid pack and writes nothing', () => {
  const { root, put } = makePack()
  try {
    put('docs/orphan.md', '# orphan\n')
    const result = buildPack(root, { check: false })
    assert.equal(result.ok, false)
    assert.match(result.problems.join('\n'), /orphan\.md is not listed/)
    assert.throws(() => readFileSync(join(root, 'docs/README.md'), 'utf8'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
