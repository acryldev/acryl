// The rules of the workshop registry, run on real folders: the pull request rules (check-pr.mjs, plain Node) and the entry checks (registry-index.ts --only, which needs bun and
// blends-core: set BLENDS_CORE to its src folder, or those tests are skipped and say so).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const scratch = mkdtempSync(join(tmpdir(), 'workshop-registry-test-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

const check = (login, changes, pr) => {
  const list = join(scratch, `changed-${Math.random().toString(36).slice(2)}.tsv`)
  writeFileSync(list, changes.map((row) => row.join('\t')).join('\n'))
  return spawnSync(
    process.execPath,
    [join(repo, 'scripts', 'check-pr.mjs'), '--login', login, '--changed', list, '--pr', pr],
    { encoding: 'utf8' },
  )
}

/** A pull request tree with an entry for `login`: a small, valid app for acrylblends. */
function entryTree(id) {
  const pr = mkdtempSync(join(scratch, 'pr-'))
  const dir = join(pr, 'blends', id)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'blend.yaml'),
    `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: ${id}\n  name: "Hello"\n  version: 0.1.0\n  category: workshop\n  description: "A hello app."\n  license: MIT\n  visibility: public\nspec:\n  runtime: cordis\n  rows:\n    - id: router\n      name: acryl-router\n`,
  )
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'hello', scripts: { test: 'node --test' } }),
  )
  writeFileSync(
    join(dir, 'acryl.template.json'),
    JSON.stringify({ name: 'Hello', description: 'A hello app.', plugins: [] }),
  )
  writeFileSync(join(dir, 'src', 'app.ts'), 'export const hello = 1\n')
  return { pr, dir }
}

describe('what a pull request may change', () => {
  test('an entry named after its author, added or removed, passes; the folder is the id', () => {
    const { pr } = entryTree('alice.hello')
    const added = check(
      'Alice',
      [
        ['added', 'blends/alice.hello/blend.yaml'],
        ['added', 'blends/alice.hello/src/app.ts'],
      ],
      pr,
    )
    assert.equal(added.status, 0, added.stdout)
    assert.equal(added.stdout.trim(), 'alice.hello')
    const removed = check(
      'alice',
      [
        ['removed', 'blends/alice.hello/blend.yaml'],
        ['removed', 'blends/alice.hello/src/app.ts'],
      ],
      mkdtempSync(join(scratch, 'empty-')),
    )
    assert.equal(removed.status, 0, removed.stdout)
  })

  test("another login's folder, a file outside blends/, the index, a workflow and a script are refused", () => {
    const { pr } = entryTree('alice.hello')
    for (const [login, path, why] of [
      ['mallory', 'blends/alice.hello/src/app.ts', 'belongs to "alice"'],
      ['alice', 'index.json', 'outside it'],
      ['alice', '.github/workflows/entry.yml', 'outside it'],
      ['alice', 'scripts/check-pr.mjs', 'outside it'],
      ['alice', 'blends/bob.thing/blend.yaml', 'belongs to "bob"'],
      ['alice', 'blends/alice.hello/../../index.json', 'leaves its folder'],
    ]) {
      const result = check(login, [['modified', path]], pr)
      assert.equal(result.status, 1, `${login} ${path}`)
      assert.match(result.stdout, new RegExp(why), `${login} ${path}: ${result.stdout}`)
    }
  })

  test('two entries in one pull request, and a file moved in from another folder, are refused', () => {
    const { pr } = entryTree('alice.hello')
    const two = check(
      'alice',
      [
        ['added', 'blends/alice.one/a'],
        ['added', 'blends/alice.two/a'],
      ],
      pr,
    )
    assert.equal(two.status, 1)
    assert.match(two.stdout, /one entry per pull request/)
    const moved = check('alice', [['renamed', 'blends/alice.hello/a', 'blends/bob.thing/a']], pr)
    assert.equal(moved.status, 1)
    assert.match(moved.stdout, /may not move between folders/)
  })

  test('a symbolic link in the entry is refused before anything reads the folder', () => {
    const { pr, dir } = entryTree('alice.hello')
    symlinkSync('/etc/passwd', join(dir, 'src', 'notes.txt'))
    const result = check('alice', [['added', 'blends/alice.hello/src/notes.txt']], pr)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /notes\.txt: a link; links are not allowed/)
  })
})

const core = process.env.BLENDS_CORE
const bun = spawnSync('bun', ['--version'], { encoding: 'utf8' }).status === 0
const skip =
  core && bun && existsSync(join(core, 'registry.ts'))
    ? false
    : 'set BLENDS_CORE to blends-core/src and have bun on the PATH'

