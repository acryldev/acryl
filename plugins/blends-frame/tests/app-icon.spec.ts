import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ICON_FILE, AppIconRefused, iconBytes, saveAppIcon } from '../src/app-icon.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7])

describe("the app's own icon", () => {
  it('keeps a PNG as assets/icon.png, replacing the earlier one with no temporary file left', async () => {
    const root = mkdtempSync(join(tmpdir(), 'app-icon-'))
    try {
      await saveAppIcon(root, iconBytes(PNG.toString('base64')))
      await saveAppIcon(root, iconBytes(Buffer.concat([PNG, Buffer.from([9])]).toString('base64')))
      expect(readFileSync(join(root, APP_ICON_FILE))).toEqual(Buffer.concat([PNG, Buffer.from([9])]))
      expect(readdirSync(join(root, 'assets'))).toEqual(['icon.png'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses what is not a PNG, nothing at all, and an image over 2 MB, in words for a person', () => {
    expect(() => iconBytes(Buffer.from('<svg/>').toString('base64'))).toThrow(AppIconRefused)
    expect(() => iconBytes(undefined)).toThrow(/choose an image/u)
    expect(() => iconBytes('A'.repeat(3 * 1024 * 1024))).toThrow(/too large/u)
  })
})
