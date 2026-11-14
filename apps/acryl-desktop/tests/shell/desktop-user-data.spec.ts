import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { carryLegacyUserData, legacyUserDataDirectory, resolveDesktopUserData } from '../../src/shell/desktop-user-data.ts'

const instance = { userDataDir: '/Users/someone/.acryl/desktop-data' }

describe('resolveDesktopUserData', () => {
  it('is the instance folder inside its home when the override is missing or blank', () => {
    expect(resolveDesktopUserData({}, instance)).toBe(instance.userDataDir)
    expect(resolveDesktopUserData({ DSH_DESKTOP_USER_DATA: '' }, instance)).toBe(instance.userDataDir)
    expect(resolveDesktopUserData({ DSH_DESKTOP_USER_DATA: '   ' }, instance)).toBe(instance.userDataDir)
  })

  it('lets an explicit override win over the instance folder', () => {
    expect(resolveDesktopUserData({ DSH_DESKTOP_USER_DATA: '/tmp/explicit' }, instance)).toBe(resolve('/tmp/explicit'))
  })
})

describe('carryLegacyUserData', () => {
  const roots: string[] = []
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
  const scratch = (): string => { const root = mkdtempSync(join(tmpdir(), 'acryl-user-data-')); roots.push(root); return root }

  it('copies the old OS-folder data into the home once, without the process locks, and leaves the old folder in place', () => {
    const root = scratch()
    const legacy = legacyUserDataDirectory(join(root, 'Application Support'), 'ACRYL')
    mkdirSync(join(legacy, 'Local Storage'), { recursive: true })
    writeFileSync(join(legacy, 'Local Storage', 'state'), 'kept')
    writeFileSync(join(legacy, 'SingletonLock'), 'held')
    const target = join(root, '.acryl', 'desktop-data')
    expect(carryLegacyUserData(target, legacy)).toBe(legacy)
    expect(readFileSync(join(target, 'Local Storage', 'state'), 'utf8')).toBe('kept')
    expect(existsSync(join(target, 'SingletonLock'))).toBe(false)
    expect(existsSync(join(legacy, 'Local Storage', 'state'))).toBe(true)
    writeFileSync(join(legacy, 'Local Storage', 'state'), 'newer in the old folder')
    expect(carryLegacyUserData(target, legacy)).toBeUndefined()
    expect(readFileSync(join(target, 'Local Storage', 'state'), 'utf8')).toBe('kept')
  })

  it('does nothing without an old folder', () => {
    const root = scratch()
    expect(carryLegacyUserData(join(root, 'target'), join(root, 'missing'))).toBeUndefined()
    expect(carryLegacyUserData(join(root, 'target'), undefined)).toBeUndefined()
    expect(existsSync(join(root, 'target'))).toBe(false)
  })
})
