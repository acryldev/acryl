// The space the apps on this computer take (spec 052 T008): `acryl apps reinstall` puts an app onto the shared Program, `acryl clean` removes the
// Programs no app uses. Neither ever touches an app's own files or data. npm is the fake from the install tests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installApp } from '../app-install.js'
import { addApp } from '../apps-registry.js'
import { planClean, reinstallApp, removePrograms } from '../app-space.js'
import { runAppsCommand, runCleanCommand } from '../apps-command.js'
import { fakeNpm } from './fake-npm.mjs'

function scratch(run) {
  const root = mkdtempSync(join(tmpdir(), 'acryl-space-'))
  return Promise.resolve(run(root)).finally(() => rmSync(root, { recursive: true, force: true }))
}
const linux = { platform: 'linux' }

/** An app on Blends 1.7.33 with its own files and data: what reinstall and clean must never touch. */
function blendsApp(root, name, version = '1.7.33') {
  const folder = join(root, name)
  mkdirSync(join(folder, 'src'), { recursive: true })
  mkdirSync(join(folder, '.acryl', 'data'), { recursive: true })
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, dependencies: { '@acryldev/blends': `^${version}`, 'left-pad': '1.3.0' } }))
  writeFileSync(join(folder, 'blend.yaml'), `id: acrylblends.${name}\nkind: Blend\n`)
  writeFileSync(join(folder, 'src', 'app.ts'), `export const name = '${name}'\n`)
  writeFileSync(join(folder, '.acryl', 'data', 'notes.json'), '[{"title":"keep me"}]\n')
  return folder
}

/** Every file of the app outside node_modules, by content. */
function ownFiles(folder, base = '', into = {}) {
  for (const entry of readdirSync(join(folder, base), { withFileTypes: true })) {
    const path = base === '' ? entry.name : `${base}/${entry.name}`
    if (path === 'node_modules' || path.startsWith('node_modules.')) continue
    if (entry.isDirectory()) ownFiles(folder, path, into)
    else into[path] = createHash('sha256').update(readFileSync(join(folder, path))).digest('hex')
  }
  return into
}

const ino = path => statSync(path).ino
const pad = folder => join(folder, 'node_modules', 'left-pad', 'index.js')

/** A home with the Program for 1.7.33, made by a first app's install. */
async function withProgram(root) {
  const home = join(root, 'home')
  const first = blendsApp(root, 'first')
  await installApp({ folder: first, home, npm: fakeNpm().npm, ...linux })
  return { home, first, program: join(home, 'program', 'blends-1.7.33') }
}

test('reinstall puts an app that npm installed in full onto the shared Program, and leaves its own files and data as they were', () => scratch(async root => {
  const { home, program } = await withProgram(root)
  const old = blendsApp(root, 'old')
  await fakeNpm().npm(['install'], old)
  const own = ownFiles(old)
  assert.notEqual(ino(pad(old)), ino(join(program, 'node_modules', 'left-pad', 'index.js')), 'before: its own copy')
  const result = await reinstallApp({ folder: old, home, npm: fakeNpm().npm, ...linux })
  assert.deepEqual(result, { code: 0, program: 'used' })
  assert.equal(ino(pad(old)), ino(join(program, 'node_modules', 'left-pad', 'index.js')), 'after: the Program\'s file')
  assert.deepEqual(ownFiles(old), own)
  assert.deepEqual(readdirSync(old).filter(name => name.startsWith('node_modules')), ['node_modules'], 'nothing left beside it')
}))

test('a reinstall that fails gives the app back the packages it had', () => scratch(async root => {
  const { home } = await withProgram(root)
  const old = blendsApp(root, 'old')
  await fakeNpm().npm(['install'], old)
  const before = ino(pad(old))
  const result = await reinstallApp({ folder: old, home, npm: fakeNpm({ code: 1 }).npm, ...linux })
  assert.equal(result.code, 1)
  assert.equal(ino(pad(old)), before, 'the same files as before')
  assert.deepEqual(readdirSync(old).filter(name => name.startsWith('node_modules')), ['node_modules'])
}))

