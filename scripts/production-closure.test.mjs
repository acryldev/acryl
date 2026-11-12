import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { execShim } from './lib/portable-commands.mjs'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
// Test tooling that reached the shipped runtimes through acrylblends' optional vitest peer (see .pnpmfile.cjs): fsevents is the macOS-only
// native the Web archive refuses, the rest is weight.
const TEST_TOOLING = ['vitest', 'vite', 'fsevents']
const SHIPPED = ['acryl-web', 'acryl-cli']

/** The packages `pnpm why` finds for `names` in `pkg`'s dependency graph, production only or all of it. */
function why(pkg, names, { prod }) {
  const output = execShim('corepack', ['pnpm', '--filter', pkg, 'why', ...names, '--json', ...(prod ? ['--prod'] : [])], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(output).map(found => `${found.name}@${found.version}`)
}

test('the test tooling is in the workspace, so the production check below looks at a graph that has it', () => {
  assert.notDeepEqual(why('acryl-web', ['vitest'], { prod: false }), [])
})

for (const pkg of SHIPPED) {
  test(`${pkg}'s production closure, which pnpm deploy ships, has no test tooling`, () => {
    assert.deepEqual(why(pkg, TEST_TOOLING, { prod: true }), [])
  })
}