describe('is the entry a sound starter', { skip }, () => {
  const only = (id, dir) => {
    const root = mkdtempSync(join(scratch, 'registry-'))
    mkdirSync(join(root, 'blends'), { recursive: true })
    cpSync(dir, join(root, 'blends', id), { recursive: true, verbatimSymlinks: true })
    return spawnSync('bun', [join(repo, 'scripts', 'registry-index.ts'), root, '--only', id], {
      encoding: 'utf8',
      env: { ...process.env, BLENDS_CORE: core },
    })
  }

  test('an entry that would not work on every OS is refused with the reason', () => {
    const { dir } = entryTree('alice.hello')
    writeFileSync(join(dir, 'src', 'crlf.ts'), 'export {}\r\n')
    writeFileSync(join(dir, 'src', 'nul.ts'), 'export {}\n')
    const result = only('alice.hello', dir)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /src\/crlf\.ts: it has a carriage return/u)
    assert.match(result.stdout, /src\/nul\.ts: "nul\.ts" is a device name reserved by Windows/u)
  })

  test('a small, public, licensed app passes', () => {
    const { dir } = entryTree('alice.hello')
    const result = only('alice.hello', dir)
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })

  test('an install script, a key, an oversized file, a private entry and a missing marker are each refused with the reason', () => {
    const cases = [
      [
        'alice.script',
        (dir) =>
          writeFileSync(
            join(dir, 'package.json'),
            JSON.stringify({ name: 'x', scripts: { postinstall: 'node steal.js' } }),
          ),
        /install script "postinstall"/,
      ],
      [
        'alice.key',
        (dir) =>
          writeFileSync(join(dir, 'src', 'k.ts'), `export const k = 'sk-${'a'.repeat(40)}'\n`),
        /looks like it holds an API key/,
      ],
      [
        'alice.big',
        (dir) => writeFileSync(join(dir, 'src', 'big.bin'), Buffer.alloc(2 * 1024 * 1024)),
        /a file may be at most 1024 KB/,
      ],
      [
        'alice.private',
        (dir) =>
          writeFileSync(
            join(dir, 'blend.yaml'),
            readFileSync(join(dir, 'blend.yaml'), 'utf8').replace(
              'visibility: public',
              'visibility: private',
            ),
          ),
        /private/,
      ],
      ['alice.nomark', (dir) => rmSync(join(dir, 'acryl.template.json')), null],
    ]
    for (const [id, change, reason] of cases) {
      const { dir } = entryTree(id)
      change(dir)
      const result = only(id, dir)
      if (reason === null) {
        // Without the marker an entry is an ACRYL starter: it passes the format check, and the workshop registry lists apps for acrylblends only.
        assert.equal(result.status, 0, `${id}: ${result.stdout}`)
      } else {
        assert.equal(result.status, 1, `${id}: ${result.stdout}`)
        assert.match(result.stdout, reason, id)
      }
    }
  })
})

test('a whole app in the wrong folder is one line, not one per file', () => {
  const { pr } = entryTree('alice.hello')
  const rows = Array.from({ length: 300 }, (_, n) => ['added', `blends/bob.hello/src/file-${n}.ts`])
  const result = check('alice', rows, pr)
  assert.equal(result.status, 1)
  assert.equal(result.stdout.trim().split('\n').length, 1, result.stdout)
  assert.match(result.stdout, /blends\/bob\.hello\/: the folder belongs to "bob"/)
})

