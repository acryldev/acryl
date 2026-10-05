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

  it('resolves an absolute isolated user-data directory', () => {
    expect(resolveDesktopUserDataOverride({
      DSH_DESKTOP_USER_DATA: '/tmp/dsh-desktop-acryl',
    })).toBe(resolve('/tmp/dsh-desktop-acryl'))
  })

  it('leaves the default instance alone: its folder is already named after the product', () => {
    expect(resolveDesktopUserDataOverride({}, { appData, userDataName: 'ACRYL', productName: 'ACRYL' })).toBeUndefined()
  })

  it('gives an instance with its own user-data name a folder of its own, so it cannot share the installed app\'s data', () => {
    expect(resolveDesktopUserDataOverride({}, { appData, userDataName: 'ACRYL-live-check', productName: 'ACRYL' }))
      .toBe(join(appData, 'ACRYL-live-check'))
    expect(resolveDesktopUserDataOverride({}, { appData, userDataName: 'ACRYL Development harness-latest-2026-10', productName: 'ACRYL' }))
      .toBe(join(appData, 'ACRYL Development harness-latest-2026-10'))
  })

  it('lets an explicit override win over the instance folder', () => {
    expect(resolveDesktopUserDataOverride(
      { DSH_DESKTOP_USER_DATA: '/tmp/explicit' },
      { appData, userDataName: 'ACRYL-live-check', productName: 'ACRYL' },
    )).toBe(resolve('/tmp/explicit'))
  })
})
