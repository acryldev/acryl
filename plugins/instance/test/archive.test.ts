import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { parse, stringify } from 'yaml'
import { DATA_REF, WORKTREE_REF } from '../archive.ts'
import { acrylRoot, appFolders, openProductStorage } from '../storage.ts'

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'instance-archive-')))
after(() => rmSync(scratch, { recursive: true, force: true }))

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: scratch,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Zoë',
      GIT_AUTHOR_EMAIL: 'zoe@example.invalid',
      GIT_COMMITTER_NAME: 'Zoë',
      GIT_COMMITTER_EMAIL: 'zoe@example.invalid',
    },
  }).trim()

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** Every file under `dir` with its text, `.git` left out: what the person would see in the folder. */
function tree(dir: string, skip: (path: string) => boolean = () => false): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      const rel = relative(dir, path).split('\\').join('/')
      if (rel === '.git' || skip(rel)) continue
      if (entry.isDirectory()) walk(path)
      else files[rel] = readFileSync(path, 'utf8')
    }
  }
  walk(dir)
  return files
}

const refs = (source: string): string =>
  git(source, 'for-each-ref', '--format=%(objectname) %(refname)')

/** A product's storage in a moved home, with an app whose repository has history, a branch, a tag, unsaved work and data. */
function product(home: string) {
  const storage = openProductStorage({
    writtenBy: '1.0.0',
    env: { HOME: home },
    home,
  })
  const app = storage.create('Blank', (source) => {
    git(source, 'init', '-q', '-b', 'main')
    write(join(source, '.gitignore'), 'node_modules/\n')
    write(join(source, 'src', 'app.ts'), 'export const v = 1\n')
    write(join(source, 'plugins', 'notes', 'index.ts'), 'export {}\n')
    write(join(source, 'gone.txt'), 'deleted later\n')
    git(source, 'add', '-A')
    git(source, 'commit', '-q', '-m', 'first')
    git(source, 'tag', 'v1')
    git(source, 'switch', '-q', '-c', 'idea')
    write(join(source, 'src', 'idea.ts'), 'export const idea = true\n')
    git(source, 'add', '-A')
    git(source, 'commit', '-q', '-m', 'an idea')
    git(source, 'switch', '-q', 'main')
    write(join(source, 'src', 'app.ts'), 'export const v = 2\n')
    git(source, 'commit', '-q', '-am', 'second')
  })
  const folders = appFolders(acrylRoot(process.platform, { HOME: home }, home), app.id)
  // Unsaved: a changed file, a new one, a deleted one, and an ignored package of the person's.
  write(join(folders.source, 'src', 'app.ts'), 'export const v = 3 // not saved\n')
  write(join(folders.source, 'src', 'new page.tsx'), 'export {}\n')
  rmSync(join(folders.source, 'gone.txt'))
  write(join(folders.source, 'node_modules', 'left-pad', 'index.js'), 'x\n')
  // A key the engine would read from the folder it runs in: never exported, even unignored.
  write(join(folders.source, '.env'), 'DEEPSEEK_API_KEY=sk-test\n')
  // Data: what goes, and what never leaves the machine in an archive.
  write(join(folders.data, 'sessions', 'chat.jsonl'), '{"turn":1}\n')
  write(join(folders.data, 'settings.yaml'), 'theme: dark\n')
  write(join(folders.data, 'logs', 'host.log'), 'log\n')
  write(join(folders.data, '.credentials.yaml'), 'DEEPSEEK_API_KEY: sk-test\n')
  write(join(folders.data, '.env'), 'DEEPSEEK_API_KEY=sk-test\n')
  write(join(folders.data, 'instance.json'), '{"pid":1}\n')
  // What belongs to one run, and the chats (filed under the absolute folder they ran in: not carried yet).
  write(join(folders.data, 'frame-url.json'), '{"url":"http://127.0.0.1:3741/?token=secret"}\n')
  write(join(folders.data, 'frame', 'branch-chats.json'), '{}\n')
  write(join(folders.data, 'sessions', 'project', 'session.lock'), '1\n')
  // The data names the app's own folder: the workspace's project list (JSON) and a settings file (YAML).
  write(
    join(folders.data, 'storages', 'workspace.json'),
    `${JSON.stringify({ projects: [{ path: folders.source, name: 'Blank' }] })}\n`,
  )
  // As the workspace writes it: a long folder folded over two lines, which no plain text search finds.
  const settings = stringify(
    { workspace: { projects: [folders.source] }, theme: 'dark' },
    { lineWidth: 40 },
  )
  assert.ok(!settings.includes(folders.source), 'the folder is folded in the settings file')
  write(join(folders.data, 'acryl-settings.yaml'), settings)
  // The composition the launcher writes again on every boot, naming the app's plugins by file URL: never carried.
  write(
    join(folders.data, 'node_modules', 'acrylblends-frame', 'cordis.patch.yml'),
    `- insert:\n    - id: page\n      name: ${pathToFileURL(join(folders.source, 'plugins', 'page.ts')).href}\n`,
  )
  return { storage, app, folders }
}