describe('make-entry', () => {
  /** A whole app in a folder of its own, as `npm create acrylblends` leaves it. */
  function appFolder() {
    const app = mkdtempSync(join(scratch, 'app-'))
    const { dir } = entryTree('alice.hello')
    cpSync(dir, app, { recursive: true })
    rmSync(join(app, 'acryl.template.json'))
    writeFileSync(
      join(app, 'blend.yaml'),
      'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acrylblends.hello\n  name: Hello App\n  version: 0.1.0\n  visibility: private\nspec:\n  runtime: cordis\n  rows:\n    - id: router\n      name: acryl-router\n',
    )
    mkdirSync(join(app, 'node_modules', 'x'), { recursive: true })
    return app
  }
  const make = (args) =>
    spawnSync(process.execPath, [join(repo, 'scripts', 'make-entry.mjs'), ...args], {
      encoding: 'utf8',
    })

  test('--out puts the entry in that registry, --category names it, and nothing lands in this one', () => {
    const out = mkdtempSync(join(scratch, 'out-'))
    const result = make([
      appFolder(),
      'acrylblends.hello',
      '--description',
      'Says hello.',
      '--category',
      'system',
      '--out',
      out,
    ])
    assert.equal(result.status, 0, result.stderr)
    const entry = join(out, 'blends', 'acrylblends.hello')
    const manifest = readFileSync(join(entry, 'blend.yaml'), 'utf8')
    assert.match(manifest, /id: acrylblends\.hello/)
    assert.match(manifest, /name: "Hello App"/)
    assert.match(manifest, /category: system/)
    assert.match(manifest, /visibility: public/)
    assert.deepEqual(JSON.parse(readFileSync(join(entry, 'acryl.template.json'), 'utf8')), {
      name: 'Hello App',
      description: 'Says hello.',
      plugins: [],
    })
    assert.equal(existsSync(join(entry, 'node_modules')), false)
    assert.equal(existsSync(join(repo, 'blends', 'acrylblends.hello')), false)
  })

  test('an entry carries the .gitattributes that keeps its line endings LF, and keeps its own', () => {
    const out = mkdtempSync(join(scratch, 'out-'))
    assert.equal(make([appFolder(), 'acrylblends.hello', '--out', out]).status, 0)
    assert.match(
      readFileSync(join(out, 'blends', 'acrylblends.hello', '.gitattributes'), 'utf8'),
      /^\* text=auto eol=lf$/mu,
    )
    const own = appFolder()
    writeFileSync(join(own, '.gitattributes'), '* text=auto eol=lf\n*.png binary\n')
    assert.equal(make([own, 'acrylblends.own', '--out', out]).status, 0)
    assert.equal(
      readFileSync(join(out, 'blends', 'acrylblends.own', '.gitattributes'), 'utf8'),
      '* text=auto eol=lf\n*.png binary\n',
    )
  })

  test('refuses an app that would not work on every OS, says why, and leaves nothing behind', () => {
    const out = mkdtempSync(join(scratch, 'out-'))
    const app = appFolder()
    writeFileSync(join(app, 'src', 'crlf.ts'), 'export {}\r\n')
    writeFileSync(join(app, 'src', 'aux.ts'), 'export {}\n')
    const made = make([app, 'acrylblends.hello', '--out', out])
    assert.equal(made.status, 1)
    assert.match(made.stderr, /src\/crlf\.ts: it has a carriage return/u)
    assert.match(made.stderr, /src\/aux\.ts: "aux\.ts" is a device name reserved by Windows/u)
    assert.match(made.stderr, /git add --renormalize/u)
    assert.equal(existsSync(join(out, 'blends', 'acrylblends.hello')), false)
  })

  test('refuses an entry that exists, and a bad id', () => {
    const out = mkdtempSync(join(scratch, 'out-'))
    const app = appFolder()
    assert.equal(make([app, 'acrylblends.hello', '--out', out]).status, 0)
    assert.equal(make([app, 'acrylblends.hello', '--out', out]).status, 1)
    assert.equal(make([app, 'Not An Id', '--out', out]).status, 2)
  })

  // The lock is written by the template's own capture (plugins/manifest/snapshot.ts), so these tests also hold make-entry's digests to blends-core's.
  const fork = () => {
    const registry = mkdtempSync(join(scratch, 'fork-'))
    mkdirSync(join(registry, 'scripts'))
    cpSync(join(repo, 'scripts', 'make-entry.mjs'), join(registry, 'scripts', 'make-entry.mjs'))
    cpSync(
      join(repo, 'scripts', 'plugin-portability.mjs'),
      join(registry, 'scripts', 'plugin-portability.mjs'),
    )
    return registry
  }
  const capturedApp = async () => {
    const app = mkdtempSync(join(scratch, 'app-'))
    writeFileSync(join(app, 'package.json'), '{ "name": "board" }\n')
    writeFileSync(
      join(app, 'blend.yaml'),
      'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acrylblends.board\n  name: board\n  version: 0.3.0\nspec:\n  runtime: cordis\n  rows:\n    - id: extensions\n      name: extensions\n',
    )
    mkdirSync(join(app, 'plugins', 'notes2', 'lib'), { recursive: true })
    writeFileSync(
      join(app, 'plugins', 'notes2', 'index.ts'),
      "export const name = 'notes2'\nexport function apply() {}\n",
    )
    writeFileSync(join(app, 'plugins', 'notes2', 'lib', 'store.ts'), 'export const notes = []\n')
    const { captureApp } = await import(join(repo, '..', 'plugins', 'manifest', 'snapshot.ts'))
    captureApp(app)
    return app
  }
  const makeIn = (registry, app, id) =>
    spawnSync(process.execPath, [join(registry, 'scripts', 'make-entry.mjs'), app, id], {
      encoding: 'utf8',
    })

  test("keeps the app's lock true to the entry: the origin takes the new id, version and blend.yaml digest", async () => {
    const registry = fork()
    const app = await capturedApp()
    const before = JSON.parse(readFileSync(join(app, 'blend.lock.json'), 'utf8'))
    const made = makeIn(registry, app, 'octo.board')
    assert.equal(made.status, 0, made.stderr)
    const entry = join(registry, 'blends', 'octo.board')
    const lock = JSON.parse(readFileSync(join(entry, 'blend.lock.json'), 'utf8'))
    assert.deepEqual(lock.origin, {
      ...before.origin,
      id: 'octo.board',
      version: '0.1.0',
      digest: createHash('sha256')
        .update(readFileSync(join(entry, 'blend.yaml')))
        .digest('hex'),
    })
    assert.deepEqual(lock.modules, before.modules)
  })

  test('refuses a snapshot changed since the last capture, in one line, and copies nothing', async () => {
    const registry = fork()
    const app = await capturedApp()
    writeFileSync(
      join(app, 'plugins', 'notes2', 'lib', 'store.ts'),
      'export const notes = ["edited"]\n',
    )
    const plugin = makeIn(registry, app, 'octo.board')
    assert.equal(plugin.status, 1)
    assert.equal(
      plugin.stderr.trim(),
      'plugins/notes2 changed since the last capture; run npm run snapshot capture (or Save point in the frame) and try again',
    )
    assert.equal(existsSync(join(registry, 'blends')), false)
    const { captureApp } = await import(join(repo, '..', 'plugins', 'manifest', 'snapshot.ts'))
    captureApp(app)
    writeFileSync(
      join(app, 'blend.yaml'),
      `${readFileSync(join(app, 'blend.yaml'), 'utf8')}# edited\n`,
    )
    assert.match(
      makeIn(registry, app, 'octo.board').stderr,
      /^blend\.yaml changed since the last capture/,
    )
    captureApp(app)
    assert.equal(makeIn(registry, app, 'octo.board').status, 0)
  })
})

