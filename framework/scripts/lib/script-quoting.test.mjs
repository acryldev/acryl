/**
 * Lifecycle scripts are run by the platform's own shell: cmd.exe on Windows, where single quotes are not grouping characters. A filter written
 * `--filter './ide/*'` therefore reaches pnpm as the literal `'./ide/*'`, matches no project, and the build silently builds nothing. pnpm's `=` form
 * (`--filter=./ide/*`) needs no quoting and is passed through unchanged by every shell this repository runs in, so every filter is written that way.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** Every package.json in the workspace, node_modules and dot folders skipped. */
function manifests(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...manifests(path))
    else if (entry === 'package.json') found.push(path)
  }
  return found
}

test('every pnpm filter is written in its = form, which cmd.exe passes through unchanged', () => {
  const offenders = []
  for (const file of manifests(root)) {
    const scripts = JSON.parse(readFileSync(file, 'utf8')).scripts ?? {}
    for (const [name, command] of Object.entries(scripts)) {
      // cmd.exe keeps the single quotes: the filter matches nothing and the step is skipped without a word.
      if (/--filter\s+'/u.test(command)) offenders.push(`${file}: ${name}: ${command}`)
    }
  }
  assert.deepEqual(offenders, [])
})
