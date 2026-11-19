import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { coveredBy, uncoveredLibraryPlugins } from './lint-coverage.mjs'

test('the lint config must cover every root-source library plugin, and the vendored shape is never asked', () => {
  const root = mkdtempSync(join(tmpdir(), 'lint-coverage-'))
  try {
    for (const [folder, entries] of [
      ['agent', { '': 'index.ts' }],
      ['desktop', { '': 'launch.ts', '/main': 'main.ts' }],
      ['acryl-router', { '': 'src/index.ts' }],
    ]) {
      mkdirSync(join(root, 'plugins', folder), { recursive: true })
      writeFileSync(join(root, 'plugins', folder, 'plugin.json'), JSON.stringify({ entries }))
    }
    const plugins = join(root, 'plugins')
    const agent = 'plugins/agent is a root-source library plugin but biome.json files.includes does not cover it: add "plugins/agent/**"'
    const desktop =
      'plugins/desktop is a root-source library plugin but biome.json files.includes does not cover it: add "plugins/desktop/**"'

    // The real config's pattern for each folder covers its entry file; the vendored src/-shape plugin is not asked.
    assert.deepEqual(uncoveredLibraryPlugins(plugins, ['framework/**', 'plugins/agent/**', 'plugins/desktop/**']), [])
    // A new root-source plugin missing from the includes is named, in the order the folders are read.
    assert.deepEqual(uncoveredLibraryPlugins(plugins, ['framework/**', 'plugins/agent/**']), [desktop])
    assert.deepEqual(uncoveredLibraryPlugins(plugins, []), [agent, desktop])
    // A later negation wins, as biome applies them, so excluding the folder reopens the gap.
    assert.equal(coveredBy(['plugins/*/**', '!plugins/agent/**'], 'plugins/agent/index.ts'), false)
    assert.equal(coveredBy(['plugins/*/**'], 'plugins/agent/index.ts'), true)
    // `**` crosses folders and `**` before a slash may match none.
    assert.equal(coveredBy(['plugins/**'], 'plugins/agent/test/x.ts'), true)
    assert.equal(coveredBy(['plugins/**/*.ts'], 'plugins/agent/index.ts'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
