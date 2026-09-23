import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'

/**
 * contracts/reexports.json is what the two catalogue sites read to tell "a component this package exports
 * from the app's primitives" apart from "a registry item" and from "not built at all". A stale copy would
 * quietly re-file Button or Tooltip under "not yet built" on both sites while the sources say otherwise,
 * which is exactly the class of bug the artifact guard caught for lib/client.js (a stale bundle served
 * while source tests passed). This runs the real generator and compares, so there is one implementation.
 */

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const committed = join(packageRoot, 'contracts/reexports.json')
const scratch = mkdtempSync(join(tmpdir(), 'acryl-reexports-'))

afterAll(() => { rmSync(scratch, { recursive: true, force: true }) })

it('contracts/reexports.json is not stale', () => {
  const fresh = join(scratch, 'reexports.json')
  execFileSync(process.execPath, [join(packageRoot, 'scripts/generate-reexports.mjs'), fresh], { cwd: packageRoot })
  expect(readFileSync(fresh, 'utf8')).toBe(readFileSync(committed, 'utf8'))
})

it('every export of index.ts that is not a registry item is in the inventory', () => {
  const document = JSON.parse(readFileSync(committed, 'utf8')) as { groups: { source: string, exports: string[] }[], registryItemExports: string[] }
  const exported = document.groups.flatMap(group => group.exports)
  // The ten names the catalogue used to file under "not yet built" while @acryl/ui shipped them.
  for (const name of ['Button', 'Input', 'Tooltip', 'HoverCard', 'Menu', 'Toast', 'StateDot', 'ConnectionIndicator', 'Tag', 'JsonTree', 'CodeBlock']) {
    expect(exported).toContain(name)
    expect(document.registryItemExports).not.toContain(name)
  }
})
