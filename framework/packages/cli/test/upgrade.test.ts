import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { diffStat, unifiedDiff } from '../src/diff'
import { type Io, parseUpgradeOptions, readLibrary, runCli, VERSION } from '../src/index'
import { hashFolder, LOCK_FILE, readHistory, readLock } from '../src/lock'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-upgrade-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
const fixtures = resolve(import.meta.dirname, 'fixtures', 'upgrade')

function session(cwd: string) {
  const out: string[] = []
  const err: string[] = []
  const io: Io = {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { io, out: () => out.join(''), err: () => err.join('') }
}

/** An app as the published version made it: the fixture, unpacked into its own folder. */
function unpack(version: string): string {
  const dir = mkdtempSync(join(scratch, `app-${version}-`))
  execFileSync('tar', ['-xzf', join(fixtures, `app-${version}.tgz`), '-C', dir])
  return join(dir, 'app')
}

describe('the diff', () => {
  it('shows what changed with context, and counts it', () => {
    const before = 'a\nb\nc\nd\ne\nf\ng\nh\n'
    const after = 'a\nb\nc\nD\ne\nf\ng\nh\ni\n'
    const diff = unifiedDiff('x.ts', before, after)
    expect(diff).toContain('--- a/x.ts')
    expect(diff).toContain('-d')
    expect(diff).toContain('+D')
    expect(diff).toContain('+i')
    expect(unifiedDiff('x.ts', before, before)).toBe('')
    expect(diffStat(before, after)).toEqual({ added: 2, removed: 1 })
  })
})

describe('upgrade options', () => {
  it('takes plugin names, --dir, --dry-run, --force and --diff', () => {
    expect(
      parseUpgradeOptions(['acryl-router', '--dir', 'app', '--dry-run', '--force', '--diff']),
    ).toEqual({
      names: ['acryl-router'],
      directory: 'app',
      dryRun: true,
      force: true,
      diff: true,
    })
    expect(() => parseUpgradeOptions(['--nope'])).toThrow()
  })
})

describe('the hash history', () => {
  it('knows the files of the released versions, so an app made before the lock can be upgraded', () => {
    const history = readHistory()
    expect(Object.keys(history)).toEqual(
      expect.arrayContaining(['acryl-router', 'acryl-door', 'extensions']),
    )
    expect(history['acryl-router']?.['src/index.ts']?.length).toBeGreaterThanOrEqual(1)
  })
})

describe.each(['0.9.1', '0.10.0'])('upgrading an app made by acrylblends %s', (version) => {
  it('shows a dry run without changing anything, then upgrades every library plugin, and a second run finds nothing to do', async () => {
    const app = unpack(version)
    const before = hashFolder(join(app, 'plugins'))
    expect(existsSync(join(app, 'plugins', LOCK_FILE))).toBe(false)

    const dry = session(app)
    expect(await runCli(['upgrade', '--dry-run'], dry.io)).toBe(0)
    expect(dry.out()).toContain(`to acrylblends ${VERSION}`)
    expect(dry.out()).toContain('dry run: nothing was changed')
    expect(hashFolder(join(app, 'plugins'))).toEqual(before)

    const run = session(app)
    expect(await runCli(['upgrade'], run.io), run.err()).toBe(0)
    expect(run.out()).toContain('upgraded')
    // Every library plugin of the app now equals what the current library copies.
    const fresh = mkdtempSync(join(scratch, 'fresh-'))
    mkdirSync(join(fresh, 'plugins'))
    const { copyPlugin } = await import('../src/index')
    const lock = readLock(join(app, 'plugins'))
    for (const name of Object.keys(lock.plugins)) {
      const plugin = readLibrary().get(name)
      expect(plugin, name).toBeDefined()
      copyPlugin(plugin as NonNullable<typeof plugin>, fresh)
      expect(hashFolder(join(app, 'plugins', name)), name).toEqual(
        hashFolder(join(fresh, 'plugins', name)),
      )
    }
    expect(Object.keys(lock.plugins).length).toBeGreaterThan(5)
    // The agent template does not depend on the package (its plugins are copies), so upgrading adds no dependency; an app that has one gets the new range.
    expect(
      JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).dependencies.acrylblends,
    ).toBeUndefined()

    const again = session(app)
    expect(await runCli(['upgrade'], again.io)).toBe(0)
    expect(again.out()).toContain('everything is up to date')
  })

  it('stops when an app edited a plugin file: shows the diff, changes nothing, and --force saves the edit before replacing it', async () => {
    const app = unpack(version)
    const edited = join(app, 'plugins', 'acryl-router', 'src', 'index.ts')
    const original = readFileSync(edited, 'utf8')
    writeFileSync(edited, `${original}\n// my own change\nexport const mine = 1\n`)
    const mark = hashFolder(join(app, 'plugins'))

    const refused = session(app)
    expect(await runCli(['upgrade'], refused.io)).toBe(1)
    expect(refused.out()).toContain('EDITED HERE')
    expect(refused.out()).toContain('-export const mine = 1')
    expect(refused.err()).toContain('nothing was changed')
    expect(hashFolder(join(app, 'plugins'))).toEqual(mark)

    const forced = session(app)
    expect(await runCli(['upgrade', '--force'], forced.io), forced.err()).toBe(0)
    expect(readFileSync(edited, 'utf8')).not.toContain('export const mine = 1')
    const backups = readdirSync(join(app, '.acryl', 'upgrade-backup'))
    expect(backups).toHaveLength(1)
    expect(
      readFileSync(
        join(
          app,
          '.acryl',
          'upgrade-backup',
          backups[0] as string,
          'acryl-router',
          'src',
          'index.ts',
        ),
        'utf8',
      ),
    ).toContain('export const mine = 1')
  })

  it('keeps a file of its own that sits in a library plugin folder, and reports it', async () => {
    const app = unpack(version)
    writeFileSync(join(app, 'plugins', 'extensions', 'notes-of-mine.md'), 'mine\n')
    const run = session(app)
    expect(await runCli(['upgrade'], run.io), run.err()).toBe(0)
    expect(readFileSync(join(app, 'plugins', 'extensions', 'notes-of-mine.md'), 'utf8')).toBe(
      'mine\n',
    )
  })
})

