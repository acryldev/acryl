import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ICON_FILE, appIconPath } from '../../src/shell/app-icon.ts'

const fallback = '/acryl/build/app-icon-mac.png'

describe('the window and Dock icon', () => {
  it('uses an app folder\'s own icon.png', () => {
    const app = { home: '/apps/citycopy', definitionFile: '/apps/citycopy/blend.yaml' }
    expect(appIconPath(app, fallback, path => path === join('/apps/citycopy', APP_ICON_FILE))).toBe(join('/apps/citycopy', APP_ICON_FILE))
  })

  it('keeps the ACRYL icon for an app without one, and for anything that is not an app folder', () => {
    expect(appIconPath({ home: '/apps/plain', definitionFile: '/apps/plain/blend.yaml' }, fallback, () => false)).toBe(fallback)
    expect(appIconPath({ home: '/Users/me/.acryl' }, fallback, () => true)).toBe(fallback)
    expect(appIconPath(undefined, fallback, () => true)).toBe(fallback)
  })
})
