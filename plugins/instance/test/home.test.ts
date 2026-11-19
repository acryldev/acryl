import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  acrylRoot,
  appDataHome,
  appHomes,
  appIdOf,
  chatKeyOf,
  followFolder,
  migrateOldHome,
  moveChats,
  readAppId,
} from '../home.ts'

const scratch = mkdtempSync(join(tmpdir(), 'instance-home-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
const env = { ACRYL_HOME: join(scratch, 'acryl'), HOME: join(scratch, 'home') }
let counter = 0
function appFolder(name = 'shop'): string {
  counter += 1
  const dir = join(scratch, `app${String(counter)}`, name)
  mkdirSync(dir, { recursive: true })
  return dir
}
const write = (file: string, text: string) => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

test('the root is ~/.acryl on every OS and only an absolute ACRYL_HOME moves it', () => {
  assert.equal(acrylRoot('darwin', {}, '/Users/a'), '/Users/a/.acryl')
  assert.equal(acrylRoot('linux', { XDG_DATA_HOME: '/x' }, '/home/a'), '/home/a/.acryl')
  assert.equal(
    acrylRoot('win32', { LOCALAPPDATA: 'C:\\L' }, 'C:\\Users\\a'),
    'C:\\Users\\a\\.acryl',
  )
  assert.equal(acrylRoot('linux', { ACRYL_HOME: '/iso' }, '/home/a'), '/iso')
  assert.equal(acrylRoot('linux', { ACRYL_HOME: 'relative' }, '/home/a'), '/home/a/.acryl')
})

test('the first look at an app folder writes its id once, from the folder name, and later looks read it', () => {
  const dir = appFolder('My Notes')
  assert.equal(readAppId(dir), undefined)
  const id = appIdOf(dir, () => 'ab12')
  assert.equal(id, 'my-notes-ab12')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.acryl', 'app.json'), 'utf8')), { id })
  // The random part is not asked for again.
  assert.equal(
    appIdOf(dir, () => 'ffff'),
    id,
  )
  assert.equal(readAppId(dir), id)
})

test('an unreadable or invalid id file is not an id; a new one replaces nothing that was valid', () => {
  const dir = appFolder()
  write(join(dir, '.acryl', 'app.json'), '{not json')
  assert.equal(readAppId(dir), undefined)
  write(join(dir, '.acryl', 'app.json'), JSON.stringify({ id: '../escape' }))
  assert.equal(readAppId(dir), undefined)
})

test('the data of a folder app is <root>/apps/<id>/data on every OS, with the cache beside it', () => {
  const dir = appFolder()
  const id = appIdOf(dir, () => '0001')
  const homes = appHomes(dir, 'linux', env, env.HOME)
  assert.equal(homes.id, id)
  assert.equal(homes.data, join(env.ACRYL_HOME, 'apps', id, 'data'))
  assert.equal(homes.cache, join(env.ACRYL_HOME, 'apps', id, 'cache'))
  assert.equal(appDataHome(dir, 'linux', env, env.HOME), homes.data)
  // Windows: the same layout, as Windows paths, from the home alone.
  assert.equal(
    appDataHome(dir, 'win32', {}, 'C:\\Users\\Zoë Smith'),
    `C:\\Users\\Zoë Smith\\.acryl\\apps\\${id}\\data`,
  )
})

function oldHome(dir: string): void {
  write(join(dir, '.acrylblends', 'settings.patch.yml'), 'theme: dark\n')
  write(join(dir, '.acrylblends', 'sessions', 's1', 'a.jsonl'), '{"a":1}\n{"b":2}\n')
  write(join(dir, '.acrylblends', 'logs', 'dsh.log'), 'started\n')
  mkdirSync(join(dir, '.acrylblends', 'empty-folder'), { recursive: true })
}

test('migration: the old folder is copied, checked, and renamed to .acrylblends.old, never deleted', () => {
  const dir = appFolder()
  oldHome(dir)
  const data = appDataHome(dir, 'linux', env, env.HOME)
  const result = migrateOldHome(dir, data)
  assert.equal(result.status, 'moved')
  assert.equal(readFileSync(join(data, 'sessions', 's1', 'a.jsonl'), 'utf8'), '{"a":1}\n{"b":2}\n')
  assert.equal(readFileSync(join(data, 'settings.patch.yml'), 'utf8'), 'theme: dark\n')
  assert.ok(existsSync(join(data, 'empty-folder')))
  assert.equal(existsSync(join(dir, '.acrylblends')), false)
  assert.equal(readFileSync(join(dir, '.acrylblends.old', 'logs', 'dsh.log'), 'utf8'), 'started\n')
  // A second start has nothing to move.
  assert.deepEqual(migrateOldHome(dir, data), { status: 'none' })
})

test('migration: a data folder that already has content is never touched, and the old one stays', () => {
  const dir = appFolder()
  oldHome(dir)
  const data = appDataHome(dir, 'linux', env, env.HOME)
  write(join(data, 'keep.txt'), 'mine')
  const result = migrateOldHome(dir, data)
  assert.equal(result.status, 'refused')
  assert.equal(readFileSync(join(data, 'keep.txt'), 'utf8'), 'mine')
  assert.deepEqual(readdirSync(data), ['keep.txt'])
  assert.ok(existsSync(join(dir, '.acrylblends', 'settings.patch.yml')))
  assert.equal(existsSync(join(dir, '.acrylblends.old')), false)
})

test('migration: a copy that fails half way leaves the old folder as it was and no partial data', () => {
  const dir = appFolder()
  oldHome(dir)
  const data = appDataHome(dir, 'linux', env, env.HOME)
  assert.throws(
    () =>
      migrateOldHome(dir, data, (from, to) => {
        // Copy only the first entry, then fail: a disk that fills up, a file that is locked.
        const [first] = readdirSync(from)
        cpSync(join(from, first as string), join(to, first as string), { recursive: true })
        throw new Error('disk full')
      }),
    /could not move .* the old folder is unchanged/u,
  )
  assert.ok(existsSync(join(dir, '.acrylblends', 'sessions', 's1', 'a.jsonl')))
  assert.equal(existsSync(join(dir, '.acrylblends.old')), false)
  assert.equal(existsSync(data), false)
  // And the move works when tried again.
  assert.equal(migrateOldHome(dir, data).status, 'moved')
})

test('migration: a copy that is short of a file is caught by the check, not trusted', () => {
  const dir = appFolder()
  oldHome(dir)
  const data = appDataHome(dir, 'linux', env, env.HOME)
  assert.throws(
    () =>
      migrateOldHome(dir, data, (from, to) => {
        cpSync(from, to, { recursive: true })
        writeFileSync(join(to, 'logs', 'dsh.log'), 'start') // truncated
      }),
    /was not copied whole/u,
  )
  assert.ok(existsSync(join(dir, '.acrylblends', 'logs', 'dsh.log')))
  assert.equal(existsSync(data), false)
})

test('migration: an older .acrylblends.old is not overwritten', () => {
  const dir = appFolder()
  oldHome(dir)
  write(join(dir, '.acrylblends.old', 'previous.txt'), 'earlier')
  const data = appDataHome(dir, 'linux', env, env.HOME)
  const result = migrateOldHome(dir, data)
  assert.equal(result.status === 'moved' && result.kept.endsWith('.acrylblends.old-2'), true)
  assert.equal(readFileSync(join(dir, '.acrylblends.old', 'previous.txt'), 'utf8'), 'earlier')
})

test('chats: filed under the folder the app was in, they stay where the engine finds them and the new folder leads to them, with their workspace and branch chats', () => {
  const data = join(scratch, 'data-of-old-app')
  const from = '/Users/a/_projects/shop'
  const to = '/Users/a/.acryl/apps/shop-1ec5/source'
  write(join(data, 'sessions', chatKeyOf(from), 'session-1', 'log.jsonl'), '{}\n')
  write(
    join(data, 'storages', 'workspace.json'),
    JSON.stringify({
      tables: {
        workspaces: { w1: { path: from, sessionIds: ['session-1'] }, w2: { path: '/elsewhere' } },
      },
    }),
  )
  write(
    join(data, 'frame', 'branch-chats.json'),
    JSON.stringify({ roots: { [from]: { 'session-1': 'main' } }, open: { [from]: ['session-1'] } }),
  )
  assert.deepEqual(moveChats(data, from, to), { sessions: true, workspaces: 1, branchChats: true })
  // The engine refuses a chat whose log is not where its header's folder puts it: the old folder stays, and the new one is a link to it.
  assert.equal(lstatSync(join(data, 'sessions', chatKeyOf(from))).isDirectory(), true)
  assert.equal(lstatSync(join(data, 'sessions', chatKeyOf(to))).isSymbolicLink(), true)
  assert.equal(existsSync(join(data, 'sessions', chatKeyOf(from), 'session-1', 'log.jsonl')), true)
  assert.equal(existsSync(join(data, 'sessions', chatKeyOf(to), 'session-1', 'log.jsonl')), true)
  const workspaces = JSON.parse(readFileSync(join(data, 'storages', 'workspace.json'), 'utf8'))
    .tables.workspaces
  assert.deepEqual(
    [workspaces.w1.path, workspaces.w1.sessionIds, workspaces.w2.path],
    [to, ['session-1'], '/elsewhere'],
  )
  const chats = JSON.parse(readFileSync(join(data, 'frame', 'branch-chats.json'), 'utf8'))
  assert.deepEqual([Object.keys(chats.roots), Object.keys(chats.open)], [[to], [to]])
  // A second run finds nothing under the old folder and changes nothing.
  assert.deepEqual(moveChats(data, from, to), {
    sessions: false,
    workspaces: 0,
    branchChats: false,
  })
})

test('chats: the folder name is the one DSH gives (separators become one dash, other characters ~XXXX)', () => {
  assert.equal(chatKeyOf('/Users/a/_projects/p11_acr/shop'), '--Users-a-_projects-p11_acr-shop--')
  assert.equal(chatKeyOf('/Users/a/My Shop'), '--Users-a-My~0020Shop--')
})

test('chats: an app started in another folder than last time brings its chats along; the first start only records the folder', () => {
  const data = join(scratch, 'data-of-moved-app')
  const before = '/Users/a/_projects/shop'
  const after = '/Users/a/elsewhere/shop-renamed'
  assert.equal(followFolder(data, before), undefined)
  assert.equal(JSON.parse(readFileSync(join(data, 'app-folder.json'), 'utf8')).root, before)
  write(join(data, 'sessions', chatKeyOf(before), 'session-1', 'log.jsonl'), '{}\n')
  write(
    join(data, 'storages', 'workspace.json'),
    JSON.stringify({ tables: { workspaces: { w1: { path: before } } } }),
  )
  assert.equal(followFolder(data, before), undefined)
  assert.deepEqual(followFolder(data, after), { sessions: true, workspaces: 1, branchChats: false })
  assert.equal(existsSync(join(data, 'sessions', chatKeyOf(after), 'session-1', 'log.jsonl')), true)
  assert.equal(JSON.parse(readFileSync(join(data, 'app-folder.json'), 'utf8')).root, after)
  assert.equal(followFolder(data, after), undefined)
})
