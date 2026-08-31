/**
 * OAuth authorization-code flow (L010 + L011): PKCE, a one-shot loopback
 * redirect listener, the code→token exchange, and grant persistence through
 * the `credentials` record seam (`modifyRecord`/`readRecord`/`deleteRecord`).
 *
 * The flow owns exactly one transient resource — an `http.Server` bound to
 * `127.0.0.1:0` — which is opened and closed inside `runOAuthLogin`. The PKCE
 * verifier and `state` are in-memory only and never surface to a transcript.
 * @module @tomowang/dsh-tui/tui/oauth/flow
 */

import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { grantKey, type OAuthGrantPayload, type OAuthProviderMetadata } from './metadata.js'

/** The minimal `credentials` service surface the flow needs (kept structurally typed). */
export interface OAuthCredentials {
  readRecord(key: string): Promise<{ kind: string; payload?: unknown } | undefined>
  modifyRecord(key: string, mutate: (current: unknown) => Promise<unknown>): Promise<unknown>
  deleteRecord(key: string): Promise<void>
}

export interface OAuthLoginOptions {
  /** Opens the authorize URL; injected for tests, defaults to the platform browser. */
  readonly openUrl?: (url: string) => Promise<void>
  /** Callback timeout in milliseconds (default 5 minutes). */
  readonly timeoutMs?: number
}

export type OAuthResult = { readonly ok: true } | { readonly ok: false; readonly error: string }

/** A token-endpoint response, normalized from the provider's JSON body. */
interface TokenResponse {
  readonly access_token: string
  readonly refresh_token?: string
  readonly token_type?: string
  readonly expires_in?: number
}

/** PKCE + state material for one flow. */
interface PkceMaterial {
  readonly verifier: string
  readonly challenge: string
  readonly state: string
}

function base64Url(input: Buffer): string {
  return input.toString('base64url')
}

function makePkce(): PkceMaterial {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(16))
  return { verifier, challenge, state }
}

function toGrantPayload(tokens: TokenResponse): OAuthGrantPayload {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenType: tokens.token_type,
    expiresAt: tokens.expires_in !== undefined ? Date.now() + tokens.expires_in * 1000 : undefined,
  }
}

function buildAuthorizeUrl(meta: OAuthProviderMetadata, redirectUri: string, pkce: PkceMaterial): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: meta.clientId,
    redirect_uri: redirectUri,
    scope: meta.scopes.join(' '),
    state: pkce.state,
  })
  if (meta.pkce) {
    params.set('code_challenge', pkce.challenge)
    params.set('code_challenge_method', 'S256')
  }
  if (meta.audience !== undefined) params.set('audience', meta.audience)
  return `${meta.authorizeUrl}?${params.toString()}`
}

/** Attach the one-shot callback handler and return a promise for the code. */
function awaitCallback(server: Server, state: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OAuth login timed out waiting for the redirect.'))
      server.close()
    }, timeoutMs)
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        response.writeHead(404).end()
        return
      }
      clearTimeout(timer)
      response.writeHead(200, { 'content-type': 'text/plain' }).end('Authorization complete. You can return to ACRYL.')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      server.close()
      if (returnedState !== state) reject(new Error('OAuth state mismatch.'))
      else if (code === null) reject(new Error('OAuth redirect did not include an authorization code.'))
      else resolve(code)
    })
  })
}

/** Open the authorize URL in the platform's default browser. */
function defaultOpenUrl(url: string): Promise<void> {
  const platform = process.platform
  const command: [string, string[]] = platform === 'darwin' ? ['open', [url]]
    : platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]]
  return new Promise(resolve => {
    execFile(command[0], command[1], () => resolve())
  })
}

/** POST the authorization code to the token endpoint and normalize the body. */
async function exchangeCode(meta: OAuthProviderMetadata, code: string, redirectUri: string, pkce: PkceMaterial): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: meta.clientId,
  })
  if (meta.pkce) body.set('code_verifier', pkce.verifier)
  return postToken(meta, body)
}

/** POST to the token endpoint; shared by the code and refresh exchanges. */
async function postToken(meta: OAuthProviderMetadata, body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(meta.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`token request failed (${response.status}): ${text}`)
  }
  return await response.json() as TokenResponse
}

/** Run the full authorization-code flow and persist the resulting grant. */
export async function runOAuthLogin(
  meta: OAuthProviderMetadata,
  credentials: OAuthCredentials,
  options: OAuthLoginOptions = {},
): Promise<OAuthResult> {
  const server: Server = createServer()
  try {
    const pkce = makePkce()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address() as AddressInfo
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const authorizeUrl = buildAuthorizeUrl(meta, redirectUri, pkce)
    const codePromise = awaitCallback(server, pkce.state, options.timeoutMs ?? 300_000)
    // The callback can fire (and reject) before the `await` below attaches, so
    // pin a no-op handler to keep the transient rejection from being reported
    // as unhandled; `await codePromise` still re-throws it to the catch below.
    codePromise.catch(() => {})
    await (options.openUrl ?? defaultOpenUrl)(authorizeUrl)
    const code = await codePromise
    const tokens = await exchangeCode(meta, code, redirectUri, pkce)
    await credentials.modifyRecord(grantKey(meta), async () => ({ kind: 'grant', payload: toGrantPayload(tokens) }))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (server.listening) server.close()
  }
}

/** Read the stored grant for a provider, or undefined when none is stored. */
export async function readOAuthGrant(meta: OAuthProviderMetadata, credentials: OAuthCredentials): Promise<OAuthGrantPayload | undefined> {
  const record = await credentials.readRecord(grantKey(meta))
  return record?.kind === 'grant' ? (record.payload as OAuthGrantPayload) : undefined
}

/** Refresh a stored grant with its refresh token and persist the rotation. */
export async function refreshOAuthGrant(meta: OAuthProviderMetadata, credentials: OAuthCredentials): Promise<OAuthResult> {
  try {
    const current = await readOAuthGrant(meta, credentials)
    if (current?.refreshToken === undefined) return { ok: false, error: 'No refresh token available for this grant.' }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: meta.clientId,
    })
    const tokens = await postToken(meta, body)
    const payload = toGrantPayload({ ...tokens, refresh_token: tokens.refresh_token ?? current.refreshToken })
    await credentials.modifyRecord(grantKey(meta), async () => ({ kind: 'grant', payload }))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Revoke (delete) a provider's stored grant. Removing an absent record is a no-op. */
export async function revokeOAuthGrant(meta: OAuthProviderMetadata, credentials: OAuthCredentials): Promise<void> {
  await credentials.deleteRecord(grantKey(meta))
}
