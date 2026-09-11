/**
 * Environment isolation contract for ACRYL's home root (spec 028 / M9).
 *
 * ACRYL owns `~/.acryl` and nests each engine's artifacts beneath it. The
 * property that matters operationally is that setting `ACRYL_HOME` yields a
 * **fully isolated** run: nothing may read or write the ambient DSH home,
 * because `DSH_HOME` is commonly exported in a developer shell (and by the
 * DSH Desktop app). These tests fail if isolation can be silently defeated.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAcrylDshHome, resolveAcrylHome } from '../src/acryl-home.ts'
import { createDshEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
})

async function temporaryDirectory(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(dir)
  return dir
}

describe('resolveAcrylHome', () => {
  it('uses ACRYL_HOME when set', () => {
    expect(resolveAcrylHome({ ACRYL_HOME: '/tmp/acryl-root' })).toBe('/tmp/acryl-root')
  })

  it('defaults to ~/.acryl', () => {
    expect(resolveAcrylHome({})).toBe(join(homedir(), '.acryl'))
  })

  it('ignores a blank ACRYL_HOME', () => {
    expect(resolveAcrylHome({ ACRYL_HOME: '   ' })).toBe(join(homedir(), '.acryl'))
  })
})

describe('resolveAcrylDshHome precedence', () => {
  it('nests the DSH engine home under ACRYL_HOME even when DSH_HOME is exported', () => {
    // The decisive isolation guarantee: an ambient engine-level variable must
    // not defeat the product-level root the caller explicitly asked for.
    expect(resolveAcrylDshHome({ ACRYL_HOME: '/tmp/acryl-root', DSH_HOME: '/tmp/ambient-dsh' }))
      .toBe('/tmp/acryl-root/.dsh')
  })

  it('honors DSH_HOME when ACRYL_HOME is not set', () => {
    expect(resolveAcrylDshHome({ DSH_HOME: '/tmp/explicit-dsh' })).toBe('/tmp/explicit-dsh')
  })

  it('defaults to ~/.acryl/.dsh when neither is set', () => {
    expect(resolveAcrylDshHome({})).toBe(join(homedir(), '.acryl', '.dsh'))
  })

  it('ignores a blank DSH_HOME', () => {
    expect(resolveAcrylDshHome({ DSH_HOME: '  ' })).toBe(join(homedir(), '.acryl', '.dsh'))
  })
})

describe('engine boot isolation', () => {
  it('writes the profile under ACRYL_HOME and never into the ambient DSH home', async () => {
    const acrylHome = await temporaryDirectory('acryl-isolation-root-')
    const ambientDshHome = await temporaryDirectory('acryl-isolation-ambient-')
    const previousAcrylHome = process.env.ACRYL_HOME
    const previousDshHome = process.env.DSH_HOME
    process.env.ACRYL_HOME = acrylHome
    process.env.DSH_HOME = ambientDshHome

    try {
      const host = await createAcrylEngineHost({
        engines: [createDshEngineDefinition('acryl-isolation')],
        initialEngine: 'dsh',
      })
      try {
        expect(host.ctx.get('sessions')).toBeDefined()
        // The real proof: the profile exists in the ACRYL root ...
        expect(existsSync(join(acrylHome, '.dsh', 'profiles', 'acryl-isolation'))).toBe(true)
        // ... and the ambient home was not touched at all.
        expect(existsSync(join(ambientDshHome, 'profiles'))).toBe(false)
      } finally {
        await host.dispose()
      }
    } finally {
      if (previousAcrylHome === undefined) delete process.env.ACRYL_HOME
      else process.env.ACRYL_HOME = previousAcrylHome
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
    }
  })
})
