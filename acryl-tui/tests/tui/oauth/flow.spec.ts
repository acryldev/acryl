import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { OAuthProviderMetadata } from '../../../src/tui/oauth/metadata.js'
import { grantKey } from '../../../src/tui/oauth/metadata.js'
import { readOAuthGrant, refreshOAuthGrant, revokeOAuthGrant, runOAuthLogin, type OAuthCredentials } from '../../../src/tui/oauth/flow.js'

/**
 * L013: integration test against a stub OAuth provider. The stub serves a
 * real `/authorize` (302 back to the loopback callback) and `/token` (code +
 * refresh exchanges) so the whole authorization-code flow runs over loopback
 * without a browser or a network dependency.
 */

interface StubProvider {
  readonly server: Server
  readonly baseUrl: string
}

function startStubProvider(): Promise<StubProvider> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/authorize') {
        const redirectUri = url.searchParams.get('redirect_uri')
        const state = url.searchParams.get('state')
        if (redirectUri === null || state === null) {
          response.writeHead(400).end()
          return
        }
        const next = new URL(redirectUri)
        next.searchParams.set('code', 'stub-code-123')
        next.searchParams.set('state', state)
        response.writeHead(302, { location: next.toString() }).end()
        return
      }
      if (url.pathname === '/token') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          token_type: 'Bearer',
          expires_in: 3600,
        }))
        return
      }
      response.writeHead(404).end()
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` })
    })
  })
}

function inMemoryCredentials(): { credentials: OAuthCredentials; records: Map<string, { kind: string; payload?: unknown }> } {
  const records = new Map<string, { kind: string; payload?: unknown }>()
  const credentials: OAuthCredentials = {
    readRecord: async key => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key))
      if (next !== undefined) records.set(key, next as { kind: string; payload?: unknown })
      return next
    },
    deleteRecord: async key => { records.delete(key) },
  }
  return { credentials, records }
}

let stub: StubProvider | undefined

afterEach(async () => {
  if (stub !== undefined) await new Promise<void>(resolve => stub!.server.close(() => resolve()))
  stub = undefined
})

describe('OAuth authorization-code flow (stub provider)', () => {
  it('completes login, persists the grant, refreshes, and revokes', async () => {
    stub = await startStubProvider()
    const meta: OAuthProviderMetadata = {
      route: 'stub',
      authorizeUrl: `${stub.baseUrl}/authorize`,
      tokenUrl: `${stub.baseUrl}/token`,
      clientId: 'stub-client',
      scopes: ['read'],
      pkce: true,
    }
    const { credentials, records } = inMemoryCredentials()
    // `openUrl` follows the stub's 302 back to the loopback callback, exactly
    // like a browser would after the user authorizes.
    const openUrl = async (url: string) => { await fetch(url) }

    const result = await runOAuthLogin(meta, credentials, { openUrl })
    expect(result).toEqual({ ok: true })

    const key = grantKey(meta)
    expect(key).toBe('acryl-tui/stub')
    expect(records.get(key)).toEqual({
      kind: 'grant',
      payload: { accessToken: 'at-1', refreshToken: 'rt-1', tokenType: 'Bearer', expiresAt: expect.any(Number) },
    })

    expect(await readOAuthGrant(meta, credentials)).toEqual(expect.objectContaining({ accessToken: 'at-1' }))

    expect(await refreshOAuthGrant(meta, credentials)).toEqual({ ok: true })
    expect(records.get(key)).toEqual(expect.objectContaining({ kind: 'grant' }))

    await revokeOAuthGrant(meta, credentials)
    expect(await readOAuthGrant(meta, credentials)).toBeUndefined()
  })

  it('rejects a state mismatch and stores nothing', async () => {
    stub = await startStubProvider()
    const meta: OAuthProviderMetadata = {
      route: 'stub',
      authorizeUrl: `${stub.baseUrl}/authorize`,
      tokenUrl: `${stub.baseUrl}/token`,
      clientId: 'stub-client',
      scopes: ['read'],
      pkce: true,
    }
    const { credentials, records } = inMemoryCredentials()
    // Tamper with the state before the redirect reaches the callback: the stub
    // echoes its own state, so we point it at the loopback callback with a
    // wrong state by overriding the authorize response is overkill here — the
    // state check is exercised by a wrong-echo instead. We assert the defensive
    // property (nothing stored) directly.
    const openUrl = async (url: string) => {
      const authorize = new URL(url)
      const redirectUri = authorize.searchParams.get('redirect_uri')!
      const tampered = new URL(redirectUri)
      tampered.searchParams.set('code', 'stub-code-123')
      tampered.searchParams.set('state', 'wrong-state')
      await fetch(tampered.toString())
    }

    const result = await runOAuthLogin(meta, credentials, { openUrl })
    expect(result.ok).toBe(false)
    expect(records.size).toBe(0)
  })
})
