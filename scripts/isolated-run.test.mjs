import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isolatedEnvironment, relocateHome } from './lib/isolated-run.mjs'

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
    assert.equal(JSON.parse(readFileSync(join(copy, '.dsh', 'profiles', 'web', 'package.json'), 'utf8')).dependencies.q, `file:${join(copy, 'plugins', '.store', 'q', '1.0.0.tgz')}`)
    assert.match(readFileSync(join(copy, '.dsh', 'profiles', 'web', 'node_modules', 'x', 'package.json'), 'utf8'), /source/u, 'dependencies are not rewritten')
    assert.match(readFileSync(join(source, '.dsh', 'storages', 'workspace.json'), 'utf8'), /source/u, 'the source is never written')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('isolatedEnvironment moves HOME and drops what would send a shell or a tool back to the real one', () => {
  const real = '/Users/someone'
  const run = isolatedEnvironment({
    label: 'env-test',
    base: { PATH: '/usr/bin', HOME: real, ZDOTDIR: real, HISTFILE: `${real}/.zsh_history`, XDG_CONFIG_HOME: `${real}/.config`, XDG_DATA_HOME: `${real}/.local/share`, XDG_STATE_HOME: `${real}/.local/state`, XDG_CACHE_HOME: `${real}/.cache`, ACRYL_HOME: `${real}/.acryl`, XDG_RUNTIME_DIR: '/run/user/501' },
  })
  try {
    assert.equal(run.env.PATH, '/usr/bin')
    assert.notEqual(run.env.HOME, real)
    assert.ok(run.env.HOME.startsWith(run.root))
    for (const key of ['ZDOTDIR', 'HISTFILE', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) assert.equal(run.env[key], undefined, key)
    assert.ok(run.env.ACRYL_HOME.startsWith(run.root))
    // Not a home folder: the per-session runtime directory stays.
    assert.equal(run.env.XDG_RUNTIME_DIR, '/run/user/501')
  } finally { run.dispose() }
})