test('acryl apps reinstall: one app by id, or every app in the list; a missing folder is said and skipped', () => scratch(async root => {
  const { home } = await withProgram(root)
  const a = blendsApp(root, 'a')
  const b = blendsApp(root, 'b')
  for (const folder of [a, b]) { await fakeNpm().npm(['install'], folder); addApp(home, { path: folder }) }
  const gone = blendsApp(root, 'gone')
  addApp(home, { path: gone })
  rmSync(gone, { recursive: true })
  const lines = []
  const io = { home, cwd: root, out: line => lines.push(line), err: line => lines.push(`err: ${line}`), npm: fakeNpm().npm, ...linux }
  assert.equal(await runAppsCommand(['reinstall', 'a'], io), 0)
  assert.equal(ino(pad(a)), ino(join(home, 'program', 'blends-1.7.33', 'node_modules', 'left-pad', 'index.js')))
  assert.notEqual(ino(pad(b)), ino(pad(a)), 'b was not asked for')
  lines.length = 0
  assert.equal(await runAppsCommand(['reinstall'], io), 1, 'one app could not be reinstalled')
  assert.equal(ino(pad(b)), ino(pad(a)))
  assert.ok(lines.some(line => /gone/u.test(line) && /no folder/u.test(line)), lines.join('\n'))
  assert.equal(await runAppsCommand(['reinstall', 'nope'], io), 1)
}))

test('clean plans only the Programs no app uses, and leftovers of an install that stopped; the one in use stays', () => scratch(async root => {
  const { home, first } = await withProgram(root)
  addApp(home, { path: first })
  const older = join(home, 'program', 'blends-1.7.20')
  mkdirSync(join(older, 'node_modules', 'x'), { recursive: true })
  writeFileSync(join(older, 'node_modules', 'x', 'big.js'), Buffer.alloc(300_000))
  writeFileSync(join(older, 'sha256.json'), '{}')
  const leftover = join(home, 'program', 'blends-1.7.33.making-999999999')
  mkdirSync(join(leftover, 'node_modules'), { recursive: true })
  const plan = planClean({ home })
  assert.deepEqual(plan.map(entry => [entry.path, entry.reason]), [
    [older, 'no app on this computer uses Blends 1.7.20'],
    [leftover, 'left over from an install that stopped'],
  ])
  assert.ok(plan[0].bytes >= 300_000, 'its own file counts')
}))

test('clean counts a Program\'s files that an app links to as not freed, and the apps acryl keeps in its home as users', () => scratch(async root => {
  const { home, first } = await withProgram(root)
  // Not in the list, so its Program is unused; but its packages are linked from the app, so removing it frees only its own two small files
  // (sha256.json and the hidden lockfile, which is each one's own copy).
  const plan = planClean({ home })
  assert.equal(plan.length, 1)
  assert.ok(plan[0].bytes < 20_000, String(plan[0].bytes))
  // Control Center's own copy lives in the home: its Program is in use.
  const kept = blendsApp(home, 'control-center')
  assert.ok(existsSync(join(kept, 'package.json')))
  assert.deepEqual(planClean({ home }), [])
  assert.ok(existsSync(first))
}))

test('acryl clean says exactly what it removes and how much, asks once, and removes only that; no, or no terminal without --yes, removes nothing', () => scratch(async root => {
  const { home, first } = await withProgram(root)
  const own = ownFiles(first)
  const program = join(home, 'program', 'blends-1.7.33')
  const lines = []
  const io = { home, out: line => lines.push(line), err: line => lines.push(`err: ${line}`), ...linux }
  const asked = []
  assert.equal(await runCleanCommand([], { ...io, ask: async question => { asked.push(question); return 'n' } }), 0)
  assert.equal(asked.length, 1)
  assert.match(lines.join('\n'), /blends-1\.7\.33/u)
  assert.match(lines.join('\n'), /no app's own files or data/u)
  assert.ok(existsSync(program), 'no: nothing removed')
  lines.length = 0
  assert.equal(await runCleanCommand([], io), 2, 'no terminal and no --yes')
  assert.match(lines.join('\n'), /--yes/u)
  assert.ok(existsSync(program))
  assert.equal(await runCleanCommand([], { ...io, ask: async () => 'y' }), 0)
  assert.equal(existsSync(program), false)
  assert.deepEqual(ownFiles(first), own, 'the app is untouched')
  assert.ok(existsSync(pad(first)), 'its packages still work: they were links')
  lines.length = 0
  assert.equal(await runCleanCommand(['--yes'], io), 0)
  assert.match(lines.join('\n'), /Nothing to clean/u)
}))

test('removePrograms removes nothing outside the home\'s program folder', () => scratch(async root => {
  const home = join(root, 'home')
  const app = blendsApp(root, 'app')
  assert.throws(() => removePrograms(home, [{ path: app }]), /outside/u)
  assert.ok(existsSync(app))
}))