describe('upgrade refusals', () => {
  it('refuses a folder that is not an app, an unknown plugin name, and the old src/plugins layout', async () => {
    const empty = mkdtempSync(join(scratch, 'empty-'))
    const none = session(empty)
    expect(await runCli(['upgrade'], none.io)).toBe(1)
    expect(none.err()).toContain('is not an app')
    const app = unpack('0.10.0')
    const unknown = session(app)
    expect(await runCli(['upgrade', 'nope'], unknown.io)).toBe(1)
    expect(unknown.err()).toContain('carries no library plugin "nope"')
    const legacy = mkdtempSync(join(scratch, 'legacy-'))
    mkdirSync(join(legacy, 'src', 'plugins'), { recursive: true })
    writeFileSync(join(legacy, 'package.json'), '{}\n')
    const old = session(legacy)
    expect(await runCli(['upgrade'], old.io)).toBe(1)
    expect(old.err()).toContain('one-folder layout')
  })

  it('records a lock when a plugin is copied, so a new app is exact from the start', async () => {
    const dir = mkdtempSync(join(scratch, 'new-'))
    const run = session(dir)
    expect(await runCli(['init', 'fresh', '--template', 'blank', '-y'], run.io), run.err()).toBe(0)
    const lock = readLock(join(dir, 'fresh', 'plugins'))
    expect(lock.plugins['acryl-router']?.from).toBe(VERSION)
    expect(Object.keys(lock.plugins['acryl-router']?.files ?? {})).toContain('src/index.ts')
    // A fresh app has nothing to upgrade.
    const check = session(join(dir, 'fresh'))
    expect(await runCli(['upgrade'], check.io), check.err()).toBe(0)
    expect(check.out()).toContain('everything is up to date')
  })
})