test('export then import: every branch, tag and version, HEAD on its branch, the unsaved files unsaved again, and the data without keys or logs', () => {
  const home = join(scratch, 'Zoë home')
  const { storage, app, folders } = product(home)
  const before = {
    refs: refs(folders.source),
    status: git(folders.source, 'status', '--porcelain'),
  }
  const file = join(scratch, 'out', 'My notes.acrylblend')
  mkdirSync(dirname(file), { recursive: true })
  storage.export(app.id, file, { data: true })
  assert.ok(statSync(file).size > 0)
  assert.ok(!existsSync(`${file}.part`))

  // The export wrote nothing into the person's repository.
  assert.equal(refs(folders.source), before.refs)
  assert.equal(git(folders.source, 'status', '--porcelain'), before.status)
  assert.deepEqual(readdirSync(folders.cache), [], 'the scratch repository is gone')

  const imported = storage.import(file)
  assert.equal(imported.name, 'My notes')
  assert.equal(imported.named, true)
  assert.notEqual(imported.id, app.id)
  const copy = appFolders(acrylRoot(process.platform, { HOME: home }, home), imported.id)

  assert.equal(refs(copy.source), before.refs, 'the same branches and tags at the same commits')
  assert.equal(git(copy.source, 'symbolic-ref', 'HEAD'), 'refs/heads/main')
  assert.equal(
    git(copy.source, 'status', '--porcelain'),
    before.status
      .split('\n')
      .filter((line) => line !== '?? .env')
      .join('\n'),
  )
  assert.deepEqual(
    tree(copy.source),
    tree(folders.source, (path) => path.startsWith('node_modules') || path === '.env'),
    'the files as the person left them, without what .gitignore keeps out and without keys',
  )
  assert.equal(git(copy.source, 'config', 'core.autocrlf'), 'false')
  assert.equal(git(copy.source, 'config', 'core.longpaths'), 'true')
  assert.equal(git(copy.source, 'remote'), '', 'no remote naming the archive file')
  assert.ok(!readFileSync(join(copy.source, '.git', 'config'), 'utf8').includes(scratch))
  assert.ok(!refs(copy.source).includes(WORKTREE_REF) && !refs(copy.source).includes(DATA_REF))

  const { 'acryl-settings.yaml': relocated, ...data } = tree(copy.data)
  assert.deepEqual(data, {
    'settings.yaml': 'theme: dark\n',
    'storages/workspace.json': `${JSON.stringify({ projects: [{ path: copy.source, name: 'Blank' }] })}\n`,
  })
  assert.deepEqual(parse(relocated ?? ''), {
    workspace: { projects: [copy.source] },
    theme: 'dark',
  })
  // The archive itself names no folder of this computer.
  const probe = join(scratch, 'probe.git')
  git(scratch, 'init', '-q', '--bare', probe)
  git(probe, 'fetch', '-q', file, `${DATA_REF}:${DATA_REF}`)
  assert.equal(git(probe, 'grep', '-c', '{{acrylblends:source}}', DATA_REF).split('\n').length, 2)
  assert.throws(
    () => git(probe, 'grep', '-l', home, DATA_REF),
    'no path of the exporting computer in the archive',
  )
})

