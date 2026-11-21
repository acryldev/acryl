import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { createSource, repositoryOnlyIn } from './create-source.mjs'

test('a --from folder reaches create as an absolute existing folder, written bare, with ./ or absolute; a registry id is left as given', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'create-source-'))
  try {
    const folder = join(cwd, 'apps', 'acryl-ade')
    mkdirSync(folder, { recursive: true })
    for (const written of ['apps/acryl-ade', './apps/acryl-ade', folder]) {
      const source = createSource(written, cwd)
      assert.equal(source, folder, written)
      assert.ok(isAbsolute(source), written)
    }
    assert.equal(createSource('acrylblends.small-crm', cwd), 'acrylblends.small-crm')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("a Blend repository's own .github is found in the app made from it, so the packer can leave it out of the person's app", () => {
  const app = mkdtempSync(join(tmpdir(), 'repository-only-'))
  try {
    assert.deepEqual(repositoryOnlyIn(app), [])
    mkdirSync(join(app, '.github', 'workflows'), { recursive: true })
    assert.deepEqual(repositoryOnlyIn(app), ['.github'])
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
