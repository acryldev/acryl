import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

it('docs.json is valid, every page and example it names exists, and the generated indexes are current', () => {
  const out = execFileSync(process.execPath, ['scripts/build-manifest.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  expect(out).toContain('manifest valid, indexes current')
})
