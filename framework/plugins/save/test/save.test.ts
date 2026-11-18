import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { findSecrets, type GitPort, type HostingPort, saveApp, saveFolder } from '../index.ts'

const PRIVATE =
  'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata: { id: acrylblends.shop, name: shop, version: 1.0.0 }\nspec: { runtime: cordis }\n'
const PUBLIC = PRIVATE.replace('version: 1.0.0', 'version: 1.0.0, visibility: public')

test('finds keys, secret files and assigned secrets, and leaves ordinary text alone', () => {
  const findings = findSecrets([
    { path: 'src/config.ts', text: "const key = 'sk-ant-abcdefghijklmnopqrstuvwxyz'\nconst x = 1" },
    { path: '.env', text: 'A=1' },
    { path: '.env.example', text: 'A=' },
    { path: 'src/db.ts', text: 'password: "correct-horse-battery-staple"' },
    { path: 'README.md', text: 'set your token in settings' },
  ])
  assert.deepEqual(
    findings.map((finding) => `${finding.path}:${finding.line} ${finding.kind}`),
    ['src/config.ts:1 Anthropic API key', '.env:0 a secrets file', 'src/db.ts:1 assigned secret'],
  )
})

const hosting = (visibility: 'public' | 'private' | 'unknown'): HostingPort => ({
  visibilityOf: () => visibility,
  create: () => 'git@github.com:me/created.git',
})

function fakeGit(files: Record<string, string>, remote?: string): GitPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    isRepository: () => true,
    init: () => void calls.push('init'),
    stageAll: () => void calls.push('stage'),
    stagedFiles: () => Object.keys(files),
    stagedText: (path) => files[path],
    unstageAll: () => void calls.push('unstage'),
    hasStagedChanges: () => Object.keys(files).length > 0,
    commit: () => {
      calls.push('commit')
      return 'abc123'
    },
    remoteUrl: () => remote,
    addRemote: () => void calls.push('addRemote'),
    push: () => void calls.push('push'),
  }
}

test('a private app never goes to a public remote; a public one does', () => {
  const remote = 'git@github.com:me/shop.git'
  const refused = saveApp(
    { manifestText: PRIVATE, message: 'm' },
    fakeGit({ 'a.ts': 'x' }, remote),
    hosting('public'),
  )
  assert.equal(refused.status, 'refused')
  const git = fakeGit({ 'a.ts': 'x' }, remote)
  assert.deepEqual(saveApp({ manifestText: PUBLIC, message: 'm' }, git, hosting('public')), {
    status: 'saved',
    commit: 'abc123',
    pushed: true,
    remote,
  })
  assert.deepEqual(git.calls, ['stage', 'commit', 'push'])
})

test('a secret stops the save and everything is unstaged; nothing staged means nothing to save', () => {
  const git = fakeGit({ 'key.ts': 'export const k = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"' })
  const result = saveApp({ manifestText: PRIVATE, message: 'm' }, git, hosting('unknown'))
  assert.equal(result.status === 'refused' && result.secrets?.[0]?.kind, 'GitHub token')
  assert.deepEqual(git.calls, ['stage', 'unstage'])
  assert.equal(
    saveApp({ manifestText: PRIVATE, message: 'm' }, fakeGit({}), hosting('unknown')).status,
    'nothing-to-save',
  )
})

test('saves a real app folder with git, and refuses it once a secret appears', () => {
  const dir = mkdtempSync(join(tmpdir(), 'save-test-'))
  try {
    writeFileSync(join(dir, 'blend.yaml'), PRIVATE)
    writeFileSync(join(dir, 'index.ts'), 'export const x = 1\n')
    execFileSync('git', ['init', '--quiet'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
    const saved = saveFolder(dir, 'first save')
    assert.equal(saved.status, 'saved')
    assert.equal(saveFolder(dir, 'again').status, 'nothing-to-save')
    writeFileSync(join(dir, 'leak.ts'), 'export const key = "AKIAABCDEFGHIJKLMNOP"\n')
    const refused = saveFolder(dir, 'leak')
    assert.equal(refused.status === 'refused' && refused.secrets?.[0]?.kind, 'AWS access key')
    assert.equal(
      execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd: dir,
        encoding: 'utf8',
      }).trim(),
      '',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
