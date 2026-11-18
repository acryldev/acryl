import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { LOCK_FILE } from '../lock.ts'
import { applySnapshot, captureApp, verifyApp } from '../snapshot.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const BLEND = `# What this app is.
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acme.board, name: board, version: 0.1.0 }
spec:
  runtime: cordis
  rows:
    - id: router # the routes every plugin mounts on
      name: acryl-router
    - id: extensions
      name: extensions
    - id: server
      name: acryl-node-server
`

function plugin(app: string, name: string, body = '') {
  mkdirSync(join(app, 'plugins', name), { recursive: true })
  writeFileSync(
    join(app, 'plugins', name, 'index.ts'),
    `export const name = '${name}'\nexport function apply() {}\n${body}`,
  )
}

function app(id = 'board'): string {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-test-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'blend.yaml'),
    BLEND.replace('id: acme.board, name: board', `id: acme.${id}, name: ${id}`),
  )
  plugin(dir, 'acryl-router')
  writeFileSync(join(dir, 'plugins', 'library.json'), JSON.stringify({ plugins: ['acryl-router'] }))
  return dir
}

test('capture gives every plugin folder of the app a row, keeps the comments, locks it, and changes nothing the second time', () => {
  const dir = app()
  plugin(dir, 'notes')
  const capture = captureApp(dir)
  assert.deepEqual(capture.addedRows, ['notes'])
  const yaml = readFileSync(join(dir, 'blend.yaml'), 'utf8')
  assert.match(yaml, /# What this app is\./)
  assert.match(yaml, /# the routes every plugin mounts on/)
  // The new row sits before the extensions row, so the extensions row never starts it a second time.
  assert.ok(yaml.indexOf('id: notes') < yaml.indexOf('id: extensions'), yaml)
  const lock = JSON.parse(readFileSync(join(dir, LOCK_FILE), 'utf8'))
  assert.deepEqual(
    lock.modules.map((module: { name: string; source: string }) => [module.name, module.source]),
    [
      ['acryl-router', 'plugins/acryl-router'],
      ['notes', 'plugins/notes'],
    ],
  )
  assert.deepEqual(verifyApp(dir), { ok: true, problems: [], checked: 3 })
  assert.deepEqual(captureApp(dir).addedRows, [])
  assert.equal(readFileSync(join(dir, 'blend.yaml'), 'utf8'), yaml)
})

test('verify names the manifest and each plugin folder changed after the capture', () => {
  const dir = app()
  plugin(dir, 'notes')
  captureApp(dir)
  writeFileSync(
    join(dir, 'blend.yaml'),
    `${readFileSync(join(dir, 'blend.yaml'), 'utf8')}# edited\n`,
  )
  writeFileSync(
    join(dir, 'plugins', 'notes', 'index.ts'),
    'export const name = "notes"\n// edited\n',
  )
  const result = verifyApp(dir)
  assert.equal(result.ok, false)
  assert.match(result.problems.join('\n'), /blend\.yaml changed since the lock/)
  assert.match(result.problems.join('\n'), /notes: plugins\/notes differs from the locked digest/)
})

test('verify refuses a lock that places a plugin outside the app', () => {
  const dir = app()
  captureApp(dir)
  const lock = JSON.parse(readFileSync(join(dir, LOCK_FILE), 'utf8'))
  lock.modules[0].source = '../elsewhere'
  writeFileSync(join(dir, LOCK_FILE), JSON.stringify(lock))
  assert.match(verifyApp(dir).problems.join('\n'), /not a plugin folder of the app/)
})

test('apply brings a snapshot into an app: its rows and folders come in, and applying an older one leaves the newer folder in place but off', () => {
  // An older version (no notes) and a newer one (notes, with its row).
  const older = app()
  captureApp(older)
  const newer = app()
  plugin(newer, 'notes', '// the newer one\n')
  captureApp(newer)

  const target = app('shop')
  captureApp(target)
  const forward = applySnapshot(newer, target)
  assert.equal(forward.ok, true, forward.problems.join('\n'))
  assert.deepEqual(
    forward.modules.map((module) => [module.name, module.status]),
    [
      ['acryl-router', 'unchanged'],
      ['notes', 'added'],
    ],
  )
  assert.equal(forward.manifestChanged, true)
  assert.match(readFileSync(join(target, 'blend.yaml'), 'utf8'), /id: notes/)
  // The rows come in; the app stays the app it is.
  assert.match(readFileSync(join(target, 'blend.yaml'), 'utf8'), /id: acme\.shop, name: shop/)
  assert.match(readFileSync(join(target, 'plugins', 'notes', 'index.ts'), 'utf8'), /the newer one/)
  assert.equal(verifyApp(target).ok, true)

  const back = applySnapshot(older, target)
  assert.equal(back.ok, true, back.problems.join('\n'))
  const restored = readFileSync(join(target, 'blend.yaml'), 'utf8')
  assert.doesNotMatch(restored, /id: notes/)
  // The folder is somebody's work: kept and reported, and switched off, because the extensions row starts every folder without a row.
  assert.deepEqual(back.extra, ['notes'])
  assert.match(restored, /off:\n\s+- notes/)
  assert.equal(existsSync(join(target, 'plugins', 'notes', 'index.ts')), true)

  // Applying the same snapshot twice is harmless.
  const again = applySnapshot(newer, target)
  assert.equal(again.ok, true)
  assert.deepEqual(
    again.modules.map((module) => module.status),
    ['unchanged', 'unchanged'],
  )
})

test('apply refuses the whole snapshot when a folder in the app differs from the locked one, and writes nothing', () => {
  const snapshot = app()
  plugin(snapshot, 'notes', '// theirs\n')
  captureApp(snapshot)
  const target = app()
  plugin(target, 'notes', '// mine\n')
  const before = readFileSync(join(target, 'blend.yaml'), 'utf8')
  const result = applySnapshot(snapshot, target)
  assert.equal(result.ok, false)
  assert.match(
    result.problems.join('\n'),
    /notes: plugins\/notes in the app differs from the snapshot's/,
  )
  assert.equal(readFileSync(join(target, 'blend.yaml'), 'utf8'), before)
  assert.match(readFileSync(join(target, 'plugins', 'notes', 'index.ts'), 'utf8'), /mine/)
})

test('apply refuses a snapshot that no longer matches its own lock', () => {
  const snapshot = app()
  plugin(snapshot, 'notes')
  captureApp(snapshot)
  const copy = mkdtempSync(join(tmpdir(), 'snapshot-copy-'))
  dirs.push(copy)
  cpSync(snapshot, copy, { recursive: true })
  writeFileSync(
    join(copy, 'plugins', 'notes', 'index.ts'),
    'export const name = "notes"\n// tampered\n',
  )
  const target = app()
  const result = applySnapshot(copy, target)
  assert.equal(result.ok, false)
  assert.match(result.problems.join('\n'), /differs from the locked digest/)
  assert.equal(existsSync(join(target, 'plugins', 'notes')), false)
})
