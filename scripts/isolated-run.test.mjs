import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { relocateHome } from './lib/isolated-run.mjs'

test('relocateHome re-points a copied app home at itself and leaves paths outside the source alone', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'relocate-')))
  try {
    const source = join(root, 'source'); const copy = join(root, 'copy'); const project = join(root, 'my-project')
    mkdirSync(join(source, '.dsh', 'storages'), { recursive: true }); mkdirSync(join(source, '.dsh', 'profiles', 'web', 'node_modules', 'x'), { recursive: true }); mkdirSync(join(source, 'plugins', '.store'), { recursive: true })
    writeFileSync(join(source, '.dsh', 'storages', 'workspace.json'), JSON.stringify({ workspaces: [join(source, 'documents', 'default-workspace'), project] }))
    writeFileSync(join(source, '.dsh', 'profiles', 'web', 'package.json'), JSON.stringify({ dependencies: { q: `file:${join(source, 'plugins', '.store', 'q', '1.0.0.tgz')}` } }))
    writeFileSync(join(source, '.dsh', 'profiles', 'web', 'node_modules', 'x', 'package.json'), JSON.stringify({ note: source }))
    writeFileSync(join(source, 'plugins', '.store', 'index.json'), JSON.stringify({ note: source }))
    cpSync(source, copy, { recursive: true })

    const changed = relocateHome(copy, source)
    assert.deepEqual(changed.sort(), [join(copy, '.dsh', 'profiles', 'web', 'package.json'), join(copy, '.dsh', 'storages', 'workspace.json')])
    assert.deepEqual(JSON.parse(readFileSync(join(copy, '.dsh', 'storages', 'workspace.json'), 'utf8')).workspaces, [join(copy, 'documents', 'default-workspace'), project])
    assert.match(readFileSync(join(copy, '.dsh', 'profiles', 'web', 'package.json'), 'utf8'), new RegExp(`file:${join(copy, 'plugins')}`.replace(/[/.]/gu, '\\$&')))
    assert.match(readFileSync(join(copy, '.dsh', 'profiles', 'web', 'node_modules', 'x', 'package.json'), 'utf8'), /source/u, 'dependencies are not rewritten')
    assert.match(readFileSync(join(source, '.dsh', 'storages', 'workspace.json'), 'utf8'), /source/u, 'the source is never written')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
