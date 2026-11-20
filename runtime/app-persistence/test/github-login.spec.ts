import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { adoptGithubToken, clearGithub, githubClientId, githubEnv, githubHome, pollGithubSignIn, readGithub, saveGithub, startGithubSignIn } from '../src/index.js'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'acryl-gh-')); dirs.push(dir); return dir }
const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })
const TOKEN = 'gho_abcdefghijklmnopqrstuvwxyz0123456789'

describe('the one GitHub sign-in', () => {
  it('device flow: a code for the person, then the token saved owner-only and handed to apps as GH_TOKEN', async () => {
    const home = temp()
    const sent: Array<[string, string]> = []
    const start = await startGithubSignIn('Ov23abcdefgh', async (url, init) => { sent.push([url, String(init?.body)]); return reply({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 }) })
    expect(start.userCode).toBe('ABCD-1234')
    expect(sent[0]?.[1]).toMatch(/scope=repo/u)
    expect(await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'authorization_pending' }))).toEqual({ state: 'pending' })
    expect(readGithub(home)).toBeUndefined()
    const done = await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async url => url.includes('api.github.com') ? reply({ login: 'ana' }) : reply({ access_token: TOKEN }))
    expect(done).toEqual({ state: 'connected', login: 'ana' })
    expect(readGithub(home)).toEqual({ token: TOKEN, login: 'ana' })
    if (process.platform !== 'win32') expect(statSync(join(home, 'github.json')).mode & 0o777).toBe(0o600)
    expect(githubEnv(home, {})).toEqual({ GH_TOKEN: TOKEN })
    expect(githubEnv(home, { GH_TOKEN: 'mine' })).toEqual({})
    expect(clearGithub(home)).toBe(true)
    expect(githubEnv(home, {})).toEqual({})
  })

  it('a declined or expired sign-in says what happened and saves nothing', async () => {
    const home = temp()
    expect((await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'access_denied' }))).state).toBe('failed')
    expect(await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'expired_token' }))).toMatchObject({ reason: expect.stringMatching(/expired/u) })
    expect(await pollGithubSignIn(home, 'Ov23abcdefgh', 'dc', async () => reply({ error: 'slow_down', interval: 10 }))).toEqual({ state: 'pending', interval: 10 })
    expect(readGithub(home)).toBeUndefined()
  })

  it('the client id comes from the build or ACRYL_GITHUB_CLIENT_ID, and a malformed one is none', () => {
    expect(githubClientId({ ACRYL_GITHUB_CLIENT_ID: 'Ov23liAbCdEf123' })).toBe('Ov23liAbCdEf123')
    expect(githubClientId({ ACRYL_GITHUB_CLIENT_ID: 'x y' })).toBeUndefined()
    expect(githubClientId({})).toBe('Ov23liKcmkBPwvX3MCBh')
  })

  it('the home is the one Control Center uses: ~/.acryl of the person, moved by ACRYL_LAUNCHER_HOME', () => {
    expect(githubHome({ ACRYL_LAUNCHER_HOME: '/x/y', HOME: '/h', USERPROFILE: 'C:\\u' })).toBe('/x/y')
    expect(githubHome({ HOME: '/h', USERPROFILE: 'C:\\u' })).toBe(join(process.platform === 'win32' ? 'C:\\u' : '/h', '.acryl'))
  })

  it('a process adopts the stored token for the gh and git it starts, and never overrides a login it already has', () => {
    const home = temp()
    saveGithub(home, TOKEN, 'ana')
    const env: Record<string, string | undefined> = {}
    expect(adoptGithubToken(env, home)).toBe('ana')
    expect(env['GH_TOKEN']).toBe(TOKEN)
    const own: Record<string, string | undefined> = { GITHUB_TOKEN: 'mine' }
    expect(adoptGithubToken(own, home)).toBeUndefined()
    expect(own['GH_TOKEN']).toBeUndefined()
    expect(adoptGithubToken({}, temp())).toBeUndefined()
  })
})
