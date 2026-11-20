import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { clearGithub, githubClientId, githubEnv, pollGithubSignIn, readGithub, startGithubSignIn } from '../github-login.js'

const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })
const TOKEN = 'gho_abcdefghijklmnopqrstuvwxyz0123456789'

test('device sign-in: a code for the person, then the token saved owner-only and handed to apps as GH_TOKEN', async () => {
  const home = mkdtempSync(join(tmpdir(), 'acryl-gh-'))
  try {
    const sent = []
    const start = await startGithubSignIn('Ov23abcdefgh', async (url, init) => { sent.push([url, init.body]); return reply({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 }) })
    assert.equal(start.userCode, 'ABCD-1234')
    assert.match(sent[0][1], /scope=repo/u)
    const pending = await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'authorization_pending' }))
    assert.deepEqual(pending, { state: 'pending' })
    assert.equal(readGithub(home), undefined)
    const done = await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async url => url.includes('api.github.com') ? reply({ login: 'ana' }) : reply({ access_token: TOKEN }))
    assert.deepEqual(done, { state: 'connected', login: 'ana' })
    assert.deepEqual(readGithub(home), { token: TOKEN, login: 'ana' })
    if (process.platform !== 'win32') assert.equal(statSync(join(home, 'github.json')).mode & 0o777, 0o600)
    assert.deepEqual(githubEnv(home, {}), { GH_TOKEN: TOKEN })
    // A person's own token is never overridden.
    assert.deepEqual(githubEnv(home, { GH_TOKEN: 'mine' }), {})
    assert.equal(clearGithub(home), true)
    assert.deepEqual(githubEnv(home, {}), {})
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('a declined or expired sign-in says what happened and saves nothing', async () => {
  const home = mkdtempSync(join(tmpdir(), 'acryl-gh-'))
  try {
    assert.equal((await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'access_denied' }))).state, 'failed')
    assert.match((await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'expired_token' }))).reason, /expired/u)
    assert.equal(readGithub(home), undefined)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('the client id comes from the build or ACRYL_GITHUB_CLIENT_ID, and a malformed one is no client id', () => {
  assert.equal(githubClientId({ ACRYL_GITHUB_CLIENT_ID: 'Ov23liAbCdEf123' }), 'Ov23liAbCdEf123')
  assert.equal(githubClientId({ ACRYL_GITHUB_CLIENT_ID: 'x y' }), undefined)
})

test('setBlendVisibility changes only metadata.visibility, or adds it', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs')
  const { setBlendVisibility } = await import('../apps-registry.js')
  const dir = mkdtempSync(join(tmpdir(), 'acryl-vis-'))
  try {
    const file = join(dir, 'blend.yaml')
    writeFileSync(file, 'apiVersion: x\nmetadata:\n  id: acrylblends.agent\n  visibility: private\nspec:\n  visibility: keep\n')
    setBlendVisibility(dir, 'public')
    assert.equal(readFileSync(file, 'utf8'), 'apiVersion: x\nmetadata:\n  id: acrylblends.agent\n  visibility: public\nspec:\n  visibility: keep\n')
    writeFileSync(file, 'metadata:\n  id: a\nspec: {}\n')
    setBlendVisibility(dir, 'private')
    assert.equal(readFileSync(file, 'utf8'), 'metadata:\n  visibility: private\n  id: a\nspec: {}\n')
    assert.throws(() => setBlendVisibility(dir, 'everyone'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
