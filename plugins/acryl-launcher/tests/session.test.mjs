import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { JOURNEYS, commandLine, createSession, nameFromId } from '../index.js'
import { listApps, listBlends, listPlugins } from '../node-context.js'

const fake = (more = {}) => ({
  exists: path => path === 'taken' || path === 'shop/blend.yaml',
  listApps: () => [{ value: 'shop', label: 'shop' }],
  listBlends: async () => [{ value: 'acrylblends.notes-desktop', label: 'Notes' }],
  listPlugins: app => (app === 'shop' ? [{ value: 'cart', label: 'cart' }] : []),
  ...more,
})

/** Walk a journey with these answers and return the final state. */
async function walk(id, answers, context = fake()) {
  const session = createSession(id, context)
  let state = await session.begin()
  for (const value of answers) state = await session.answer(value)
  return state
}

test('every journey ends in the command that is shown, with Enter-only defaults where a default exists', async () => {
  const expected = {
    create: [['.', 'shop', 'notes'], 'acryl new shop notes'],
    blend: [['acrylblends.notes-desktop', '.', 'notes-desktop'], 'acryl new notes-desktop --from acrylblends.notes-desktop'],
    open: [['shop'], 'cd shop && npm run dev'],
    pull: [['shop', 'github:someone/pomodoro@0.1.0'], 'cd shop && acryl plugin pull github:someone/pomodoro@0.1.0'],
    share: [['shop', 'cart'], 'cd shop && acryl plugin publish cart'],
    update: [['shop'], 'cd shop && acryl update'],
    add: [['shop'], 'acryl apps add shop'],
    model: [[], 'acryl model set deepseek'],
    check: [[], 'acryl blends preflight'],
    code: [[], 'acryl code'],
  }
  assert.deepEqual(JOURNEYS.map(entry => entry.id).sort(), Object.keys(expected).sort(), 'a journey without a test, or a test without a journey')
  for (const [id, [answers, line]] of Object.entries(expected)) {
    const state = await walk(id, answers)
    assert.equal(state.kind, 'ready', id)
    assert.equal(state.line, line, id)
    assert.equal(commandLine(state.command), line, id)
  }
})

test('a text step offers its default, so Enter alone answers it', async () => {
  const session = createSession('create', fake())
  const where = await session.begin()
  assert.equal(where.initial, '.')
  const first = await session.answer(where.initial)
  assert.equal(first.initial, 'my-app')
  const second = await session.answer(first.initial)
  assert.equal(second.step.id, 'starter')
  assert.equal(second.options[0].value, 'blank')
  assert.equal((await session.answer('blank')).line, 'acryl new my-app blank')
  // The Blend journey names the app after the Blend.
  const blend = createSession('blend', fake())
  await blend.begin()
  await blend.answer('acrylblends.notes-desktop')
  assert.equal((await blend.answer('.')).initial, 'notes-desktop')
  assert.equal(nameFromId('acrylblends.42-things'), 'things')
})

test('a wrong answer stays on its step with the reason; a right one moves on', async () => {
  const session = createSession('create', fake())
  await session.begin()
  await session.answer('.')
  assert.match((await session.answer('Shop')).error, /lower case/u)
  assert.match((await session.answer('taken')).error, /already a folder/u)
  const next = await session.answer('  shop  ')
  assert.equal(next.step.id, 'starter')
  assert.equal(session.answers.name, 'shop')
  assert.match((await session.answer('no-such-starter')).error, /Choose one/u)
})

test('back walks one step back, keeps the answer as the default, and leaves the journey from the first step', async () => {
  const session = createSession('create', fake())
  await session.begin()
  await session.answer('.')
  await session.answer('shop')
  const back = await session.back()
  assert.equal(back.step.id, 'name')
  assert.equal(back.initial, 'shop')
  assert.equal((await session.back()).step.id, 'where')
  assert.equal(await session.back(), undefined)
  await session.answer('.')
  // From the end, back is the last question again.
  await session.answer('shop')
  await session.answer('todo')
  assert.equal((await session.back()).step.id, 'starter')
})

