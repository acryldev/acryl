import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDesktopUserDataOverride } from '../src/desktop-user-data.ts'

describe('resolveDesktopUserDataOverride', () => {
  it('returns undefined when the env var is missing or blank', () => {
    expect(resolveDesktopUserDataOverride({})).toBeUndefined()
    expect(resolveDesktopUserDataOverride({ DSH_DESKTOP_USER_DATA: '' })).toBeUndefined()
    expect(resolveDesktopUserDataOverride({ DSH_DESKTOP_USER_DATA: '   ' })).toBeUndefined()
  })

  it('resolves an absolute isolated user-data directory', () => {
    expect(resolveDesktopUserDataOverride({
      DSH_DESKTOP_USER_DATA: '/tmp/dsh-desktop-acr',
    })).toBe(resolve('/tmp/dsh-desktop-acr'))
  })
})
