#!/usr/bin/env node
// Materialize the review fixture as a git repository with a byte-identical state on any machine: fixed file contents and
// modes, a fixed author/committer and dates, and a fixed commit message. The Files, Changes and Review views of the frame
// comparison are captured against this state on both ACRYL and acrylblends.
//
//   node scripts/frame-fixtures/review-fixture/setup.mjs [target]
//
// The default target is <repo>/.frame-fixture/review-fixture. The command prints the commit; the script refuses to finish
// when the resulting commit differs from the recorded one, so an accidental edit to the fixture cannot silently change the
// comparison.
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repository = resolve(here, '..', '..', '..')
const target = resolve(process.argv[2] ?? join(repository, '.frame-fixture', 'review-fixture'))
const EXPECTED_COMMIT = '59c6a00c21af85cbb7dcb19e1c5a05c3a8ceb93e'
const AUTHOR = 'ACRYL Frame Fixture <frame@example.invalid>'
const DATE = '2026-10-30T12:00:00+0000'
const MESSAGE = 'fixture: base'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: target,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ACRYL Frame Fixture',
      GIT_AUTHOR_EMAIL: 'frame@example.invalid',
      GIT_COMMITTER_NAME: 'ACRYL Frame Fixture',
      GIT_COMMITTER_EMAIL: 'frame@example.invalid',
      GIT_AUTHOR_DATE: DATE,
      GIT_COMMITTER_DATE: DATE,
      // Do not let the machine's global git configuration leak into the fixture's state.
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      ...options.env,
    },
  })
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
  return result.stdout.trim()
}

rmSync(target, { recursive: true, force: true })
mkdirSync(join(target, 'src'), { recursive: true })
// The committed state: README.md, src/a.ts and the base tracked.txt. tracked.after.txt and untracked.txt stay out of it.
for (const file of ['README.md', 'src/a.ts', 'tracked.txt']) {
  cpSync(join(here, file), join(target, file))
  chmodSync(join(target, file), 0o644)
}
run('git', ['init', '-q', '-b', 'main'])
run('git', ['config', 'user.name', 'ACRYL Frame Fixture'])
run('git', ['config', 'user.email', 'frame@example.invalid'])
run('git', ['config', 'commit.gpgsign', 'false'])
run('git', ['config', 'core.autocrlf', 'false'])
run('git', ['add', 'README.md', 'src/a.ts', 'tracked.txt'])
run('git', ['commit', '-q', '-m', MESSAGE, '--author', AUTHOR])
// The working tree state the views show: one modified tracked file and one untracked file.
cpSync(join(here, 'tracked.after.txt'), join(target, 'tracked.txt'))
chmodSync(join(target, 'tracked.txt'), 0o644)
cpSync(join(here, 'untracked.txt'), join(target, 'untracked.txt'))
chmodSync(join(target, 'untracked.txt'), 0o644)

const commit = run('git', ['rev-parse', 'HEAD'])
const status = run('git', ['status', '--porcelain'])
if (EXPECTED_COMMIT !== 'PENDING' && commit !== EXPECTED_COMMIT)
  throw new Error(
    `review fixture: the materialized commit is ${commit}, expected ${EXPECTED_COMMIT}; the fixture changed or the git metadata is not deterministic`,
  )
console.log(JSON.stringify({ target, commit, status: status.split('\n').filter(Boolean) }, null, 2))
