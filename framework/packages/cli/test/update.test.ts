import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Io } from '../src/io'
import {
  BLEND_REF,
  blendOfApp,
  isNewerVersion,
  newestTag,
  sourceOfApp,
  UPDATE_HOLD,
  type UpdateWorld,
  update,
} from '../src/update'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-update-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim()

const manifest = (version: string) =>
  `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acrylblends.csv-explorer\n  name: csv\n  version: ${version}\nspec:\n  rows: []\n`

/** Write the Blend at `version` into `dir` as create-acrylblends makes it: a repository with one commit. */
function makeBlend(dir: string, version: string, files: Record<string, string>, from?: string) {
  mkdirSync(dir, { recursive: true })
  const text = manifest(version)
  writeFileSync(
    join(dir, 'blend.yaml'),
    from === undefined
      ? text
      : text.replace(`  version: ${version}\n`, `  version: ${version}\n  from: "${from}"\n`),
  )
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  git(dir, 'init', '-q')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Initial commit from acrylblends')
}

function session(cwd: string) {
  const out: string[] = []
  const io: Io = {
    stdout: { write: (t: string) => out.push(t) },
    stderr: { write: () => {} },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { io, out: () => out.join('') }
}

const v1 = {
  'page.ts': 'export const title = "CSV"\n',
  'chart.ts': 'export const bars = 5\n',
  'package-lock.json': '{"v":1}\n',
}

describe('acrylblends update', () => {
  it('reads the Blend an app was made from and compares versions', () => {
    expect(blendOfApp(manifest('0.1.0'))).toEqual({
      id: 'acrylblends.csv-explorer',
      version: '0.1.0',
    })
    expect(blendOfApp('kind: Blueprint\n')).toBeUndefined()
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
  })

  it('takes its updates from where it was made: metadata.from, else its own id', () => {
    const own = manifest('0.1.0')
    expect(sourceOfApp(own)).toEqual({ source: 'acrylblends.csv-explorer', current: '0.1.0' })
    const fromRegistry = own.replace(
      '  version: 0.1.0\n',
      '  version: 0.1.0\n  from: "acrylblends.link-shortener#0.3.1"\n',
    )
    expect(sourceOfApp(fromRegistry)).toEqual({
      source: 'acrylblends.link-shortener',
      current: '0.3.1',
    })
    const fromRepository = own.replace(
      '  version: 0.1.0\n',
      '  version: 0.1.0\n  from: "github:ana/notes#v0.2.0"\n',
    )
    expect(sourceOfApp(fromRepository)).toEqual({ source: 'github:ana/notes', current: '0.2.0' })
    const noTag = own.replace(
      '  version: 0.1.0\n',
      '  version: 0.1.0\n  from: "github:ana/notes"\n',
    )
    expect(sourceOfApp(noTag)).toEqual({ source: 'github:ana/notes', current: '0.1.0' })
    expect(
      newestTag(
        'a\trefs/tags/v0.1.0\nb\trefs/tags/v0.10.0\nc\trefs/tags/v0.9.1\nd\trefs/tags/nightly\n',
      ),
    ).toBe('v0.10.0')
    // package.json acryl.from wins (create-blends 1.7.16+): an older manifest checker in the app never sees the field.
    expect(
      sourceOfApp(own, JSON.stringify({ name: 'csv', acryl: { from: 'github:ben/csv#v1.0.0' } })),
    ).toEqual({ source: 'github:ben/csv', current: '1.0.0' })
    expect(sourceOfApp(fromRepository, '{ not json')).toEqual({
      source: 'github:ana/notes',
      current: '0.2.0',
    })
    expect(newestTag('')).toBeUndefined()
  })

  it("brings a shared repository's newer tag into an app made from it", async () => {
    const root = join(scratch, 'repo-made')
    const app = join(root, 'csv')
    makeBlend(app, '0.1.0', v1, 'github:ana/csv#v0.1.0')
    const asked: string[] = []
    const world: UpdateWorld = {
      latest: async (source) => {
        asked.push(source)
        return 'v0.2.0'
      },
      make: async (source, name, folder, release) => {
        asked.push(`${source}#${release}`)
        const made = join(folder, name)
        makeBlend(
          made,
          '0.1.0',
          { ...v1, 'chart.ts': 'export const bars = 9\n' },
          'github:ana/csv#v0.2.0',
        )
        return 0
      },
    }
    const { io, out } = session(app)
    expect(await update({ directory: undefined, check: false }, io, world)).toBe(0)
    expect(asked).toEqual(['github:ana/csv', 'github:ana/csv#v0.2.0'])
    expect(readFileSync(join(app, 'chart.ts'), 'utf8')).toContain('bars = 9')
    expect(readFileSync(join(app, 'blend.yaml'), 'utf8')).toContain('github:ana/csv#v0.2.0')
    expect(out()).toContain('Updated to github:ana/csv 0.2.0')
  })

  it("merges the Blend's newer release into the app and keeps the person's change, twice in a row", async () => {
    const app = join(scratch, 'csv')
    makeBlend(app, '0.1.0', v1)
    writeFileSync(join(app, 'page.ts'), 'export const title = "My sales"\n') // the person's change, not committed
    writeFileSync(join(app, 'package-lock.json'), '{"v":"mine"}\n') // their install
    let release = '0.2.0'
    const world: UpdateWorld = {
      latest: async () => release,
      make: async (_id, name, folder) => {
        const files =
          release === '0.2.0'
            ? { ...v1, 'chart.ts': 'export const bars = 12\n', 'package-lock.json': '{"v":2}\n' }
            : {
                ...v1,
                'chart.ts': 'export const bars = 12\n',
                'package-lock.json': '{"v":2}\n',
                'export.ts': 'export const csv = true\n',
              }
        makeBlend(join(folder, name), release, files)
        return 0
      },
    }
    const first = session(app)
    expect(await update({ directory: undefined, check: false }, first.io, world)).toBe(0)
    expect(first.out()).toContain('Updated to acrylblends.csv-explorer 0.2.0')
    expect(readFileSync(join(app, 'page.ts'), 'utf8')).toContain('My sales')
    expect(readFileSync(join(app, 'chart.ts'), 'utf8')).toContain('12')
    expect(readFileSync(join(app, 'blend.yaml'), 'utf8')).toContain('version: 0.2.0')
    expect(git(app, 'status', '--porcelain')).toBe('')
    const base = git(app, 'rev-parse', BLEND_REF)

    release = '0.3.0'
    expect(await update({ directory: undefined, check: false }, session(app).io, world)).toBe(0)
    expect(readFileSync(join(app, 'export.ts'), 'utf8')).toContain('csv')
    expect(readFileSync(join(app, 'page.ts'), 'utf8')).toContain('My sales')
    expect(git(app, 'rev-parse', `${BLEND_REF}^`)).toBe(base)

    const latest = session(app)
    expect(await update({ directory: undefined, check: false }, latest.io, world)).toBe(0)
    expect(latest.out()).toContain('0.3.0 is the latest release')
  })

  it('says there is nothing to update for an app whose Blend is not in the registry', async () => {
    const app = join(scratch, 'starter')
    makeBlend(app, '0.1.0', v1)
    const run = session(app)
    const world: UpdateWorld = { latest: async () => undefined, make: async () => 1 }
    expect(await update({ directory: undefined, check: false }, run.io, world)).toBe(0)
    expect(run.out()).toContain('not a Blend in the registry')
  })

  it('changes nothing when the person and the release changed the same lines', async () => {
    const app = join(scratch, 'clash')
    makeBlend(app, '0.1.0', v1)
    writeFileSync(join(app, 'chart.ts'), 'export const bars = 7\n')
    git(app, 'commit', '-qam', 'mine')
    const head = git(app, 'rev-parse', 'HEAD')
    const world: UpdateWorld = {
      latest: async () => '0.2.0',
      make: async (_id, name, folder) => {
        makeBlend(join(folder, name), '0.2.0', { ...v1, 'chart.ts': 'export const bars = 12\n' })
        return 0
      },
    }
    await expect(
      update({ directory: undefined, check: false }, session(app).io, world),
    ).rejects.toThrow(/both changed the same lines of: chart\.ts/u)
    expect(git(app, 'rev-parse', 'HEAD')).toBe(head)
    expect(git(app, 'status', '--porcelain')).toBe('')
  })
  it('holds a running app\'s reload while it installs, and takes the app back when the install fails', async () => {
    const app = join(scratch, 'held')
    makeBlend(app, '0.1.0', { ...v1, '.gitignore': 'node_modules/\n' })
    mkdirSync(join(app, 'node_modules'))
    const head = git(app, 'rev-parse', 'HEAD')
    const world: UpdateWorld = {
      latest: async () => '0.2.0',
      make: async (_id, name, folder) => {
        makeBlend(join(folder, name), '0.2.0', { ...v1, '.gitignore': 'node_modules/\n', 'chart.ts': 'export const bars = 12\n' })
        return 0
      },
    }
    const installs: { held: boolean; chart: string }[] = []
    const run = session(app)
    run.io.install = async () => {
      installs.push({ held: existsSync(join(app, UPDATE_HOLD)), chart: readFileSync(join(app, 'chart.ts'), 'utf8') })
      return installs.length === 1 ? 1 : 0
    }
    await expect(update({ directory: undefined, check: false }, run.io, world)).rejects.toThrow(
      /npm install failed for acrylblends\.csv-explorer 0\.2\.0; the app is back at 0\.1\.0/u,
    )
    // The failed install ran on the new code under the hold; the second one restored the old code's packages, still held.
    expect(installs).toEqual([
      { held: true, chart: 'export const bars = 12\n' },
      { held: true, chart: 'export const bars = 5\n' },
    ])
    expect(git(app, 'rev-parse', 'HEAD')).toBe(head)
    expect(() => git(app, 'rev-parse', '-q', '--verify', BLEND_REF)).toThrow()
    expect(existsSync(join(app, UPDATE_HOLD))).toBe(false)

    const again = session(app)
    expect(await update({ directory: undefined, check: false }, again.io, world)).toBe(0)
    expect(again.out()).toContain('Updated to acrylblends.csv-explorer 0.2.0')
    expect(existsSync(join(app, UPDATE_HOLD))).toBe(false)
  })
})
