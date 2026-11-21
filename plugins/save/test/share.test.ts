import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { type GitPort, type HostingPort, readAppIdentity } from '../index.ts'
import { planShare, renderSharePlan, type SharePorts, shareApp } from '../share.ts'

const manifest = (visibility: 'private' | 'public') =>
  `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata: { id: acrylblends.shop, name: Corner Shop, version: 1.0.0, visibility: ${visibility} }\nspec: { runtime: cordis }\n`

/** An app folder with a blend.yaml; the ports are fakes, so nothing leaves the test. */
function app(visibility: 'private' | 'public' = 'private'): string {
  const dir = mkdtempSync(join(tmpdir(), 'share-test-'))
  writeFileSync(join(dir, 'blend.yaml'), manifest(visibility))
  return dir
}

interface Fake extends SharePorts {
  readonly calls: string[]
}

function ports(
  state: {
    remote?: string
    remoteVisibility?: 'public' | 'private' | 'unknown'
    account?: string
    pending?: number
    secret?: boolean
    released?: Record<string, 'current' | 'older'>
  } = {},
): Fake {
  const calls: string[] = []
  let remote = state.remote
  let pending = state.pending ?? 0
  const git: GitPort = {
    isRepository: () => true,
    init: () => void calls.push('init'),
    stageAll: () => void calls.push('stage'),
    stagedFiles: () => (pending > 0 ? ['a.ts'] : []),
    stagedText: () => (state.secret ? 'const k = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"' : 'x'),
    unstageAll: () => void calls.push('unstage'),
    hasStagedChanges: () => pending > 0,
    commit: () => {
      calls.push('commit')
      pending = 0
      return 'abc123'
    },
    remoteUrl: () => remote,
    addRemote: (url) => {
      calls.push(`addRemote ${url}`)
      remote = url
    },
    push: () => void calls.push('push'),
  }
  const hosting: HostingPort = {
    visibilityOf: () => state.remoteVisibility ?? 'unknown',
    create: (name, visibility) => {
      calls.push(`create ${name} ${visibility}`)
      return `https://github.com/${name}.git`
    },
  }
  return {
    calls,
    git,
    hosting,
    account: () => state.account,
    pending: () => pending,
    released: (tag) => state.released?.[tag] ?? 'none',
    list: (repository, tag) => {
      calls.push(`list ${repository} ${tag}`)
      return true
    },
  }
}

