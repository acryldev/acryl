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
import { afterEach, describe, expect, it } from 'vitest'
import { serveWeb } from '../src/serve.ts'

const temporaryHomes: string[] = []
const initialAcrylHome = process.env.ACRYL_HOME

afterEach(async () => {
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
})
