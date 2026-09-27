import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, appFolder, runAppCommand } from '../index.js'

const manifest = 'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: app.books\n  name: Books\n  version: 0.1.0\n  visibility: private\nspec:\n  runtime: cordis\n  lineage:\n    blueprint: acryl.blank\n    blueprintVersion: 0.1.0\n'
const hosting = () => ({ visibilityOf: () => 'unknown', create: () => { throw new Error('no hosting in this test') } })

test('the plugin registers /app as an effect, so disabling its row removes the command', () => {
  const effects = []; const registered = []
  apply({ effect: (run) => effects.push(run), commands: { register: (command) => { registered.push(command.name); return () => registered.splice(registered.indexOf(command.name), 1) } }, get: () => undefined })
  assert.equal(effects.length, 1)
  const dispose = effects[0]()
  assert.deepEqual(registered, ['app'])
  dispose()
  assert.deepEqual(registered, [])
})

test('outside an app it says so; inside one it saves, and refuses a secret', () => {
  assert.match(runAppCommand('save', undefined).text, /not an app/)
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'app-save-')))
  try {
    const app = join(root, 'books'); mkdirSync(join(app, 'extensions'), { recursive: true })
    writeFileSync(join(app, 'blend.yaml'), manifest)
    assert.equal(appFolder({ home: app }), app)
    assert.equal(appFolder({ home: root }), undefined)
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't'; process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@t'
    const ports = { git: (dir) => gitPort(dir), hosting }
    const saved = runAppCommand('save first', app, ports)
    assert.equal(saved.kind, 'success', saved.text)
    assert.match(saved.text, /Saved [0-9a-f]{8}\. It has no remote yet/u)
    writeFileSync(join(app, 'extensions', 'leak.js'), 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n')
    const refused = runAppCommand('save', app, ports)
    assert.equal(refused.kind, 'error')
    assert.match(refused.text, /extensions\/leak\.js:1 \(Anthropic API key\)/u)
    assert.match(runAppCommand('delete', app, ports).text, /Usage/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// The real git adapter, from the library.
import { gitCli } from '@webboxes/app-persistence'
const gitPort = (dir) => gitCli(dir)
void spawnSync
