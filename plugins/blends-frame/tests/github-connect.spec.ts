import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGithub, saveGithub } from '@acryldev/app-persistence'
import { afterEach, describe, expect, it } from 'vitest'
import { parseGithubConnectState, parseGithubReadiness } from '../src/contract.ts'
import { GITHUB_CONNECT_NO_CLIENT, GithubConnect } from '../src/github-connect.ts'
import { createRegistryApi } from '../src/client/registry-api.ts'

const TOKEN = 'gho_abcdefghijklmnopqrstuvwxyz0123456789'
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'frame-gh-')); dirs.push(dir); return dir }
const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

/** GitHub, as the device flow sees it: a code, `pending` for a few polls, then the token (or a refusal). */
function github(options: { pending?: number; end?: 'approve' | 'deny' | 'expire' | 'offline' } = {}) {
  let polls = 0
  const calls: string[] = []
  const fetch = (async (url: string) => {
    calls.push(url)
    if (options.end === 'offline') throw new Error('getaddrinfo ENOTFOUND github.com')
    if (url.endsWith('/login/device/code')) return reply({ device_code: 'dc', user_code: 'AB12-CD34', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 })
    if (url.includes('api.github.com')) return reply({ login: 'ana' })
    polls += 1
    if (polls <= (options.pending ?? 1)) return reply({ error: 'authorization_pending' })
    if (options.end === 'deny') return reply({ error: 'access_denied' })
    if (options.end === 'expire') return reply({ error: 'expired_token' })
    return reply({ access_token: TOKEN })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls, polls: () => polls }
}

const connectTo = (home: string, env: Record<string, string | undefined>, remote = github(), options = { pollMs: 5 }) =>
  ({ remote, env, connect: new GithubConnect({ home, env, clientId: () => 'Ov23abcdefgh', fetch: remote.fetch }, options) })
const until = async (done: () => boolean): Promise<void> => { for (let i = 0; i < 200 && !done(); i += 1) await new Promise(resolve => setTimeout(resolve, 5)) }

describe('connecting GitHub from the app: the one sign-in', () => {
  it('shows the code and the github.com address GitHub gave, then is connected and the token is in the shared file, owner-only', async () => {
    const home = temp()
    const { connect, env } = connectTo(home, {})
    expect(await connect.start()).toEqual({ status: 'code', code: 'AB12-CD34', url: 'https://github.com/login/device' })
    await until(() => connect.state().status === 'connected')
    expect(connect.state()).toEqual({ status: 'connected' })
    expect(readGithub(home)).toEqual({ token: TOKEN, login: 'ana' })
    if (process.platform !== 'win32') expect(statSync(join(home, 'github.json')).mode & 0o777).toBe(0o600)
    // The gh and git this process starts now use that token.
    expect(env['GH_TOKEN']).toBe(TOKEN)
  })

  it('a connection made in Control Center (or another app) is this one: adopted at start, and never over a token the person set', () => {
    const home = temp()
    saveGithub(home, TOKEN, 'ana')
    const fresh = connectTo(home, {})
    expect(fresh.connect.adopt()).toBe(true)
    expect(fresh.env['GH_TOKEN']).toBe(TOKEN)
    const own = connectTo(home, { GH_TOKEN: 'mine' })
    expect(own.connect.adopt()).toBe(false)
    expect(own.env['GH_TOKEN']).toBe('mine')
    const theirs = connectTo(home, { GITHUB_TOKEN: 'mine' })
    expect(theirs.connect.adopt()).toBe(false)
    expect(theirs.env['GH_TOKEN']).toBeUndefined()
  })

  it('disconnect forgets it for every place: the file goes, and so does this process\'s GH_TOKEN, but not a token of the person\'s own', () => {
    const home = temp()
    saveGithub(home, TOKEN, 'ana')
    const mine = connectTo(home, {})
    mine.connect.adopt()
    expect(mine.connect.disconnect()).toBe(true)
    expect(readGithub(home)).toBeUndefined()
    expect(mine.env['GH_TOKEN']).toBeUndefined()
    saveGithub(home, TOKEN, 'ana')
    const own = connectTo(home, { GH_TOKEN: 'mine' })
    own.connect.disconnect()
    expect(own.env['GH_TOKEN']).toBe('mine')
    expect(own.connect.disconnect()).toBe(false)
  })

  it('says plainly when GitHub refuses or the code runs out, and saves nothing', async () => {
    for (const [end, say] of [['deny', /declined/u], ['expire', /expired/u]] as const) {
      const home = temp()
      const { connect } = connectTo(home, {}, github({ end }))
      await connect.start()
      await until(() => connect.state().status === 'failed')
      expect(connect.state()).toMatchObject({ status: 'failed', say: expect.stringMatching(say) })
      expect(readGithub(home)).toBeUndefined()
    }
    const home = temp()
    const slow = connectTo(home, {}, github({ pending: 1_000 }), { pollMs: 5, giveUpMs: 30 } as never)
    await slow.connect.start()
    await until(() => slow.connect.state().status === 'failed')
    expect(slow.connect.state()).toMatchObject({ status: 'failed', say: 'The code ran out before GitHub was connected. Press Connect GitHub to get a new one.' })
  })

  it('answers plainly when GitHub cannot be reached, and when there is no client id', async () => {
    const offline = connectTo(temp(), {}, github({ end: 'offline' }))
    expect(await offline.connect.start()).toMatchObject({ status: 'failed', say: 'GitHub could not be reached. Check your internet connection and try again.' })
    const none = new GithubConnect({ home: temp(), env: {}, clientId: () => undefined })
    expect(await none.start()).toEqual({ status: 'failed', say: GITHUB_CONNECT_NO_CLIENT })
  })

  it('runs one sign-in at a time, and ends a waiting one when the frame unloads', async () => {
    const { connect, remote } = connectTo(temp(), {}, github({ pending: 1_000 }))
    const first = await connect.start()
    expect(await connect.start()).toEqual(first)
    expect(remote.calls.filter(url => url.endsWith('/login/device/code'))).toHaveLength(1)
    connect.dispose()
    expect(connect.state()).toEqual({ status: 'idle' })
    expect(await connect.start()).toEqual({ status: 'idle' })
  })

  it('the page accepts only a github.com address to open, and tells a connection ACRYL made from gh\'s own', () => {
    expect(parseGithubConnectState({ status: 'code', code: 'AB12-CD34', url: 'https://github.com/login/device' })).toMatchObject({ status: 'code' })
    expect(() => parseGithubConnectState({ status: 'code', code: 'AB12-CD34', url: 'https://evil.example/login' })).toThrow()
    expect(parseGithubReadiness({ status: 'ready', account: 'ana', via: 'acryl' })).toEqual({ status: 'ready', account: 'ana', via: 'acryl' })
    expect(parseGithubReadiness({ status: 'ready', account: 'ana' })).toEqual({ status: 'ready', account: 'ana' })
  })

  it('the page starts, reads and disconnects the sign-in through the Host', async () => {
    const asked: string[] = []
    const api = createRegistryApi(async (input, init) => {
      asked.push(`${init?.method ?? 'GET'} ${input}`)
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ status: 'signed-out', say: 'GitHub is not connected.', command: 'gh auth login' }), { status: 200 })
      return new Response(JSON.stringify(init?.method === 'POST' ? { status: 'code', code: 'AB12-CD34', url: 'https://github.com/login/device' } : { status: 'connected' }), { status: 200 })
    })
    expect(await api.connect.start()).toMatchObject({ code: 'AB12-CD34' })
    expect(await api.connect.state()).toEqual({ status: 'connected' })
    expect(await api.connect.disconnect()).toMatchObject({ status: 'signed-out' })
    expect(asked).toEqual(['POST /api/acryl-blends-frame/plugins/github/connect', 'GET /api/acryl-blends-frame/plugins/github/connect', 'DELETE /api/acryl-blends-frame/plugins/github'])
  })
})