test('an app with no remote plans a new repository under the signed-in account, named after the app, and sends nothing', () => {
  const dir = app()
  try {
    const fake = ports({ account: 'me', pending: 2 })
    const plan = planShare(dir, {}, fake)
    assert.deepEqual(plan, {
      repository: 'me/corner-shop',
      create: true,
      visibility: 'private',
      changes: 2,
    })
    assert.deepEqual(fake.calls, [])
    assert.equal(
      renderSharePlan(plan as never),
      'Share this app to a new private repository github.com/me/corner-shop: 2 changed files, saved first, and the versions saved so far.',
    )
    assert.deepEqual(planShare(dir, { owner: 'inboxxobni' }, fake), {
      repository: 'inboxxobni/corner-shop',
      create: true,
      visibility: 'private',
      changes: 2,
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the confirmed plan creates the repository, saves what changed and pushes', () => {
  const dir = app()
  try {
    const fake = ports({ account: 'me', pending: 1 })
    const plan = planShare(dir, {}, fake)
    assert.ok(!('ok' in plan))
    assert.deepEqual(shareApp(dir, plan, {}, fake), {
      ok: true,
      remote: 'https://github.com/me/corner-shop.git',
      created: true,
      commit: 'abc123',
    })
    assert.deepEqual(fake.calls, [
      'create me/corner-shop private',
      'addRemote https://github.com/me/corner-shop.git',
      'stage',
      'commit',
      'push',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a share with a visibility plans and creates the repository that way and records it in blend.yaml, comments kept', () => {
  const dir = app('private')
  try {
    writeFileSync(
      join(dir, 'blend.yaml'),
      `# the app\n${readFileSync(join(dir, 'blend.yaml'), 'utf8')}`,
    )
    const fake = ports({ account: 'ana', pending: 1 })
    const plan = planShare(dir, { visibility: 'public' }, fake)
    assert.ok(!('ok' in plan))
    assert.equal(plan.visibility, 'public')
    const result = shareApp(dir, plan, { visibility: 'public' }, fake)
    assert.equal(result.ok, true)
    const text = readFileSync(join(dir, 'blend.yaml'), 'utf8')
    assert.match(text, /^# the app/u)
    assert.equal(readAppIdentity(text).visibility, 'public')
    assert.ok(
      fake.calls.some((call) => call.includes('public')),
      fake.calls.join(' | '),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an app with nothing new to save still pushes its saved versions', () => {
  const dir = app()
  try {
    const fake = ports({ remote: 'https://github.com/me/shop.git', remoteVisibility: 'private' })
    const plan = planShare(dir, {}, fake)
    assert.deepEqual(plan, {
      repository: 'https://github.com/me/shop.git',
      create: false,
      visibility: 'private',
      changes: 0,
    })
    assert.deepEqual(shareApp(dir, plan as never, {}, fake), {
      ok: true,
      remote: 'https://github.com/me/shop.git',
      created: false,
    })
    assert.deepEqual(fake.calls, ['stage', 'push'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refused, with nothing sent: not signed in, a private app on a public remote, a plan the app no longer matches, a secret', () => {
  const dir = app()
  try {
    const signedOut = planShare(dir, {}, ports())
    assert.equal(
      'ok' in signedOut && signedOut.reason.startsWith('you are not signed in to GitHub'),
      true,
    )
    const open = planShare(
      dir,
      {},
      ports({ remote: 'https://github.com/me/shop.git', remoteVisibility: 'public' }),
    )
    assert.equal('ok' in open && open.reason.includes('is public'), true)
    assert.equal('ok' in planShare(dir, { owner: 'not a name' }, ports({ account: 'me' })), true)

    const moved = ports({ account: 'me', pending: 3 })
    const stale = shareApp(
      dir,
      { repository: 'me/corner-shop', create: true, visibility: 'private', changes: 1 },
      {},
      moved,
    )
    assert.equal(
      !stale.ok && stale.reason.startsWith('the app changed since this plan was shown'),
      true,
    )
    assert.deepEqual(moved.calls, [])

    const leaking = ports({
      remote: 'https://github.com/me/shop.git',
      remoteVisibility: 'private',
      pending: 1,
      secret: true,
    })
    const plan = planShare(dir, {}, leaking)
    const leak = shareApp(dir, plan as never, {}, leaking)
    assert.equal(!leak.ok && leak.secrets?.[0]?.kind, 'GitHub token')
    assert.deepEqual(leaking.calls, ['stage', 'unstage'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('npm run share --json prints the plan of a real folder and sends nothing; a bad --confirm is refused', () => {
  const dir = app()
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir })
    execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/me/shop.git'], {
      cwd: dir,
    })
    // The command reads the app it lives in (two folders up), so a copy of it stands in the test app.
    execFileSync('mkdir', ['-p', join(dir, 'plugins', 'save')])
    for (const file of ['share.ts', 'share-cli.ts'])
      execFileSync('cp', [
        new URL(`../${file}`, import.meta.url).pathname,
        join(dir, 'plugins', 'save', file),
      ])
    execFileSync('ln', [
      '-s',
      new URL('../node_modules', import.meta.url).pathname,
      join(dir, 'node_modules'),
    ])
    const run = (args: string[]) =>
      execFileSync(process.execPath, [join(dir, 'plugins', 'save', 'share-cli.ts'), ...args], {
        cwd: dir,
        encoding: 'utf8',
      })
    const plan = JSON.parse(run(['--json'])) as { repository: string; create: boolean }
    assert.equal(plan.repository, 'https://example.invalid/me/shop.git')
    assert.equal(plan.create, false)
    assert.throws(() => run(['--confirm', '{"nope":1}']))
    // The plan handed back base64url-encoded is read as the same plan; this one no longer matches the app (a file changed), so nothing is sent.
    writeFileSync(join(dir, 'note.txt'), 'x')
    const stale = Buffer.from(JSON.stringify({ ...plan, changes: 0 }), 'utf8').toString('base64url')
    assert.throws(
      () => run(['--confirm', stale, '--json']),
      (error: { stdout?: string }) =>
        /the app changed since this plan was shown/u.test(error.stdout ?? ''),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const storeCategories = [
  {
    slug: 'business',
    name: 'Business',
    subs: [
      { slug: 'finance', name: 'Finance' },
      { slug: 'crm', name: 'CRM' },
    ],
  },
  { slug: 'gaming', name: 'Gaming', subs: [{ slug: 'games', name: 'Games' }] },
]

/** A public app made from a starter: its blend.yaml keeps the starter's category word and description, it has no licence yet. */
function madeApp(category = 'finance'): string {
  const dir = mkdtempSync(join(tmpdir(), 'share-list-'))
  writeFileSync(
    join(dir, 'blend.yaml'),
    `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acrylblends.books\n  name: books\n  version: 0.1.0\n  category: ${category}\n  description: Invoices and expenses.\n  visibility: public\nspec:\n  runtime: cordis\n`,
  )
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'books', version: '1.2.0', keywords: ['notes'] }, null, 2)}\n`,
  )
  return dir
}

test('listing in the Blends store: the place comes from the starter, MIT by default, and the share writes what the store reads', () => {
  const dir = madeApp()
  try {
    const fake = ports({ account: 'ana', pending: 1 })
    const options = { list: {}, categories: storeCategories }
    const plan = planShare(dir, options, fake)
    assert.ok(!('ok' in plan))
    assert.deepEqual(plan.listing, {
      id: 'ana.books',
      placement: { category: 'business', subcategory: 'finance' },
      license: 'MIT',
      tag: 'v1.2.0',
    })
    assert.match(
      renderSharePlan(plan),
      /Blends store as ana\.books, Community, under business › finance \(licence MIT, people start from v1\.2\.0\)/u,
    )
    const result = shareApp(dir, plan, options, fake)
    assert.ok(result.ok)
    assert.deepEqual(result.listed, { tag: 'v1.2.0', created: true })
    assert.equal(fake.calls.at(-1), 'list ana/books v1.2.0')
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      keywords: string[]
    }
    assert.deepEqual(pkg.keywords, [
      'notes',
      'acrylblends-blend',
      'acrylblends-category-business',
      'acrylblends-subcategory-finance',
    ])
    assert.equal(readAppIdentity(readFileSync(join(dir, 'blend.yaml'), 'utf8')).license, 'MIT')
    assert.equal(readAppIdentity(readFileSync(join(dir, 'blend.yaml'), 'utf8')).id, 'ana.books')
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'acryl.template.json'), 'utf8')), {
      name: 'books',
      description: 'Invoices and expenses.',
    })
    assert.match(readFileSync(join(dir, 'LICENSE'), 'utf8'), /Copyright \(c\) \d{4} ana/u)
    // A second share keeps the place the first one chose, even when the starter word says otherwise.
    assert.deepEqual((planShare(dir, { list: {} }, fake) as { listing?: unknown }).listing, {
      id: 'ana.books',
      placement: { category: 'business', subcategory: 'finance' },
      license: 'MIT',
      tag: 'v1.2.0',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('listing is refused for a private app, a place not on the list, and an app the starter word cannot place', () => {
  const dir = madeApp('cooking')
  try {
    const fake = ports({ account: 'ana' })
    assert.match(
      String(
        (planShare(dir, { list: {}, visibility: 'private' }, fake) as { reason?: string }).reason,
      ),
      /only a public app/u,
    )
    assert.match(
      String(
        (planShare(dir, { list: {}, categories: storeCategories }, fake) as { reason?: string })
          .reason,
      ),
      /choose its category/u,
    )
    assert.match(
      String(
        (
          planShare(
            dir,
            { list: { category: 'gaming', subcategory: 'crm' }, categories: storeCategories },
            fake,
          ) as { reason?: string }
        ).reason,
      ),
      /crm is not a subcategory of Gaming/u,
    )
    const chosen = planShare(
      dir,
      {
        list: { category: 'gaming', subcategory: 'games', license: 'Apache-2.0' },
        categories: storeCategories,
      },
      fake,
    )
    assert.deepEqual((chosen as { listing?: unknown }).listing, {
      id: 'ana.books',
      placement: { category: 'gaming', subcategory: 'games' },
      license: 'Apache-2.0',
      tag: 'v1.2.0',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('npm run share --help says what it does and sends nothing', () => {
  const out = execFileSync(
    process.execPath,
    [join(import.meta.dirname, '..', 'share-cli.ts'), '--help'],
    { encoding: 'utf8' },
  )
  assert.match(out, /--list +also list it in the Blends store/u)
  assert.match(out, /nothing is sent until you type yes/u)
})

/** The share command signs in with the GitHub connection ACRYL keeps in its home (the one Control Center and every app share), when there is one. */
test("the share command runs gh with the stored GitHub token, and with gh's own login when there is none", () => {
  const dir = app('public')
  const home = mkdtempSync(join(tmpdir(), 'share-home-'))
  const bin = mkdtempSync(join(tmpdir(), 'share-bin-'))
  try {
    // A gh that knows one person only by the token in its environment.
    const gh = join(bin, 'gh')
    writeFileSync(
      gh,
      '#!/bin/sh\nif [ "$1" = "api" ] && [ "$GH_TOKEN" = "gho_abcdefghijklmnopqrstuvwxyz0123456789" ]; then echo ana; exit 0; fi\necho "gh: not logged in" >&2\nexit 1\n',
      { mode: 0o755 },
    )
    // The command reads the app it lives in (two folders up), so a copy of it stands in the test app.
    execFileSync('git', ['init', '--quiet'], { cwd: dir })
    execFileSync('mkdir', ['-p', join(dir, 'plugins', 'save')])
    for (const file of ['share.ts', 'share-cli.ts'])
      execFileSync('cp', [
        new URL(`../${file}`, import.meta.url).pathname,
        join(dir, 'plugins', 'save', file),
      ])
    execFileSync('ln', [
      '-s',
      new URL('../node_modules', import.meta.url).pathname,
      join(dir, 'node_modules'),
    ])
    const run = (extra: Record<string, string>) => {
      try {
        return execFileSync(
          process.execPath,
          [join(dir, 'plugins', 'save', 'share-cli.ts'), '--json'],
          {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
              PATH: `${bin}:${process.env.PATH ?? ''}`,
              HOME: home,
              ACRYL_LAUNCHER_HOME: home,
              ...extra,
            },
          },
        )
      } catch (cause) {
        return `${(cause as { stdout?: string }).stdout ?? ''}${(cause as { stderr?: string }).stderr ?? ''}`
      }
    }
    assert.match(run({}), /not signed in|not logged in|sign/iu)
    writeFileSync(
      join(home, 'github.json'),
      `${JSON.stringify({ token: 'gho_abcdefghijklmnopqrstuvwxyz0123456789', login: 'ana' })}\n`,
    )
    assert.match(run({}), /"repository":"ana\/corner-shop"/u)
    // A token the person's own environment names is never replaced by the stored one.
    assert.match(run({ GH_TOKEN: 'mine' }), /not signed in|not logged in|sign/iu)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
    rmSync(bin, { recursive: true, force: true })
  }
})

test('a second share of a changed app releases the next version, written into package.json and blend.yaml; an unchanged app keeps its release', () => {
  const dir = madeApp()
  try {
    const options = { list: {}, categories: storeCategories }
    const changed = ports({ account: 'ana', pending: 2, released: { 'v1.2.0': 'older', 'v1.2.1': 'older' } })
    const plan = planShare(dir, options, changed)
    assert.ok(!('ok' in plan))
    assert.equal(plan.listing?.tag, 'v1.2.2')
    const result = shareApp(dir, plan, options, changed)
    assert.ok(result.ok)
    assert.deepEqual(result.listed, { tag: 'v1.2.2', created: true })
    assert.equal((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version, '1.2.2')
    assert.equal(readAppIdentity(readFileSync(join(dir, 'blend.yaml'), 'utf8')).version, '1.2.2')
    const same = ports({ account: 'ana', pending: 0, released: { 'v1.2.2': 'current' } })
    assert.equal((planShare(dir, options, same) as { listing?: { tag: string } }).listing?.tag, 'v1.2.2')
    const edited = ports({ account: 'ana', pending: 1, released: { 'v1.2.2': 'current' } })
    assert.equal((planShare(dir, options, edited) as { listing?: { tag: string } }).listing?.tag, 'v1.2.3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
