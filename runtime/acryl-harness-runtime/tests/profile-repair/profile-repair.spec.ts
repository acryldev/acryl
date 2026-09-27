import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePluginLifecycleStatePath } from '../../src/plugin-lifecycle-state.ts'
import {
  applyRepairPlan, backupsDir, createBackup, describePlan, inspectProfile, listBackups, planRepairs, restoreBackup, undoRepair,
} from '../../src/profile-repair/index.ts'

const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })

function makeHome(options: { bundles?: string[]; installed?: string[]; state?: string; log?: string; layout?: { recorded: string; declared?: string } } = {}) {
  const dshHome = mkdtempSync(join(tmpdir(), 'acryl-repair-'))
  homes.push(dshHome)
  const profileDir = join(dshHome, 'profiles', 'main')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', ...(options.bundles ?? [])] } } }))
  for (const name of options.installed ?? []) {
    mkdirSync(join(profileDir, 'node_modules', ...name.split('/')), { recursive: true })
    writeFileSync(join(profileDir, 'node_modules', ...name.split('/'), 'package.json'), '{}')
  }
  if (options.state !== undefined) {
    mkdirSync(join(dshHome, 'plugin-lifecycle'), { recursive: true })
    writeFileSync(resolvePluginLifecycleStatePath(dshHome), options.state)
  }
  if (options.log !== undefined) {
    mkdirSync(join(dshHome, 'logs'), { recursive: true })
    writeFileSync(join(dshHome, 'logs', 'dsh-2026-09-27.error.log'), options.log)
  }
  if (options.layout !== undefined) {
    mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
    writeFileSync(join(profileDir, 'node_modules', '.modules.yaml'), `nodeLinker: ${options.layout.recorded}\n`)
    writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), options.layout.declared === undefined ? 'packages: []\n' : `nodeLinker: ${options.layout.declared}\n`)
  }
  return { dshHome, profileDir, statePath: resolvePluginLifecycleStatePath(dshHome) }
}

/** A hash of every file under a directory, to prove a read-only operation changed nothing. */
function fingerprint(dir: string): string {
  const parts: string[] = []
  const walk = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name)
      if (statSync(full).isDirectory()) walk(full)
      else parts.push(`${full}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`)
    }
  }
  walk(dir)
  return parts.join('\n')
}

const NESTED_FAILURE = 'failed to apply loader entry acryl-engine (cordis:acryl-engine-dsh): failed to apply loader entry include (cordis:include): failed to apply loader entry acryl-broken (acryl-broken): TypeError: cannot get property theme without inject'
const codes = (findings: readonly { code: string }[]): string[] => findings.map(f => f.code)

describe('inspectProfile', () => {
  it('finds nothing wrong with a healthy profile, and never writes anything', () => {
    const { dshHome } = makeHome({ bundles: ['acryl-ok'], installed: ['acryl-ok'], state: '{"version":1,"profiles":[]}', log: 'all good\n' })
    const before = fingerprint(dshHome)
    expect(inspectProfile({ dshHome, profileName: 'main' }).findings).toEqual([])
    expect(fingerprint(dshHome)).toBe(before)
  })

  it('reports a profile with no directory', () => {
    const { dshHome } = makeHome()
    expect(codes(inspectProfile({ dshHome, profileName: 'ghost' }).findings)).toEqual(['profile-missing'])
  })

  it('reports a corrupt override file with the recipe that fixes it', () => {
    const { dshHome, statePath } = makeHome({ state: '{not json' })
    const [finding] = inspectProfile({ dshHome, profileName: 'main' }).findings
    expect(finding).toMatchObject({ severity: 'error', code: 'state-unreadable', file: statePath, recipe: 'restore-override-file' })
  })

  it('reports a damaged profile manifest and a listed bundle that is not installed', () => {
    const missing = makeHome({ bundles: ['acryl-not-there', '@scope/also-missing'], installed: [] })
    expect(inspectProfile({ dshHome: missing.dshHome, profileName: 'main' }).findings.map(f => [f.code, f.entryId])).toEqual([['bundle-missing', '@scope/also-missing'], ['bundle-missing', 'acryl-not-there']])
    const broken = makeHome()
    writeFileSync(join(broken.profileDir, 'package.json'), '{oops')
    expect(codes(inspectProfile({ dshHome: broken.dshHome, profileName: 'main' }).findings)).toEqual(['profile-manifest-unreadable'])
  })

  it('reports a pnpm layout that disagrees with what is installed, as a warning with guidance', () => {
    const { dshHome } = makeHome({ layout: { recorded: 'hoisted', declared: 'isolated' } })
    const [finding] = inspectProfile({ dshHome, profileName: 'main' }).findings
    expect(finding).toMatchObject({ severity: 'warning', code: 'pnpm-layout-mismatch' })
    expect(finding?.guidance).toContain('Do not reinstall by hand')
    expect(inspectProfile({ dshHome: makeHome({ layout: { recorded: 'isolated' } }).dshHome, profileName: 'main' }).findings).toEqual([])
  })

  it('names the innermost plugin that failed to activate, not the rows that only wrap it', () => {
    const { dshHome } = makeHome({ log: `${NESTED_FAILURE}\n` })
    const [finding] = inspectProfile({ dshHome, profileName: 'main' }).findings
    expect(finding).toMatchObject({ code: 'plugin-activation-failed', entryId: 'acryl-broken', recipe: 'disable-failing-row' })
    expect(finding?.message).toContain('cannot get property theme without inject')
  })

  it('does not offer to disable an engine row, and says what to do instead', () => {
    const { dshHome } = makeHome({ log: 'failed to apply loader entry acryl-engine (x): failed to apply loader entry include (y): failed to apply loader entry webserver (z): listen EADDRINUSE: address already in use 127.0.0.1:3080\n' })
    const [finding] = inspectProfile({ dshHome, profileName: 'main' }).findings
    expect(finding).toMatchObject({ code: 'plugin-activation-failed', entryId: 'webserver' })
    expect(finding?.recipe).toBeUndefined()
    expect(finding?.guidance).toContain('part of the engine')
  })

  it('recognizes the pnpm store mismatch symptom and refuses to call it fixable automatically', () => {
    const { dshHome } = makeHome({ log: 'the package manager did not complete successfully\n' })
    const [finding] = inspectProfile({ dshHome, profileName: 'main' }).findings
    expect(finding).toMatchObject({ code: 'pnpm-store-mismatch', severity: 'warning' })
    expect(finding?.recipe).toBeUndefined()
  })
})

