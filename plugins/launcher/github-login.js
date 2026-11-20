// The GitHub sign-in for ACRYL apps (spec 051 Phase 4, workshop 2026-11-20). A person connects GitHub once, in the app, by GitHub's device flow: the
// app shows a short code, the person approves it on github.com, and the token lands in `<home>/github.json` (owner-only). Every app the launcher starts
// then gets it as GH_TOKEN, which `gh` and the git credential helper it sets up read, so sharing a Blend or publishing a plugin needs no terminal login.
// The token never appears in a command line, a list or a screen. Home is a parameter, as in model-key.js.
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const GITHUB_FILE = 'github.json'

/**
 * ACRYL's GitHub OAuth app (device flow on, no secret): a client id is public by design. ACRYL_GITHUB_CLIENT_ID overrides it, for a fork with its own
 * app or a test.
 */
export const GITHUB_CLIENT_ID = 'Ov23liKcmkBPwvX3MCBh'

/** `repo` lets a person make and push to their own repositories, public or private; nothing else is asked for. */
export const GITHUB_SCOPE = 'repo'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'

/** The client id this process signs in with, or undefined when none is set (the sign-in then says so instead of failing at GitHub). */
export function githubClientId(env = process.env) {
  const id = env.ACRYL_GITHUB_CLIENT_ID || GITHUB_CLIENT_ID
  return /^[A-Za-z0-9._-]{8,64}$/u.test(id) ? id : undefined
}

function readAll(home) {
  try {
    const value = JSON.parse(readFileSync(join(home, GITHUB_FILE), 'utf8'))
    return value !== null && typeof value === 'object' ? value : {}
  } catch { return {} }
}

/** The stored connection, `{ token, login }`, or undefined. */
export function readGithub(home) {
  const { token, login } = readAll(home)
  return typeof token === 'string' && token !== '' ? { token, login: typeof login === 'string' ? login : '' } : undefined
}

/** Store the connection (owner-only file, written whole or not at all). */
export function saveGithub(home, token, login) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_]{20,255}$/u.test(token)) throw new Error('GitHub did not give a usable token')
  mkdirSync(home, { recursive: true })
  const file = join(home, GITHUB_FILE)
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ token, login })}\n`, { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, file)
}

/** Forget the connection; returns whether there was one. */
export function clearGithub(home) {
  const had = readGithub(home) !== undefined
  rmSync(join(home, GITHUB_FILE), { force: true })
  return had
}

/**
 * What a started app should have in its environment: GH_TOKEN from the stored connection, unless the environment already names a token (GH_TOKEN or
 * GITHUB_TOKEN: a person's own login is never overridden).
 */
export function githubEnv(home, env = {}) {
  if (env.GH_TOKEN || env.GITHUB_TOKEN) return {}
  const stored = readGithub(home)
  return stored === undefined ? {} : { GH_TOKEN: stored.token }
}

async function postForm(url, form, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub answered HTTP ${String(response.status)}`)
  return response.json()
}

/**
 * Step one: ask GitHub for a device code. Returns what the person needs (`userCode` to type at `verificationUri`) and what the app polls with
 * (`deviceCode`, `interval` seconds, `expiresIn` seconds).
 */
export async function startGithubSignIn(clientId, fetchImpl = fetch) {
  const answer = await postForm(DEVICE_CODE_URL, { client_id: clientId, scope: GITHUB_SCOPE }, fetchImpl)
  if (typeof answer.device_code !== 'string' || typeof answer.user_code !== 'string') {
    throw new Error(answer.error === 'device_flow_disabled' ? 'device sign-in is not enabled for this GitHub app' : 'GitHub did not give a sign-in code')
  }
  return {
    deviceCode: answer.device_code,
    userCode: answer.user_code,
    verificationUri: typeof answer.verification_uri === 'string' ? answer.verification_uri : 'https://github.com/login/device',
    interval: Number(answer.interval) > 0 ? Number(answer.interval) : 5,
    expiresIn: Number(answer.expires_in) > 0 ? Number(answer.expires_in) : 900,
  }
}

/**
 * Step two, called every `interval` seconds: `{ state: 'pending' }` until the person approves, then the connection is saved and
 * `{ state: 'connected', login }` returned. `slow_down` asks for a longer interval; a refusal or an expired code ends the sign-in.
 */
export async function pollGithubSignIn(home, clientId, deviceCode, fetchImpl = fetch) {
  const answer = await postForm(TOKEN_URL, { client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, fetchImpl)
  if (typeof answer.access_token === 'string') {
    const user = await fetchImpl(USER_URL, { headers: { Authorization: `Bearer ${answer.access_token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) })
    const login = user.ok ? String((await user.json()).login ?? '') : ''
    saveGithub(home, answer.access_token, login)
    return { state: 'connected', login }
  }
  switch (answer.error) {
    case 'authorization_pending': return { state: 'pending' }
    case 'slow_down': return { state: 'pending', interval: Number(answer.interval) > 0 ? Number(answer.interval) : undefined }
    case 'access_denied': return { state: 'failed', reason: 'the sign-in was declined on GitHub' }
    case 'expired_token': return { state: 'failed', reason: 'the code expired: start the sign-in again' }
    default: return { state: 'failed', reason: typeof answer.error_description === 'string' ? answer.error_description : 'GitHub refused the sign-in' }
  }
}