test('a folder for the new app: the suggestion, the folder in the command, and the name checked inside it', async () => {
  const context = fake({ defaultAppsFolder: () => '/home/me/ACRYL', exists: path => path === '/home/me/ACRYL/taken' })
  const session = createSession('create', context)
  const where = await session.begin()
  assert.equal(where.initial, '/home/me/ACRYL')
  assert.match((await session.answer('~/x')).error, /whole folder path/u)
  await session.answer('/home/me/ACRYL')
  assert.match((await session.answer('taken')).error, /already a folder named taken in \/home\/me\/ACRYL/u)
  await session.answer('shop')
  const ready = await session.answer('blank')
  assert.equal(ready.line, 'cd /home/me/ACRYL && acryl new shop blank')
  assert.equal(ready.command.ensureCwd, true)
})

test('a pre-answered step (the app picked on the home list) is skipped, going forward and back', async () => {
  const session = createSession('update', fake(), { app: '/home/me/ACRYL/shop' })
  const ready = await session.begin()
  assert.equal(ready.kind, 'ready')
  assert.equal(ready.line, 'cd /home/me/ACRYL/shop && acryl update')
  assert.equal(await session.back(), undefined)
  const pull = createSession('pull', fake(), { app: 'shop' })
  const step = await pull.begin()
  assert.equal(step.step.id, 'source')
  assert.equal(await pull.back(), undefined)
})

test('a choice with nothing to choose says why instead of an empty list', async () => {
  const state = await walk('open', [], fake({ listApps: () => [] }))
  assert.deepEqual(state.options, [])
  assert.match(state.empty, /No app here/u)
  const blends = await walk('blend', [], fake({ listBlends: async () => [] }))
  assert.match(blends.empty, /registry could not be read/u)
})

test('a command line quotes what a shell would split', () => {
  assert.equal(commandLine({ program: 'acryl', args: ['plugin', 'pull', 'a b'], cwd: 'my app' }), "cd 'my app' && acryl plugin pull 'a b'")
})

test('on disk: apps are the folders with blend.yaml, own plugins are those the library did not add', () => {
  const root = mkdtempSync(join(tmpdir(), 'acryl-launcher-'))
  try {
    for (const app of ['shop', 'notes']) {
      mkdirSync(join(root, app, 'plugins', 'acryl-router'), { recursive: true })
      writeFileSync(join(root, app, 'blend.yaml'), 'kind: Blend\n')
    }
    mkdirSync(join(root, 'shop', 'plugins', 'cart'))
    writeFileSync(join(root, 'shop', 'plugins', 'library.lock.json'), JSON.stringify({ version: 1, plugins: { 'acryl-router': {} } }))
    mkdirSync(join(root, 'not-an-app'))
    assert.deepEqual(listApps(root).map(app => app.value), ['notes', 'shop'])
    assert.deepEqual(listApps(join(root, 'shop')).map(app => app.value), ['.'])
    assert.deepEqual(listPlugins(root, 'shop').map(plugin => plugin.value), ['cart'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the registry list keeps only Blends acryl new can make, and is empty when the registry cannot be read', async () => {
  const index = { entries: [
    { id: 'acryl.blank', name: 'Blank', runtime: 'acryl' },
    { id: 'acrylblends.notes-desktop', name: 'Notes', runtime: 'acrylblends', description: 'notes' },
    { id: 'acrylblends.agent', name: 'An app that builds itself', runtime: 'acrylblends' },
  ] }
  const blends = await listBlends({ fetch: async () => ({ ok: true, json: async () => index }) })
  assert.deepEqual(blends.map(blend => blend.value), ['acrylblends.agent', 'acrylblends.notes-desktop'])
  assert.deepEqual(await listBlends({ fetch: async () => { throw new Error('offline') } }), [])
  assert.deepEqual(await listBlends({ fetch: async () => ({ ok: false }) }), [])
})
