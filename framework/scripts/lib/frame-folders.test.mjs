import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { frameFolders } from './frame-folders.mjs'

const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..')

test('every frame package has a folder named by its key, with a package.json', () => {
  const folders = frameFolders(root)
  assert.ok(folders.size > 0)
  for (const [key, folder] of folders) {
    assert.ok(existsSync(join(folder, 'package.json')), `${key}: no package.json at ${folder}`)
    assert.equal(
      folder.split(/[\\/]/u).at(-1),
      key.split('/').at(-1),
      `${key}: the folder is named after its key without the scope`,
    )
  }
})

test('every package is found by the path it names', () => {
  const { packages } = JSON.parse(readFileSync(join(root, 'frame', 'packages.json'), 'utf8'))
  for (const [key, entry] of Object.entries(packages))
    assert.equal(frameFolders(root).get(key), resolve(root, entry.path))
})