test('an export without data carries the source only; an app with nothing unsaved has no snapshot', () => {
  const home = join(scratch, 'plain home')
  const { storage, app, folders } = product(home)
  git(folders.source, 'add', '-A')
  git(folders.source, 'commit', '-q', '-m', 'saved')
  const file = join(scratch, 'plain.acrylblend')
  storage.export(app.id, file, { data: false })
  const heads = git(scratch, 'bundle', 'list-heads', file)
  assert.ok(!heads.includes(WORKTREE_REF), heads)
  assert.ok(!heads.includes(DATA_REF), heads)

  const copy = storage.import(file)
  const folders2 = appFolders(acrylRoot(process.platform, { HOME: home }, home), copy.id)
  assert.equal(git(folders2.source, 'status', '--porcelain'), '')
  assert.deepEqual(tree(folders2.data), {}, 'no data')
})

test('a file that is not an archive makes no app and leaves no folder', () => {
  const home = join(scratch, 'bad home')
  const { storage } = product(home)
  const file = join(scratch, 'notes.acrylblend')
  writeFileSync(file, 'not a bundle')
  const before = storage.apps()
  assert.throws(() => storage.import(file), /is not an \.acrylblend archive/)
  assert.deepEqual(storage.apps(), before)
  const root = acrylRoot(process.platform, { HOME: home }, home)
  assert.deepEqual(
    readdirSync(join(root, 'apps')),
    before.map((app) => app.id),
  )
})

test('start over: a fresh app of the same name, the old one in trash with a note of its name, nothing deleted', async () => {
  const home = join(scratch, 'reset home')
  const { storage, app, folders } = product(home)
  storage.rename(app.id, 'Shop')
  const root = acrylRoot(process.platform, { HOME: home }, home)
  const size = await storage.size(app.id)
  assert.ok(size.files > 5 && size.bytes > 0, JSON.stringify(size))

  const fresh = storage.reset(app.id, (source) => {
    write(join(source, 'fresh.txt'), 'new\n')
  })
  assert.equal(fresh.name, 'Shop')
  assert.equal(fresh.named, true)
  assert.deepEqual(
    storage.apps().map((entry) => entry.id),
    [fresh.id],
  )
  assert.ok(!existsSync(folders.source), 'the old folder left apps/')
  const [trashed] = readdirSync(join(root, 'trash'))
  assert.ok(trashed?.startsWith(`${app.id}-`), trashed)
  const kept = join(root, 'trash', trashed ?? '')
  assert.equal(
    readFileSync(join(kept, 'source', 'src', 'app.ts'), 'utf8'),
    'export const v = 3 // not saved\n',
  )
  assert.equal(JSON.parse(readFileSync(join(kept, 'trashed.json'), 'utf8')).name, 'Shop')
  assert.deepEqual(tree(appFolders(root, fresh.id).source), { 'fresh.txt': 'new\n' })
  assert.equal(storage.last()?.id, fresh.id)
})

test('show in the file manager: the app folder goes to the OS port; a product without one says so', () => {
  const home = join(scratch, 'reveal')
  const shown: string[] = []
  const storage = openProductStorage({
    writtenBy: '1.0.0',
    env: { HOME: home },
    home,
    reveal: (path) => shown.push(path),
  })
  const app = storage.create('Blank', () => {})
  storage.reveal(app.id)
  assert.deepEqual(shown, [join(acrylRoot(process.platform, { HOME: home }, home), 'apps', app.id)])
  const without = openProductStorage({
    writtenBy: '1.0.0',
    env: { HOME: home },
    home,
  })
  assert.throws(() => without.reveal(app.id), /cannot show a folder/)
})
