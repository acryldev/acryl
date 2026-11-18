import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Io } from '../src/io'
import { BLEND_REF, blendOfApp, isNewerVersion, type UpdateWorld, update } from '../src/update'

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
function makeBlend(dir: string, version: string, files: Record<string, string>) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'blend.yaml'), manifest(version))
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
})
