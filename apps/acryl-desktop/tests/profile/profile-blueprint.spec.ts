/**
 * Desktop consumes the selected Blueprint through the same pure composition Web and the CLI use (spec 036). Without a
 * selection the profile is the full product exactly as before; `acryl.blank` leaves out the workspace, admin panel,
 * Market and shortcut/anchor rows, keeps the extension pack, and wears the configured brand.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { BLANK_BLUEPRINT, IDE_BLUEPRINT, withBrand, brandIdentity } from 'acryl-harness-runtime'
import { prepareDesktopProfile } from '../../src/profile.ts'

const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { force: true, recursive: true }) })

function rowsFor(blueprint: typeof IDE_BLUEPRINT) {
  const home = mkdtempSync(join(tmpdir(), 'acryl-desktop-blueprint-'))
  homes.push(home)
  const prepared = prepareDesktopProfile(undefined, home, 'darwin', undefined, undefined, undefined, undefined, {}, blueprint)
  return new Map(composeEntries([prepared.patches]).map(row => [row.id, row]))
}

describe('desktop profile under a Blueprint', () => {
  it('the full product keeps every ACRYL row', () => {
    const rows = rowsFor(IDE_BLUEPRINT)
    for (const id of ['acryl-workspace', 'acryl-plugin-admin', 'extension-context', 'acryl-system-prompt', '@acryl/ui', 'ui-acryl']) {  // `acryl-shortcuts` and `acryl-mount-anchors` are DETACHED on the DSH 0.2 branch (spec 001 R25)
      expect(rows.has(id), id).toBe(true)
    }
    expect(rows.get('ui-brand-official')?.disabled).toBe(true)
    expect(rows.get('ui-acryl')?.disabled).toBe(false)
    expect(rows.has('brand')).toBe(false)
  })

  it('blank keeps the stem cell, swaps the brand row, and leaves the product rows out', () => {
    const rows = rowsFor(withBrand(BLANK_BLUEPRINT, brandIdentity({ name: 'Orbit', accent: '#e8590c' })))
    for (const id of ['extension-context', 'acryl-system-prompt', '@acryl/ui', 'authorization', 'brand']) expect(rows.has(id), id).toBe(true)
    for (const id of ['acryl-workspace', 'acryl-plugin-admin', 'acryl-shortcuts', 'acryl-mount-anchors', 'ui-acryl']) expect(rows.has(id), id).toBe(false)
    expect(rows.get('ui-brand-official')?.disabled).toBe(true)
    expect(rows.get('brand')?.config).toMatchObject({ name: 'Orbit', accent: '#e8590c' })
  })
})
