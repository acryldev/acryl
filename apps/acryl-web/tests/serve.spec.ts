/**
 * Real boot of the ACRYL web surface (spec 028's engine-host re-point).
 * Regression coverage for a live-reported gap: the printed URL must carry
 * the process launch token dsh-client-connection's authorizeIndex requires,
 * or opening it in a browser renders "authentication required; reopen the
 * URL printed by dsh web" instead of the app. Root cause was one level
 * deeper than the URL construction itself: resolveWebEngineComposition
 * (and the pre-existing bootAcrylWebProfile it replaced) pre-empted
 * loadProfile()'s own correct auto-init by calling initProfile() with
 * DEFAULT_PROFILE_BUNDLES (dsh-base only) instead of the shipped `web`
 * template's bundles (dsh-base + dsh-web-app) - a fresh profile then never
 * had dsh-client-connection mounted at all, so ctx.get('connection') was
 * always undefined, not just missing a token.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { createAcrylEngineHost, createWebEngineDefinition } from 'acryl-harness-runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { serveWeb } from '../src/serve.ts'

const WEB_ACCESS_KEYS = ['ACRYL_WEB_HOST', 'ACRYL_WEB_PORT', 'ACRYL_WEB_TRUSTED_HOSTS'] as const
const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen({ host: '0.0.0.0', port: 0 }, () => {
    const address = server.address()
    server.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0))
  })
})

const temporaryHomes: string[] = []
const initialAcrylHome = process.env.ACRYL_HOME

afterEach(async () => {
  for (const key of WEB_ACCESS_KEYS) delete process.env[key]
  if (initialAcrylHome === undefined) delete process.env.ACRYL_HOME
  else process.env.ACRYL_HOME = initialAcrylHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('serveWeb', () => {
  it('boots through the engine host with dsh-client-connection mounted, and prints a URL carrying the launch token', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-web-serve-'))
    temporaryHomes.push(home)
    process.env.ACRYL_HOME = home

    const result = await serveWeb({ cmdlineArgs: ['--no-open', '--port', '0'], waitForSignal: false })

    expect(result.engine).toBe('dsh')
    const url = new URL(result.url)
    expect(url.searchParams.get('token')).toBeTruthy()
  }, 30000)

  it('takes a second stop signal calmly while it disposes, and lets go of its signal handlers once it has stopped', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-web-stop-'))
    temporaryHomes.push(home)
    process.env.ACRYL_HOME = home
    const before = { SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') }
    const write = process.stdout.write.bind(process.stdout)
    let printed: () => void = () => {}
    const ready = new Promise<void>(resolve => { printed = resolve })
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
      if (String(chunk).startsWith('ACRYL web: ')) printed()
      return write(chunk, ...rest)
    }) as typeof process.stdout.write
    try {
      const served = serveWeb({ cmdlineArgs: ['--no-open', '--port', '0'] })
      await ready
      process.emit('SIGINT')
      // Still listening while the host disposes: a real second SIGINT here would otherwise take its default action and end the process.
      expect(process.listenerCount('SIGINT')).toBe(before.SIGINT + 1)
      process.emit('SIGINT')
      await served
      expect({ SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') }).toEqual(before)
    } finally {
      process.stdout.write = write
    }
  }, 30000)

  it('serves beyond loopback when the instance asks (a container behind a proxy): all interfaces, trusted proxy names, a printable URL', async () => {
    const home = await mkdtemp(join(tmpdir(), 'acryl-web-access-'))
    temporaryHomes.push(home)
    const port = await freePort()
    Object.assign(process.env, { ACRYL_HOME: home, ACRYL_WEB_HOST: '0.0.0.0', ACRYL_WEB_PORT: String(port), ACRYL_WEB_TRUSTED_HOSTS: 'ws-test.example.com' })

    const printed = await serveWeb({ cmdlineArgs: ['--no-open'], waitForSignal: false })
    expect(new URL(printed.url).host).toBe(`127.0.0.1:${String(port)}`)

    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
      initialEngine: 'dsh',
      prepare: ctx => { provideCmdline(ctx, { args: ['--no-open'], exit: () => {} }) },
    })
    try {
      expect(host.ctx.get('webServer')).toMatchObject({ host: '0.0.0.0', port })
      // node:http, not fetch: fetch forbids setting Host, and Host is exactly what a proxy changes.
      const status = (path: string, name: string) => new Promise<number>((resolve, reject) => {
        request({ host: '127.0.0.1', port, path, headers: { host: name } }, response => { response.resume(); resolve(response.statusCode ?? 0) }).once('error', reject).end()
      })
      // The /api fence: a listed proxy name passes it (and then needs a session), an unlisted one is refused before authentication.
      expect(await status('/api/ping', 'evil.example.com')).toBe(403)
      expect(await status('/api/ping', 'ws-test.example.com')).not.toBe(403)
      expect(await status('/', 'ws-test.example.com')).toBe(401)
    } finally {
      await host.dispose()
    }
  }, 60000)
})
