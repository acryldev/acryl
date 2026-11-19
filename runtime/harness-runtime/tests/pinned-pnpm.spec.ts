import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pinnedPnpmEnv, resolvePinnedPnpm } from '../src/pinned-pnpm.ts'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true }))) })

describe('pinned pnpm for Web and CLI installs', () => {
  it('resolves the pnpm this runtime depends on', () => {
    const pinned = resolvePinnedPnpm()
    expect(pinned?.version).toBe('11.11.0')
  })

  it('puts a shim for the pinned pnpm first on PATH and it runs that exact version', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'acryl-pnpm-bin-'))
    dirs.push(binDir)
    const env = pinnedPnpmEnv({ PATH: '/usr/bin' }, binDir, 'linux')
    expect(env.PATH?.split(delimiter)[0]).toBe(binDir)
    expect(env.PATH).toContain('/usr/bin')
    if (process.platform !== 'win32') {
      // A synchronous spawn blocks vitest's own timeout, so a stuck pnpm would stall the whole suite (seen once on a Mac mini): bound it
      // here. cwd is the empty shim folder so pnpm reads no repository config (packageManager, pnpm-workspace.yaml) on the way.
      const out = execFileSync(join(binDir, 'pnpm'), ['--version'], {
        cwd: binDir, env: { ...env, PATH: env.PATH ?? '' }, encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL',
      })
      expect(out.trim()).toBe('11.11.0')
    }
    // Idempotent: a second call rewrites nothing and returns the same shape.
    expect(pinnedPnpmEnv({ PATH: '/usr/bin' }, binDir, 'linux').PATH).toBe(env.PATH)
  }, 30_000)
})
