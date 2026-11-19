import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { createSource } from './create-source.mjs'

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
