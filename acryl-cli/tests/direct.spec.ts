import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_BUNDLES, initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { startDirectHost } from '../src/host/direct.ts'

const temporaryDirectories: string[] = []
const initialDshHome = process.env.DSH_HOME

async function setup(): Promise<void> {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'acryl-direct-'))
  temporaryDirectories.push(process.env.DSH_HOME)
  const profileDirectory = resolveProfileDir('desktop')
  initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), '- id: hmr\n  disabled: true\n')
}

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('startDirectHost', () => {
  it('starts a normal local runtime', async () => {
    await setup()
    const host = await startDirectHost({ profile: 'desktop' })
    expect(host.runtimeState).toBe('ready')
    expect(host.ctx.get('sessions')).toBeDefined()
    expect(host.ctx.get('agents')).toBeDefined()
    await host.dispose()
  })

  it('boots the selected engine as a Loader row beneath one Cordis root', async () => {
    await setup()
    const host = await startDirectHost({ profile: 'desktop' })
    try {
      // The engine selection is the observable contract of the extraction:
      // `dsh` is mounted as a row, not as a second root.
      expect(host.engine).toBe('dsh')
      expect(host.ctx.get('loader')).toBeDefined()
      expect(host.runtimeState).toBe('ready')
    } finally {
      await host.dispose()
    }
  })

  it('disposes idempotently and tears the engine tree down', async () => {
    await setup()
    const host = await startDirectHost({ profile: 'desktop' })
    expect(host.ctx.get('sessions')).toBeDefined()
    await host.dispose()
    await expect(host.dispose()).resolves.toBeUndefined()
    // The whole profile tree came off the root with the engine row.
    expect(host.ctx.get('sessions')).toBeUndefined()
  })

  it('rejects an empty profile before any Loader activation', async () => {
    await expect(startDirectHost({ profile: '  ' })).rejects.toThrow('profile must not be empty')
  })

  it('provides tuiCommands before the dsh engine mounts, so a profile plugin can register during its own apply() (spec 034 T009)', async () => {
    await setup()
    const host = await startDirectHost({ profile: 'desktop' })
    try {
      // The service itself is always present, independent of any plugin.
      expect(host.ctx.get('tuiCommands')).toBeDefined()

      // A real registration behaves exactly like a profile plugin's own
      // apply(ctx) calling ctx.get('tuiCommands')?.register(...) would -
      // this is the same object a Loader row's plugin function would see.
      const open = () => ({ render: () => ['hello from a plugin'], invalidate: () => {} })
      const dispose = host.ctx.get('tuiCommands')?.register({
        command: '/files',
        description: 'Browse files',
        open,
      })
      expect(host.ctx.get('tuiCommands')?.get('/files')?.open).toBe(open)
      dispose?.()
      expect(host.ctx.get('tuiCommands')?.get('/files')).toBeUndefined()
    } finally {
      await host.dispose()
    }
  })
})

/** Guarantee G6 (spec 028): the CLI surface must not reach for the direct bootstrap. */
describe('engine boundary', () => {
  it('acryl-cli/src never imports the direct DSH bootstrap', async () => {
    const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
    const files: string[] = []
    async function walk(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await walk(path)
        else if (entry.name.endsWith('.ts')) files.push(path)
      }
    }
    await walk(sourceRoot)

    expect(files.length).toBeGreaterThan(0)
    // Match import statements only, not prose: `direct.ts` legitimately names
    // the old bootstrap in a doc comment explaining what the engine replaced.
    const imports = /import\s+[^;]*?from\s+['"][^'"]+['"]/gs
    const offenders: string[] = []
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      for (const statement of text.match(imports) ?? []) {
        if (statement.includes('bootAcrylHarnessProfile')) offenders.push(file.slice(sourceRoot.length))
      }
    }
    expect(offenders).toEqual([])
  })
})
