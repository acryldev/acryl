import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAcryl } from '../src/cli/run.ts'
import { parseAcrylArgs } from '../src/cli/grammar.ts'

const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })

const FAILURE = 'failed to apply loader entry acryl-engine (a): failed to apply loader entry include (b): failed to apply loader entry acryl-broken (acryl-broken): TypeError: boom'

function brokenHome(): { home: string; state: string } {
  const home = mkdtempSync(join(tmpdir(), 'acryl-cli-rescue-'))
  homes.push(home)
  mkdirSync(join(home, 'profiles', 'acryl'), { recursive: true })
  writeFileSync(join(home, 'profiles', 'acryl', 'package.json'), '{}')
  mkdirSync(join(home, 'logs'), { recursive: true })
  writeFileSync(join(home, 'logs', 'dsh-2026-09-27.error.log'), `${FAILURE}\n`)
  return { home, state: join(home, 'plugin-lifecycle', 'state.json') }
}

function cli(confirm: (q: string) => Promise<boolean> = async () => false) {
  const out: string[] = []
  const codes: number[] = []
  return { out, codes, run: (args: string[]) => runAcryl(args, { write: line => { out.push(line) }, exit: code => { codes.push(code) }, confirm }) }
}

describe('grammar', () => {
  it('parses doctor and repair with their own options', () => {
    expect(parseAcrylArgs(['doctor', '--profile', 'dev', '--home', '/h', '--json'])).toMatchObject({ kind: 'doctor', profile: 'dev', home: '/h', json: true })
    expect(parseAcrylArgs(['repair', '--dry-run'])).toMatchObject({ kind: 'repair', dryRun: true, yes: false, recipes: [] })
    expect(parseAcrylArgs(['repair', '--yes', '--recipe', 'disable-failing-row', '--recipe', 'restore-override-file'])).toMatchObject({ yes: true, recipes: ['disable-failing-row', 'restore-override-file'] })
    expect(parseAcrylArgs(['repair', '--undo', '2026-x'])).toMatchObject({ undo: '2026-x' })
  })

  it('refuses an unattended run that does not name its recipes, and options on the wrong command', () => {
    expect(() => parseAcrylArgs(['repair', '--yes'])).toThrow('--recipe')
    expect(() => parseAcrylArgs(['repair', '--undo', 'x', '--yes', '--recipe', 'a'])).toThrow('--undo cannot be combined')
    expect(() => parseAcrylArgs(['doctor', '--dry-run'])).toThrow('takes no repair options')
    expect(() => parseAcrylArgs(['plugin', 'list', '--yes'])).toThrow('belong to')
    expect(() => parseAcrylArgs(['repair', 'now'])).toThrow('unexpected argument')
    expect(() => parseAcrylArgs(['repair', '--recipe'])).toThrow('requires a value')
  })
})

describe('acryl doctor', () => {
  it('names the failing plugin and the command that fixes it, without changing anything, and exits non-zero', async () => {
    const { home } = brokenHome()
    const c = cli()
    await c.run(['doctor', '--home', home])
    const text = c.out.join('\n')
    expect(text).toContain('ERROR plugin-activation-failed (acryl-broken)')
    expect(text).toContain('Fix: acryl repair --recipe disable-failing-row')
    expect(c.codes).toEqual([1])
    expect(existsSync(join(home, 'repair-backups'))).toBe(false)
  })

  it('says all is well for a healthy profile, and can print JSON', async () => {
    const { home } = brokenHome()
    rmSync(join(home, 'logs'), { recursive: true })
    const c = cli()
    await c.run(['doctor', '--home', home, '--json'])
    expect(JSON.parse(c.out.join('\n'))).toMatchObject({ kind: 'diagnosis', diagnosis: { findings: [] } })
    expect(c.codes).toEqual([])
    const plain = cli()
    await plain.run(['doctor', '--home', home])
    expect(plain.out.join('\n')).toContain('No problems found.')
  })
})

describe('acryl repair', () => {
  it('--dry-run prints the plan naming the file and row, and changes nothing', async () => {
    const { home, state } = brokenHome()
    const c = cli()
    await c.run(['repair', '--home', home, '--dry-run'])
    expect(c.out.join('\n')).toContain('[disable-failing-row]')
    expect(c.out.join('\n')).toContain('acryl-broken')
    expect(c.out.join('\n')).toContain(state)
    expect(existsSync(state)).toBe(false)
  })

  it('asks first, changes nothing when the answer is no, and does it (with an undo) when it is yes', async () => {
    const { home, state } = brokenHome()
    const no = cli(async () => false)
    await no.run(['repair', '--home', home])
    expect(existsSync(state)).toBe(false)
    expect(no.codes).toEqual([1])

    const asked: string[] = []
    const yes = cli(async (q) => { asked.push(q); return true })
    await yes.run(['repair', '--home', home])
    expect(asked[0]).toContain('Apply these changes?')
    expect(JSON.parse(readFileSync(state, 'utf8')).profiles[0].disabledEntries).toEqual(['acryl-broken'])
    const backupId = /Backup: (\S+)/.exec(yes.out.join('\n'))![1]!
    const undo = cli()
    await undo.run(['repair', '--home', home, '--undo', backupId])
    expect(existsSync(state)).toBe(false)
    expect(undo.out.join('\n')).toContain('Restored 1 file(s)')
  })

  it('an unattended run does exactly the named recipes and never asks', async () => {
    const { home, state } = brokenHome()
    const confirm = vi.fn(async () => false)
    const c = cli(confirm)
    await c.run(['repair', '--home', home, '--yes', '--recipe', 'disable-failing-row'])
    expect(confirm).not.toHaveBeenCalled()
    expect(existsSync(state)).toBe(true)
    // Naming the other recipe when it has nothing to do plans nothing.
    const later = cli(confirm)
    await later.run(['repair', '--home', home, '--yes', '--recipe', 'restore-override-file'])
    expect(later.out.join('\n')).toContain('Nothing')
  })

  it('refuses an unknown recipe by name', async () => {
    const { home } = brokenHome()
    await expect(cli().run(['repair', '--home', home, '--recipe', 'format-disk'])).rejects.toThrow('unknown recipe "format-disk"')
  })

  it('refuses to undo a backup that does not exist', async () => {
    const { home } = brokenHome()
    await expect(cli().run(['repair', '--home', home, '--undo', 'nope'])).rejects.toThrow('no complete backup')
  })
})
