// BLEND profile composition (spec 003, D23-D26): the selected Blend's lock
// becomes one insert patch layer between the settings patch and the desktop
// invariants, with fail-loud errors attributed to the Blend.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { fileURLToPath } from 'node:url'

import {
  desktopStartupSettingsFromSettings,
  parseDesktopBlend,
  prepareDesktopProfile,
} from '../src/profile.ts'

const homes: string[] = []
const BLEND_FIXTURE_DIR = fileURLToPath(new URL('./fixtures/blend/acryl-demo', import.meta.url))

function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-profile-blend-'))
  homes.push(home)
  return home
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function writeSettings(home: string, text: string): void {
  writeFileSync(join(home, 'settings.yaml'), text)
}

describe('desktop startup settings: dsh-desktop.blend (D23)', () => {
  it('parses the blend selection, null, and absence; rejects malformed values', () => {
    expect(parseDesktopBlend(undefined)).toBeNull()
    expect(parseDesktopBlend(null)).toBeNull()
    expect(parseDesktopBlend('/blend/acryl-crm')).toBe('/blend/acryl-crm')
    expect(() => parseDesktopBlend('')).toThrow('dsh-desktop.blend')
    expect(() => parseDesktopBlend(42)).toThrow('dsh-desktop.blend')
    expect(() => parseDesktopBlend({ path: '/blend' })).toThrow('dsh-desktop.blend')
  })

  it('reads the blend key from the settings document with mode and port', () => {
    expect(desktopStartupSettingsFromSettings({
      'dsh-desktop': { mode: 'advanced', port: 1, blend: '/blend/acryl-crm' },
    })).toEqual({ mode: 'advanced', port: 1, blend: '/blend/acryl-crm' })
    expect(desktopStartupSettingsFromSettings({})).toEqual({
      mode: 'advanced',
      port: expect.any(Number),
      blend: null,
    })
  })
})

describe('desktop profile BLEND composition (D24)', () => {
  it('composes the acryl.demo lock rows into the generation and projects the blend', () => {
    const home = temporaryHome()
    const prepared = prepareDesktopProfile(undefined, home, 'darwin')
    expect(prepared.blend).toBeUndefined()

    writeSettings(home, `dsh-desktop:\n  blend: ${BLEND_FIXTURE_DIR}\n`)
    const blended = prepareDesktopProfile(undefined, home, 'darwin')
    expect(blended.blend).toBeDefined()
    expect(blended.blend?.origin).toEqual(expect.objectContaining({
      id: 'acryl.demo',
      kind: 'Blueprint',
    }))
    expect(blended.blend?.rows.map(row => row.id)).toEqual(['contacts', 'tasks', 'pipeline', 'invoicing'])

    const composed = composeEntries([blended.patches])
    const ids = composed.map(row => row.id)
    for (const id of ['contacts', 'tasks', 'pipeline', 'invoicing']) {
      expect(ids).toContain(id)
    }
    // The locked config travels with the row, and the locked disabled state
    // survives composition (invoicing is locked disabled by acryl.demo's
    // default parameters).
    expect(composed.find(row => row.id === 'contacts')).toEqual(expect.objectContaining({
      name: 'acryl-blend-demo',
      config: {
        title: 'Contacts',
        org: 'My Organization',
        greeting: 'Hello from My Organization',
      },
    }))
    expect(composed.find(row => row.id === 'invoicing')).toEqual(expect.objectContaining({
      disabled: true,
    }))
    // The blend layer rides after the settings patch, before the brand rows.
    expect(ids.indexOf('contacts')).toBeGreaterThan(ids.indexOf('settings'))
    expect(ids.indexOf('contacts')).toBeLessThan(ids.indexOf('ui-acryl'))
  })

  it('fails the generation loudly for a missing lock and a colliding row id', () => {
    const home = temporaryHome()
    writeSettings(home, 'dsh-desktop:\n  blend: /no/such/blend\n')
    expect(() => prepareDesktopProfile(undefined, home, 'darwin')).toThrow("BLEND path '/no/such/blend'")

    const colliding = mkdtempSync(join(tmpdir(), 'dsh-desktop-blend-collision-'))
    const lockDir = join(colliding, 'collider')
    mkdirSync(join(lockDir, '.acryl'), { recursive: true })
    writeFileSync(join(lockDir, '.acryl', 'blend.lock.json'), JSON.stringify({
      formatVersion: 1,
      generator: { name: '@acryl/blends-core', version: '0.1.0' },
      origin: { id: 'acme.crm', kind: 'Blend', version: '0.1.0', digest: `sha256:${'b'.repeat(64)}` },
      rows: [{ id: 'webserver', name: '@evil/webserver' }],
    }))
    writeSettings(home, `dsh-desktop:\n  blend: ${lockDir}\n`)
    expect(() => prepareDesktopProfile(undefined, home, 'darwin'))
      .toThrow("BLEND 'acme.crm' row 'webserver' collides with an existing profile row")
    rmSync(colliding, { recursive: true, force: true })
  })

  it('accepts the blend selection both as directory and lock file path', () => {
    const home = temporaryHome()
    writeSettings(home, `dsh-desktop:\n  blend: ${join(BLEND_FIXTURE_DIR, '.acryl/blend.lock.json')}\n`)
    const prepared = prepareDesktopProfile(undefined, home, 'darwin')
    expect(prepared.blend?.lockPath).toBe(join(BLEND_FIXTURE_DIR, '.acryl/blend.lock.json'))
  })
})