describe('repair', () => {
  it('disables a failing row, keeps a backup, and undo puts everything back', async () => {
    const { dshHome, statePath } = makeHome({ log: `${NESTED_FAILURE}\n` })
    expect(existsSync(statePath)).toBe(false)
    const plan = planRepairs(inspectProfile({ dshHome, profileName: 'main' }))
    expect(plan.steps.map(s => s.recipe)).toEqual(['disable-failing-row'])
    expect(describePlan(plan)).toContain('acryl-broken')
    expect(describePlan(plan)).toContain(statePath)
    const result = await applyRepairPlan(plan)
    expect(JSON.parse(readFileSync(statePath, 'utf8')).profiles).toEqual([{ profileName: 'main', disabledEntries: ['acryl-broken'] }])
    expect(listBackups(dshHome).map(b => b.id)).toEqual([result.backupId])
    await undoRepair(dshHome, result.backupId)
    expect(existsSync(statePath)).toBe(false)
  })

  it('replaces a corrupt override file, keeping the damaged bytes in the backup for undo', async () => {
    const { dshHome, statePath } = makeHome({ state: '{not json' })
    const result = await applyRepairPlan(planRepairs(inspectProfile({ dshHome, profileName: 'main' })))
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual({ version: 1, profiles: [] })
    expect(inspectProfile({ dshHome, profileName: 'main' }).findings).toEqual([])
    await undoRepair(dshHome, result.backupId)
    expect(readFileSync(statePath, 'utf8')).toBe('{not json')
  })

  it('restores the last valid override file from an earlier backup when there is one', async () => {
    const good = JSON.stringify({ version: 1, profiles: [{ profileName: 'main', disabledEntries: ['include:keep-me'] }] })
    const { dshHome, statePath } = makeHome({ state: good })
    await createBackup({ dshHome, profileName: 'main', recipes: ['manual'], files: [statePath] })
    writeFileSync(statePath, '{corrupt')
    await applyRepairPlan(planRepairs(inspectProfile({ dshHome, profileName: 'main' })))
    expect(JSON.parse(readFileSync(statePath, 'utf8')).profiles[0].disabledEntries).toEqual(['include:keep-me'])
  })

  it('fixes an unreadable override file before recording a failing row in it', async () => {
    const { dshHome, statePath } = makeHome({ state: '{corrupt', log: `${NESTED_FAILURE}\n` })
    const plan = planRepairs(inspectProfile({ dshHome, profileName: 'main' }))
    expect(plan.steps.map(s => s.recipe)).toEqual(['restore-override-file', 'disable-failing-row'])
    await applyRepairPlan(plan)
    expect(JSON.parse(readFileSync(statePath, 'utf8')).profiles[0].disabledEntries).toEqual(['acryl-broken'])
  })

  it('plans only the recipes asked for, and nothing when nothing matches', () => {
    const { dshHome } = makeHome({ state: '{corrupt', log: `${NESTED_FAILURE}\n` })
    const diagnosis = inspectProfile({ dshHome, profileName: 'main' })
    expect(planRepairs(diagnosis, ['disable-failing-row']).steps.map(s => s.recipe)).toEqual(['disable-failing-row'])
    expect(planRepairs(inspectProfile({ dshHome: makeHome().dshHome, profileName: 'main' })).steps).toEqual([])
    expect(describePlan({ profileName: 'main', dshHome, steps: [] })).toBe('Nothing to repair.')
  })

  it('rolls back and leaves the file as it was when a step fails after the backup', async () => {
    const good = JSON.stringify({ version: 1, profiles: [{ profileName: 'main', disabledEntries: ['include:keep'] }] })
    const { dshHome, statePath } = makeHome({ state: good })
    const finding = { severity: 'error', code: 'plugin-activation-failed', entryId: 'not a valid id!', recipe: 'disable-failing-row' } as const
    const plan = planRepairs({ profileName: 'main', profileDir: join(dshHome, 'profiles', 'main'), dshHome, findings: [{ ...finding, message: 'x' }] })
    await expect(applyRepairPlan(plan)).rejects.toThrow('rolled back')
    expect(readFileSync(statePath, 'utf8')).toBe(good)
  })

  it('changes nothing when the backup itself cannot be made', async () => {
    const { dshHome, statePath } = makeHome({ state: '{corrupt' })
    const plan = planRepairs(inspectProfile({ dshHome, profileName: 'main' }))
    rmSync(statePath)
    mkdirSync(statePath)
    await expect(applyRepairPlan(plan)).rejects.toThrow()
    expect(statSync(statePath).isDirectory()).toBe(true)
    expect(listBackups(dshHome)).toEqual([])
  })

  it('refuses to apply with nothing to do', async () => {
    await expect(applyRepairPlan({ profileName: 'main', dshHome: makeHome().dshHome, steps: [] })).rejects.toThrow('nothing to repair')
  })
})

