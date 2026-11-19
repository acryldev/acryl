/**
 * A framework app plugin is a package an app can install: its `lib/` must load from a `node_modules` folder with no TypeScript
 * stripper in sight. Node refuses to strip types inside `node_modules` (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so a package
 * left source-only passes every workspace test and fails in every installed app. This copies one built package into a throwaway
 * `node_modules` and imports it there, the shape an installed app sees (spec 051 T017).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../..', import.meta.url))
const packageFolder = join(repo, 'plugins', 'agent')

test('a built framework plugin imports from node_modules the way an installed app loads it', () => {
  const app = mkdtempSync(join(tmpdir(), 'acryl-install-'))
  try {
    const installed = join(app, 'node_modules', '@acryldev/agent')
    mkdirSync(installed, { recursive: true })
    for (const file of ['package.json', 'lib'])
      cpSync(join(packageFolder, file), join(installed, file), { recursive: true })
    // The package's own dependencies, where an install puts them beside it.
    symlinkSync(
      join(packageFolder, 'node_modules', '@deepseek-ai'),
      join(app, 'node_modules', '@deepseek-ai'),
    )
    const exported = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "import('@acryldev/agent').then((module) => console.log(module.agent.name, Object.keys(module).sort().join(',')))",
      ],
      { cwd: app, encoding: 'utf8' },
    )
    assert.equal(exported.trim(), 'agent agent,memory,model,scripted,tools')
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
