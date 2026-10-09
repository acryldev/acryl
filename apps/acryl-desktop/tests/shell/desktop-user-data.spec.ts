import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDesktopUserDataOverride } from '../../src/shell/desktop-user-data.ts'

const appData = '/Users/someone/Library/Application Support'

describe('resolveDesktopUserDataOverride', () => {
  it('returns undefined when the env var is missing or blank', () => {
    expect(resolveDesktopUserDataOverride({})).toBeUndefined()
    expect(resolveDesktopUserDataOverride({ DSH_DESKTOP_USER_DATA: '' })).toBeUndefined()
    expect(resolveDesktopUserDataOverride({ DSH_DESKTOP_USER_DATA: '   ' })).toBeUndefined()
  })

  it('never asks for the application-data folder when an explicit override is given (Electron throws for it on Windows under a redirected profile)', () => {
    const appData = () => { throw new Error("Failed to get 'appData' path") }
    expect(resolveDesktopUserDataOverride({ DSH_DESKTOP_USER_DATA: '/tmp/dsh-desktop-acryl' }, { appData, userDataName: 'ACRYL-x', productName: 'ACRYL' })).toBe(resolve('/tmp/dsh-desktop-acryl'))
    expect(resolveDesktopUserDataOverride({}, { appData, userDataName: 'ACRYL', productName: 'ACRYL' })).toBeUndefined()
  })

  it('resolves an absolute isolated user-data directory', () => {
    expect(resolveDesktopUserDataOverride({
      DSH_DESKTOP_USER_DATA: '/tmp/dsh-desktop-acryl',
    })).toBe(resolve('/tmp/dsh-desktop-acryl'))
  })

  it('leaves the default instance alone: its folder is already named after the product', () => {
    expect(resolveDesktopUserDataOverride({}, { appData: () => appData, userDataName: 'ACRYL', productName: 'ACRYL' })).toBeUndefined()
  })

  it('gives an instance with its own user-data name a folder of its own, so it cannot share the installed app\'s data', () => {
    expect(resolveDesktopUserDataOverride({}, { appData: () => appData, userDataName: 'ACRYL-live-check', productName: 'ACRYL' }))
      .toBe(join(appData, 'ACRYL-live-check'))
    expect(resolveDesktopUserDataOverride({}, { appData: () => appData, userDataName: 'ACRYL Development harness-latest-2026-10', productName: 'ACRYL' }))
      .toBe(join(appData, 'ACRYL Development harness-latest-2026-10'))
  })

  it('lets an explicit override win over the instance folder', () => {
    expect(resolveDesktopUserDataOverride(
      { DSH_DESKTOP_USER_DATA: '/tmp/explicit' },
      { appData: () => appData, userDataName: 'ACRYL-live-check', productName: 'ACRYL' },
    )).toBe(resolve('/tmp/explicit'))
  })
})