describe('backups', () => {
  it('back up existing files and remember which did not exist, so undo removes what a repair created', async () => {
    const { dshHome, statePath } = makeHome({ state: 'before' })
    const created = join(dshHome, 'created-by-repair.txt')
    const backup = await createBackup({ dshHome, profileName: 'main', recipes: ['x'], files: [statePath, created] })
    expect(backup.entries.map(e => e.existed)).toEqual([true, false])
    writeFileSync(statePath, 'after')
    writeFileSync(created, 'new')
    await restoreBackup(dshHome, backup.id)
    expect(readFileSync(statePath, 'utf8')).toBe('before')
    expect(existsSync(created)).toBe(false)
  })

  it('never backs up or restores a file outside the ACRYL home', async () => {
    const { dshHome } = makeHome()
    await expect(createBackup({ dshHome, profileName: 'main', recipes: [], files: ['/etc/hosts'] })).rejects.toThrow('outside the ACRYL home')
    await expect(createBackup({ dshHome, profileName: 'main', recipes: [], files: [join(dshHome, '..', 'elsewhere.txt')] })).rejects.toThrow('outside')
  })

  it('does not list a backup that was interrupted before its manifest was written', async () => {
    const { dshHome, statePath } = makeHome({ state: 'x' })
    const good = await createBackup({ dshHome, profileName: 'main', recipes: [], files: [statePath] })
    mkdirSync(join(backupsDir(dshHome), '20260101T000000Z-dead'), { recursive: true })
    writeFileSync(join(backupsDir(dshHome), '20260101T000000Z-dead', '0-state.json'), 'half')
    expect(listBackups(dshHome).map(b => b.id)).toEqual([good.id])
    await expect(restoreBackup(dshHome, '20260101T000000Z-dead')).rejects.toThrow('no complete backup')
  })

  it('refuses a backup whose stored content was tampered with, and changes nothing', async () => {
    const { dshHome, statePath } = makeHome({ state: 'original' })
    const backup = await createBackup({ dshHome, profileName: 'main', recipes: [], files: [statePath] })
    writeFileSync(join(backupsDir(dshHome), backup.id, backup.entries[0]!.stored!), 'tampered')
    writeFileSync(statePath, 'current')
    await expect(restoreBackup(dshHome, backup.id)).rejects.toThrow('checksum mismatch')
    expect(readFileSync(statePath, 'utf8')).toBe('current')
  })

  it('lists newest first', async () => {
    const { dshHome, statePath } = makeHome({ state: 'x' })
    const older = await createBackup({ dshHome, profileName: 'main', recipes: [], files: [statePath], now: () => new Date('2026-01-01T00:00:00Z') })
    const newer = await createBackup({ dshHome, profileName: 'main', recipes: [], files: [statePath], now: () => new Date('2026-02-01T00:00:00Z') })
    expect(listBackups(dshHome).map(b => b.id)).toEqual([newer.id, older.id])
  })
})
