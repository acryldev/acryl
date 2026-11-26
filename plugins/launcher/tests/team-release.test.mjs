// Share with team (spec 052 T061) against fake git, npm and GitHub: what is pushed, in what order, which version is released, and how the run is followed.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { followRelease, nextReleaseVersion, RELEASE_WORKFLOW_FILE, repositoryOf, tagNames, teamRelease } from '../team-release.js'

function scratch(run) {
  const root = mkdtempSync(join(tmpdir(), 'acryl-team-'))
  return Promise.resolve(run(root)).finally(() => rmSync(root, { recursive: true, force: true }))
}

/** A git that answers like the app's, records every call, and has `remoteTags` on GitHub. */
function fakeGit({ remote = 'https://github.com/ana/notes.git', remoteTags = '', dirty = '' } = {}) {
  const calls = []
  const git = (args) => {
    calls.push(args.filter(arg => !arg.startsWith('credential.') && arg !== '-c').join(' '))
    const command = args.find(arg => !arg.startsWith('-') && !arg.includes('='))
    if (command === 'remote') return { status: 0, stdout: `${remote}\n`, stderr: '' }
    if (command === 'status') { const out = dirty; dirty = ''; return { status: 0, stdout: out, stderr: '' } }
    if (command === 'ls-remote') return { status: 0, stdout: remoteTags, stderr: '' }
    if (command === 'rev-parse') return { status: 0, stdout: 'abc123\n', stderr: '' }
    return { status: 0, stdout: '', stderr: '' }
  }
  return { git, calls }
}

/** GitHub answering from a script of states, one per poll. */
function fakeApi(states, release = 'https://github.com/ana/notes/releases/tag/v1.0.1') {
  let poll = 0
  return async (path) => {
    if (path.startsWith('/actions/runs?')) {
      const state = states[Math.min(poll++, states.length - 1)]
      return { workflow_runs: state === undefined ? [] : [{ id: 7, name: 'Release', html_url: 'https://github.com/ana/notes/actions/runs/7', ...state }] }
    }
    if (path.startsWith('/actions/runs/7/jobs')) return { jobs: [{ status: 'completed' }, { status: 'in_progress' }, { status: 'queued' }] }
    if (path.startsWith('/releases/tags/')) return { html_url: release }
    return undefined
  }
}

const clock = () => { let at = 0; return { now: () => at, wait: async (ms) => { at += ms } } }

test('the version and the repository: the next free patch, tags from ls-remote, owner/repo from https or ssh', () => {
  assert.equal(nextReleaseVersion('1.0.0', new Set()), '1.0.0')
  assert.equal(nextReleaseVersion('1.0.0', new Set(['v1.0.0', 'v1.0.1'])), '1.0.2')
  assert.equal(nextReleaseVersion('not a version', new Set()), '0.1.0')
  assert.deepEqual([...tagNames('a1\trefs/tags/v1.0.0\na2\trefs/tags/v1.0.0^{}\nv0.9.0\n')], ['v1.0.0', 'v0.9.0'])
  assert.equal(repositoryOf('https://github.com/ana/notes.git'), 'ana/notes')
  assert.equal(repositoryOf('git@github.com:ana/notes.git'), 'ana/notes')
  assert.equal(repositoryOf('/home/ana/notes.git'), undefined)
})

test('adds the workflow, saves the changes, releases the next free version, pushes the app before its tag, and follows the run to the release page', () => scratch(async folder => {
  writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ name: 'notes', version: '1.0.0' }, null, 2)}\n`)
  const { git, calls } = fakeGit({ remoteTags: 'x\trefs/tags/v1.0.0\n', dirty: ' M src/app.ts\n' })
  const npm = []
  const npmExec = (args) => { npm.push(args.join(' ')); mkdirSync(join(folder, '.github', 'workflows'), { recursive: true }); writeFileSync(join(folder, RELEASE_WORKFLOW_FILE), 'name: Release\n'); return { status: 0, stdout: '', stderr: '' } }
  const lines = []
  const { now, wait } = clock()
  const result = await teamRelease({ folder, git, npmExec, api: fakeApi([undefined, { status: 'in_progress' }, { status: 'completed', conclusion: 'success' }]), say: line => lines.push(line), wait, now })
  assert.deepEqual(result, { ok: true, url: 'https://github.com/ana/notes/releases/tag/v1.0.1' })
  assert.deepEqual(npm, ['exec --yes @acryldev/blends@latest -- release-workflow'])
  assert.equal(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version, '1.0.1', 'v1.0.0 was released already')
  const order = calls.filter(call => /^(add|commit|tag v|push)/u.test(call.replace(/^user\.\S+ /gu, '')))
  assert.deepEqual(order.map(call => call.replace(/user\.\S+ /gu, '')), [
    'add -A', 'commit -q -m Changes before sharing with team', 'add package.json', 'commit -q -m Version 1.0.1', 'tag v1.0.1', 'push --quiet origin HEAD', 'push --quiet origin refs/tags/v1.0.1',
  ])
  assert.ok(lines.includes('step: GitHub is building the installers: 1 of 5 steps done'))
}))

test('an app not on GitHub is refused before anything is changed or pushed', () => scratch(async folder => {
  writeFileSync(join(folder, 'package.json'), '{"version":"1.0.0"}\n')
  const { git, calls } = fakeGit({ remote: '/somewhere/notes.git' })
  const result = await teamRelease({ folder, git, npmExec: () => { throw new Error('not reached') }, api: fakeApi([]), say: () => {}, wait: async () => {} })
  assert.equal(result.ok, false)
  assert.match(result.reason, /not on GitHub yet: Save to GitHub first/u)
  assert.deepEqual(calls, ['remote get-url origin'])
  assert.equal(existsSync(join(folder, RELEASE_WORKFLOW_FILE)), false)
}))

test('a failed run, a run that never starts and one that never ends each say why, with the run\'s page when there is one', async () => {
  const failed = await followRelease({ api: fakeApi([{ status: 'completed', conclusion: 'failure' }]), tag: 'v1.0.0', sha: 's', say: () => {}, ...clock() })
  assert.deepEqual(failed, { ok: false, reason: 'the Release run ended failure: its log says why', url: 'https://github.com/ana/notes/actions/runs/7' })
  const never = await followRelease({ api: fakeApi([undefined]), tag: 'v1.0.0', sha: 's', say: () => {}, ...clock() })
  assert.match(never.reason, /started no Release run/u)
  const endless = await followRelease({ api: fakeApi([{ status: 'in_progress' }]), tag: 'v1.0.0', sha: 's', say: () => {}, ...clock() })
  assert.match(endless.reason, /longer than 100 minutes/u)
})
