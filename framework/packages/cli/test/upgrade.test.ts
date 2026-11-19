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
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { diffStat, unifiedDiff } from '../src/diff'
import { type Io, parseUpgradeOptions, readLibrary, runCli, VERSION } from '../src/index'
import { digest, hashFolder, LOCK_FILE, readHistory, readLock } from '../src/lock'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-upgrade-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

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
      parseUpgradeOptions(['@acryldev/router', '--dir', 'app', '--dry-run', '--force', '--diff']),
    ).toEqual({
      names: ['@acryldev/router'],
      directory: 'app',
      dryRun: true,
      force: true,
      diff: true,
      desktopPackages: false,
    })
    expect(() => parseUpgradeOptions(['--nope'])).toThrow()
  })
})

describe('the hash history', () => {
  it('knows the files of the released versions, so an app made before the lock can be upgraded', () => {
    const history = readHistory()
    expect(Object.keys(history)).toEqual(
      expect.arrayContaining(['router', 'door', 'extensions']),
    )
    expect(history.router?.['src/index.ts']?.length).toBeGreaterThanOrEqual(1)
  })
})

describe('upgrading an app made by this version', () => {
  const scaffold = async (name: string): Promise<string> => {
    const dir = mkdtempSync(join(scratch, `${name}-`))
    const run = session(dir)
    expect(await runCli(['init', name, '--template', 'blank', '-y'], run.io), run.err()).toBe(0)
    return join(dir, name)
  }

  it('replaces a pristine older copy, refuses an edited one, backs it up with --force, and a second run changes nothing', async () => {
    const app = await scaffold('current-app')
    const up = session(app)
    expect(await runCli(['upgrade'], up.io), up.err()).toBe(0)
    expect(up.out()).toContain('everything is up to date')

    // An older copy nobody edited: recorded in the lock as the copy, as a previous release left it.
    const file = join(app, 'plugins', 'router', 'src', 'index.ts')
    const fresh = readFileSync(file, 'utf8')
    const older = `${fresh}\n// older copy\n`
    writeFileSync(file, older)
    const lock = readLock(join(app, 'plugins'))
    const entry = lock.plugins.router
    expect(entry).toBeDefined()
    if (entry !== undefined) entry.files['src/index.ts'] = digest(older)
    writeFileSync(join(app, 'plugins', LOCK_FILE), `${JSON.stringify({ version: 1, plugins: lock.plugins }, null, 2)}\n`)
    const replace = session(app)
    expect(await runCli(['upgrade'], replace.io), replace.err()).toBe(0)
    expect(replace.out()).toContain('upgraded')
    expect(readFileSync(file, 'utf8')).not.toContain('// older copy')

    // An edit is refused without --force, and --force saves it under .acryl/upgrade-backup/.
    writeFileSync(file, `${fresh}\n// my own change\nexport const mine = 1\n`)
    const refused = session(app)
    expect(await runCli(['upgrade'], refused.io)).toBe(1)
    expect(refused.out()).toContain('EDITED HERE')
    expect(refused.err()).toContain('nothing was changed')
    const forced = session(app)
    expect(await runCli(['upgrade', '--force'], forced.io), forced.err()).toBe(0)
    expect(readFileSync(file, 'utf8')).not.toContain('export const mine = 1')
    const backups = readdirSync(join(app, '.acryl', 'upgrade-backup'))
    expect(backups).toHaveLength(1)
    expect(
      readFileSync(join(app, '.acryl', 'upgrade-backup', backups[0] as string, 'router', 'src', 'index.ts'), 'utf8'),
    ).toContain('export const mine = 1')

    const again = session(app)
    expect(await runCli(['upgrade'], again.io)).toBe(0)
    expect(again.out()).toContain('everything is up to date')
  }, 20_000)

  it('keeps a file of its own that sits in a library plugin folder, and reports it', async () => {
    const app = await scaffold('current-own-file')
    writeFileSync(join(app, 'plugins', 'extensions', 'notes-of-mine.md'), 'mine\n')
    const run = session(app)
    expect(await runCli(['upgrade'], run.io), run.err()).toBe(0)
    expect(readFileSync(join(app, 'plugins', 'extensions', 'notes-of-mine.md'), 'utf8')).toBe('mine\n')
  })
})

describe('upgrade refusals', () => {
  it('refuses a folder that is not an app, an unknown plugin name, and the old src/plugins layout', async () => {
    const empty = mkdtempSync(join(scratch, 'empty-'))
    const none = session(empty)
    expect(await runCli(['upgrade'], none.io)).toBe(1)
    expect(none.err()).toContain('is not an app')
    const dir = mkdtempSync(join(scratch, 'unknown-'))
    expect(await runCli(['init', 'unknown', '--template', 'blank', '-y'], session(dir).io)).toBe(0)
    const app = join(dir, 'unknown')
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
    expect(lock.plugins.router?.from).toBe(VERSION)
    expect(Object.keys(lock.plugins.router?.files ?? {})).toContain('src/index.ts')
    // A fresh app has nothing to upgrade.
    const check = session(join(dir, 'fresh'))
    expect(await runCli(['upgrade'], check.io), check.err()).toBe(0)
    expect(check.out()).toContain('everything is up to date')
  })
})
