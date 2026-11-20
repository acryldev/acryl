/**
 * The one GitHub sign-in of ACRYL (workshop 2026-11-20): a person connects GitHub once, in ACRYL Control Center or inside any app, by GitHub's device flow with
 * ACRYL's own OAuth app: a short code is shown, the person approves it on github.com, and the token lands in `<ACRYL home>/github.json` (owner-only). Whoever
 * signs in, the same file is read by every other place, so signing in once counts everywhere, and an app's share runs with it as `GH_TOKEN`, which `gh` and
 * its git credential helper read. The token never appears in a command line, a list or a screen. This is the only implementation: the launcher and the frame use it.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const GITHUB_FILE = 'github.json'

/** ACRYL's GitHub OAuth app (device flow on, no secret): a client id is public by design. ACRYL_GITHUB_CLIENT_ID overrides it, for a fork with its own app or a test. */
export const GITHUB_CLIENT_ID = 'Ov23liKcmkBPwvX3MCBh'

/** `repo` lets a person make and push to their own repositories, public or private; nothing else is asked for. */
export const GITHUB_SCOPE = 'repo'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'

type Env = Readonly<Record<string, string | undefined>>
type FetchLike = (input: string, init?: RequestInit) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>

export interface GithubConnection {
  readonly token: string
  readonly login: string
}

/** The client id this process signs in with, or undefined when none is valid (the sign-in then says so instead of failing at GitHub). */
export function githubClientId(env: Env = process.env): string | undefined {
  const id = env['ACRYL_GITHUB_CLIENT_ID'] || GITHUB_CLIENT_ID
  return /^[A-Za-z0-9._-]{8,64}$/u.test(id) ? id : undefined
}

/**
 * Where the connection is kept: ACRYL's home, the folder ACRYL Control Center lists and makes apps in (`~/.acryl`; `ACRYL_LAUNCHER_HOME` moves it, a test or a rehearsal).
 * Every app reads the same file, so this must stay the rule Control Center uses.
 */
export function githubHome(env: Env = process.env): string {
  const moved = env['ACRYL_LAUNCHER_HOME']?.trim()
  if (moved !== undefined && moved !== '') return moved
  const person = (process.platform === 'win32' ? env['USERPROFILE'] : env['HOME'])?.trim()
  return join(person !== undefined && person !== '' ? person : homedir(), '.acryl')
}

function readAll(home: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, GITHUB_FILE), 'utf8'))
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch { return {} }
}

/** The stored connection, or undefined. */
export function readGithub(home: string): GithubConnection | undefined {
  const { token, login } = readAll(home)
  return typeof token === 'string' && token !== '' ? { token, login: typeof login === 'string' ? login : '' } : undefined
}

/** Store the connection (owner-only file, written whole or not at all). */
export function saveGithub(home: string, token: string, login: string): void {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_]{20,255}$/u.test(token)) throw new Error('GitHub did not give a usable token')
  mkdirSync(home, { recursive: true })
  const file = join(home, GITHUB_FILE)
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ token, login })}\n`, { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, file)
}

/** Forget the connection; returns whether there was one. */
export function clearGithub(home: string): boolean {
  const had = readGithub(home) !== undefined
  rmSync(join(home, GITHUB_FILE), { force: true })
  return had
}

/** What a started app should have in its environment: GH_TOKEN from the stored connection, unless the environment already names a token (a person's own login is never overridden). */
export function githubEnv(home: string, env: Env = {}): Record<string, string | undefined> {
  if (env['GH_TOKEN'] || env['GITHUB_TOKEN']) return {}
  const stored = readGithub(home)
  return stored === undefined ? {} : { GH_TOKEN: stored.token }
}

/**
 * Put the stored connection into a process's own environment, so the `gh` and `git` it starts use it (and fall back to their own login when there is none).
 * Returns the login now in use, or undefined. A token the environment already names (GH_TOKEN, GITHUB_TOKEN) is kept as it is.
 */
export function adoptGithubToken(env: Record<string, string | undefined> = process.env, home: string = githubHome(env)): string | undefined {
  if (env['GH_TOKEN'] || env['GITHUB_TOKEN']) return undefined
  const stored = readGithub(home)
  if (stored === undefined) return undefined
  env['GH_TOKEN'] = stored.token
  return stored.login
}

async function postForm(url: string, form: Record<string, string>, fetchImpl: FetchLike): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub answered HTTP ${String(response.status)}`)
  return await response.json() as Record<string, unknown>
}

export interface GithubSignInStart {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  /** Seconds between polls. */
  readonly interval: number
  /** Seconds the code lives. */
  readonly expiresIn: number
}

/** Step one: ask GitHub for a device code: what the person needs (`userCode` to type at `verificationUri`) and what the app polls with. */
export async function startGithubSignIn(clientId: string, fetchImpl: FetchLike = fetch): Promise<GithubSignInStart> {
  const answer = await postForm(DEVICE_CODE_URL, { client_id: clientId, scope: GITHUB_SCOPE }, fetchImpl)
  if (typeof answer['device_code'] !== 'string' || typeof answer['user_code'] !== 'string') {
    throw new Error(answer['error'] === 'device_flow_disabled' ? 'device sign-in is not enabled for this GitHub app' : 'GitHub did not give a sign-in code')
  }
  return {
    deviceCode: answer['device_code'],
    userCode: answer['user_code'],
    verificationUri: typeof answer['verification_uri'] === 'string' ? answer['verification_uri'] : 'https://github.com/login/device',
    interval: Number(answer['interval']) > 0 ? Number(answer['interval']) : 5,
    expiresIn: Number(answer['expires_in']) > 0 ? Number(answer['expires_in']) : 900,
  }
}

export type GithubSignInPoll =
  | { readonly state: 'pending'; readonly interval?: number | undefined }
  | { readonly state: 'connected'; readonly login: string }
  | { readonly state: 'failed'; readonly reason: string }

/**
 * Step two, called every `interval` seconds: `pending` until the person approves, then the connection is saved and `connected` returned. `slow_down` asks
 * for a longer interval; a refusal or an expired code ends the sign-in.
 */
export async function pollGithubSignIn(home: string, clientId: string, deviceCode: string, fetchImpl: FetchLike = fetch): Promise<GithubSignInPoll> {
  const answer = await postForm(TOKEN_URL, { client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, fetchImpl)
  if (typeof answer['access_token'] === 'string') {
    const user = await fetchImpl(USER_URL, { headers: { Authorization: `Bearer ${answer['access_token']}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) })
    const login = user.ok ? String(((await user.json()) as { login?: unknown }).login ?? '') : ''
    saveGithub(home, answer['access_token'], login)
    return { state: 'connected', login }
  }
  switch (answer['error']) {
    case 'authorization_pending': return { state: 'pending' }
    case 'slow_down': return { state: 'pending', interval: Number(answer['interval']) > 0 ? Number(answer['interval']) : undefined }
    case 'access_denied': return { state: 'failed', reason: 'the sign-in was declined on GitHub' }
    case 'expired_token': return { state: 'failed', reason: 'the code expired: start the sign-in again' }
    default: return { state: 'failed', reason: typeof answer['error_description'] === 'string' ? answer['error_description'] : 'GitHub refused the sign-in' }
  }
}
