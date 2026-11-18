// The Part 2 product test, after the agent has built the feature (spec 049): the feature survives a restart and a fresh clone, and `git status` shows no secret.
// Every step names itself; returns { ok, steps } and never throws. The caller passes how to probe the feature (`probe(dir)` -> 'ok' | 'FAIL') and how to install
// an app's dependencies (`install(dir)`, the packed framework before a release).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const git = (cwd, ...args) =>
  spawnSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  })

/** Paths that must never be staged: the door's state, data files, environment files, keys. */
const SECRET_PATHS =
  /(^|\/)(\.acryl\/|\.acrylblends\/|data\/|\.env(\.|$)|[^/]*\.sqlite(-[a-z]+)?$|[^/]*\.pem$|id_rsa)/u
/** Text that looks like a key. */
const SECRET_TEXT =
  /(sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u

export async function part2(app, env, { probe, install, secrets = [], clone, door }) {
  const steps = []
  const step = (name, ok, detail = '') => {
    steps.push(`${ok ? 'ok' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`)
    return ok
  }
  try {
    // 1. No secret in git status: stage everything the way `git add -A` would, then look at what is staged.
    git(app, 'add', '-A')
    const staged = git(app, 'diff', '--cached', '--name-only').stdout.split('\n').filter(Boolean)
    const badPath = staged.filter((file) => SECRET_PATHS.test(file))
    step(
      'git add -A stages no secret file (.acryl/, data/, .env, *.sqlite)',
      badPath.length === 0,
      badPath.join(', '),
    )
    const doorFile = join(app, '.acryl', 'door.json')
    const known = [...secrets]
    if (existsSync(doorFile)) {
      try {
        const secret = JSON.parse(readFileSync(doorFile, 'utf8')).secret
        if (typeof secret === 'string' && secret.length > 8) known.push(secret)
      } catch {}
    }
    const leaks = []
    for (const file of staged) {
      if (file.startsWith('docs/')) continue
      const text = git(app, 'show', `:${file}`).stdout
      if (SECRET_TEXT.test(text) || known.some((value) => value !== '' && text.includes(value)))
        leaks.push(file)
    }
    step('no staged file holds a key or a known secret', leaks.length === 0, leaks.join(', '))
    git(app, 'commit', '-qm', 'the feature')
    const dirty = git(app, 'status', '--porcelain').stdout.trim()
    step(
      'everything the feature needs is committed (nothing left untracked or modified)',
      dirty === '',
      dirty.split('\n')[0],
    )

    // 1b. The door: the feature is read off the running page through `.acryl/bin/acryl look` (the agent's way to check its work).
    if (door) {
      const checked = await door(app)
      for (const line of checked.steps)
        steps.push(`${line.startsWith('ok ') || line.startsWith('FAIL ') ? line : `ok ${line}`}`)
    }

    // 2. A restart: the same folder, started again, still serves the feature.
    step(
      'the feature survives a restart (the app is started again from the same folder)',
      (await probe(app)) === 'ok',
    )

    // 3. A fresh clone: only what git has, install, test, type-check, serve the feature.
    const target = clone
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    const cloned = spawnSync('git', ['clone', '-q', app, join(target, 'app')], { encoding: 'utf8' })
    const dir = join(target, 'app')
    if (!step('git clone works', cloned.status === 0, cloned.stderr.trim()))
      return { ok: false, steps }
    step('npm install works in the fresh clone', install(dir) === 0)
    const test = spawnSync('npm', ['test'], { cwd: dir, env, encoding: 'utf8' })
    step(
      'the fresh clone passes npm test',
      test.status === 0,
      test.stdout
        .split('\n')
        .filter((l) => /✖|fail/i.test(l))
        .slice(0, 2)
        .join(' | '),
    )
    const check = spawnSync('npm', ['run', 'check'], { cwd: dir, env, encoding: 'utf8' })
    step(
      'the fresh clone passes npm run check',
      check.status === 0,
      (check.stdout + check.stderr).trim().split('\n').at(-1),
    )
    step('the fresh clone serves the feature', (await probe(dir)) === 'ok')
  } catch (error) {
    step('the lifecycle checks ran', false, error.message)
  }
  return { ok: steps.every((line) => line.startsWith('ok ')), steps }
}
