import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const cli = join(import.meta.dirname, '..')
const read = (path: string) => JSON.parse(readFileSync(join(cli, path), 'utf8'))

// `upgrade` replaces a library file only when it knows the bytes as released (the app's lock, else this history). A history that stops at an old
// release makes every file released after it look edited, and `upgrade` refuses the app (63-acryl-control-center, 2026-11-18: its files were
// 1.5.16's byte for byte). legacy/layouts.json lists every published release (its own check fails when it misses one), so this follows it.
test('the library history covers every published release since it began (0.9.1)', () => {
  const covered = new Set<string>(read('shared/library-history-versions.json'))
  const released: string[] = read('legacy/layouts.json').releases.map(
    (release: { version: string }) => release.version,
  )
  const since = (version: string) => {
    const [major = 0, minor = 0] = version.split('.').map(Number)
    return major > 0 || minor >= 9
  }
  const missing = released.filter((version) => since(version) && !covered.has(version))
  expect(missing, `run: node scripts/build-library-history.mjs ${missing.join(' ')}`).toEqual([])
})