// make-entry runs with no install, so it carries a copy of the rules. The rules themselves are blends-core's: this holds the copy to them, case by case.
const policy = await import('@webboxes/blends-core').catch(() => ({}))
const copy = await import('../scripts/plugin-portability.mjs')
describe('plugin-portability.mjs is the same policy as blends-core', () => {
  const skip =
    typeof policy.portabilityIssues === 'function' ? false : 'needs @webboxes/blends-core 0.5.0'
  const file = (path, text = 'x\n') => ({ path, bytes: Buffer.from(text), kind: 'file' })
  const cases = {
    'an ordinary plugin': [file('package.json'), file('src/index.js'), file('.gitattributes')],
    'reserved names': [
      'con',
      'CON',
      'nul.txt',
      'com1',
      'LPT9.a.b',
      'aux/a.js',
      'aux/b.js',
      'console.js',
      'com0',
      'com10',
      'my.con',
    ].map((path) => file(path)),
    'trailing dots and spaces': ['name.', 'name ', 'folder./a.js', 'folder /a.js'].map((path) =>
      file(path),
    ),
    'forbidden characters': ['a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\\b', 'a\tb'].map(
      (path) => file(path),
    ),
    'case and Unicode form': [
      'README.md',
      'readme.md',
      'Src/a.js',
      'src/b.js',
      'caf\u00e9.js',
      'cafe\u0301.js',
    ].map((path) => file(path)),
    'path length': [file(`${'a'.repeat(200)}`), file(`${'a'.repeat(201)}`)],
    'a symbolic link': [{ path: 'link.js', bytes: Buffer.from('x\n'), kind: 'symlink' }],
    'carriage returns and binaries': [
      file('crlf.js', 'x\r\n'),
      file('cr.js', 'x\ry'),
      { path: 'logo.png', bytes: Buffer.from([0x89, 0x0d, 0x0a, 0x00]), kind: 'file' },
      {
        path: 'late.bin',
        bytes: Buffer.concat([Buffer.from('\r'), Buffer.alloc(8000, 'x'), Buffer.from([0])]),
        kind: 'file',
      },
    ],
    'what is never the plugin': [
      file('node_modules/con/a.js', 'x\r\n'),
      file('.git/CON'),
      file('acryl-v-1/nul'),
      file('acryl-source.json', '\r'),
    ],
  }
  for (const [name, files] of Object.entries(cases))
    test(name, { skip }, () =>
      assert.deepEqual(copy.portabilityIssues(files), policy.portabilityIssues(files)),
    )
})
