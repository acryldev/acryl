import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearProfilePatchDisable,
  pluginLifecyclePatches,
  readDisabledPluginLifecycleEntries,
  resolvePluginLifecycleStatePath,
  setPluginLifecycleEntryEnabled,
} from '../src/plugin-lifecycle-state.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function statePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-lifecycle-'))
  roots.push(root)
  return join(root, 'state', 'lifecycle.json')
}

describe('plugin lifecycle state', () => {
  it('resolves one override file per engine home, shared by every surface', () => {
    // The profile, not the surface, owns the overrides (spec 034, FR-003): a
    // CLI, Web, and Desktop process booting the same engine home must read and
    // write the same file.
    expect(resolvePluginLifecycleStatePath('/home/u/.acryl/.dsh'))
      .toBe(join('/home/u/.acryl/.dsh', 'plugin-lifecycle', 'state.json'))

    const previous = { ACRYL_HOME: process.env.ACRYL_HOME, DSH_HOME: process.env.DSH_HOME }
    try {
      delete process.env.DSH_HOME
      process.env.ACRYL_HOME = '/tmp/acryl-home'
      expect(resolvePluginLifecycleStatePath())
        .toBe(join(resolve('/tmp/acryl-home'), '.dsh', 'plugin-lifecycle', 'state.json'))

      // An isolated or dev run sets only DSH_HOME. Resolving it from the ACRYL
      // root instead would write overrides into the operator's real install.
      delete process.env.ACRYL_HOME
      process.env.DSH_HOME = '/tmp/acryl-dev/.dsh'
      expect(resolvePluginLifecycleStatePath())
        .toBe(join(resolve('/tmp/acryl-dev/.dsh'), 'plugin-lifecycle', 'state.json'))
    } finally {
      if (previous.ACRYL_HOME === undefined) delete process.env.ACRYL_HOME
      else process.env.ACRYL_HOME = previous.ACRYL_HOME
      if (previous.DSH_HOME === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous.DSH_HOME
    }
  })

  it('treats a missing state file as no overrides', () => {
    const path = statePath()
    expect([...readDisabledPluginLifecycleEntries({ profileName: 'desktop', statePath: path })]).toEqual([])
    expect(pluginLifecyclePatches({ profileName: 'desktop', statePath: path }, new Set(['acryl-development-canvas']))).toEqual([])
  })

  it('persists a managed disable and removes it on enable', async () => {
    const path = statePath()
    const bootstrap = { profileName: 'desktop', statePath: path }

    await setPluginLifecycleEntryEnabled(
      bootstrap,
      'include:acryl-development-canvas',
      false,
    )

    expect([...readDisabledPluginLifecycleEntries(bootstrap)]).toEqual([
      'include:acryl-development-canvas',
    ])
    expect(pluginLifecyclePatches(bootstrap, new Set(['acryl-development-canvas']))).toEqual([{
      id: 'acryl-development-canvas',
      disabled: true,
    }])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      version: 1,
      profiles: [{
        profileName: 'desktop',
        disabledEntries: ['include:acryl-development-canvas'],
      }],
    })

    await setPluginLifecycleEntryEnabled(
      bootstrap,
      'include:acryl-development-canvas',
      true,
    )
    expect([...readDisabledPluginLifecycleEntries(bootstrap)]).toEqual([])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, profiles: [] })
  })

  it('keeps profile overrides isolated', async () => {
    const path = statePath()
    await setPluginLifecycleEntryEnabled(
      { profileName: 'work', statePath: path },
      'include:acryl-development-canvas',
      false,
    )

    expect(pluginLifecyclePatches({ profileName: 'desktop', statePath: path }, new Set(['acryl-development-canvas']))).toEqual([])
    expect(pluginLifecyclePatches({ profileName: 'work', statePath: path }, new Set(['acryl-development-canvas']))).toHaveLength(1)
  })

  it('keeps any well-formed entry id, drops malformed ones, fails closed on corruption', async () => {
    const path = statePath()
    mkdirSync(join(path, '..'), { recursive: true })

    // The mutable set is derived at runtime from the profile bundle list, not
    // from this file, so a disabled id for any plugin the user added is kept -
    // it is not restricted to a hard-coded allowlist. A structurally invalid
    // string (bad charset, over length) is dropped so it cannot reach the
    // Loader as a patch id.
    writeFileSync(path, JSON.stringify({
      version: 1,
      profiles: [{
        profileName: 'desktop',
        disabledEntries: [
          'include:cordis-plugin-graph',
          'include:acryl-development-canvas',
          'include:has spaces',
        ],
      }],
    }))
    expect([...readDisabledPluginLifecycleEntries({ profileName: 'desktop', statePath: path })].sort())
      .toEqual(['include:acryl-development-canvas', 'include:cordis-plugin-graph'])

    // A non-string element is genuine corruption and still throws.
    writeFileSync(path, JSON.stringify({
      version: 1,
      profiles: [{ profileName: 'desktop', disabledEntries: [42] }],
    }))
    expect(() => readDisabledPluginLifecycleEntries({ profileName: 'desktop', statePath: path }))
      .toThrow('disabledEntries')

    writeFileSync(path, JSON.stringify({ version: 1, profiles: [], extra: true }))
    expect(() => readDisabledPluginLifecycleEntries({ profileName: 'desktop', statePath: path }))
      .toThrow('version or profiles')

    writeFileSync(path, JSON.stringify({
      version: 1,
      profiles: [{ profileName: 'desktop', disabledEntries: [], extra: true }],
    }))
    expect(() => readDisabledPluginLifecycleEntries({ profileName: 'desktop', statePath: path }))
      .toThrow('profile name')

    await expect(setPluginLifecycleEntryEnabled(
      { profileName: 'desktop', statePath: path },
      'has spaces and slashes//',
      false,
    )).rejects.toThrow('malformed')
  })

  it('clears a disable the old DSH page wrote for one row, keeping comments and every other row and key (T089)', async () => {
    const dir = dirname(statePath())
    mkdirSync(dir, { recursive: true })
    const patch = join(dir, 'cordis.patch.yml')
    expect(await clearProfilePatchDisable(dir, 'probe')).toBe(false)
    writeFileSync(patch, [
      '# my profile',
      '- insert:',
      '    - id: probe',
      '      name: probe',
      '# switched off on the Plugins page',
      '- id: probe',
      '  disabled: true',
      '- id: other',
      '  disabled: true',
      '- id: probe',
      '  name: probe',
      '  config: { limit: 3 }',
      '  disabled: true',
      '',
    ].join('\n'))
    expect(await clearProfilePatchDisable(dir, 'probe')).toBe(true)
    const text = readFileSync(patch, 'utf8')
    expect(text).toMatch(/# my profile/u)
    expect(text).toMatch(/# switched off on the Plugins page\n- id: other/u)
    expect(text).toMatch(/- id: other\n {2}disabled: true/u)
    expect(text).toMatch(/- id: probe\n {2}name: probe\n {2}config: \{ limit: 3 \}\n/u)
    expect(text.match(/disabled: true/gu)).toHaveLength(1)
    expect(text).toMatch(/- insert:/u)
    expect(await clearProfilePatchDisable(dir, 'probe')).toBe(false)
  })

  it('reads a disable kept under a renamed row\'s old id as the new row (spec 044 step 1b)', async () => {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ version: 1, profiles: [{ profileName: 'web', disabledEntries: ['include:extension-context', 'include:other'] }] }))
    const persistence = { profileName: 'web', statePath: path }
    expect([...readDisabledPluginLifecycleEntries(persistence)]).toEqual(['include:acryl-plugin-context', 'include:other'])
    expect(pluginLifecyclePatches(persistence, new Set(['acryl-plugin-context', 'other']))).toEqual([{ id: 'acryl-plugin-context', disabled: true }, { id: 'other', disabled: true }])
    await setPluginLifecycleEntryEnabled(persistence, 'include:other', true)
    expect(JSON.parse(readFileSync(path, 'utf8')).profiles[0].disabledEntries).toEqual(['include:acryl-plugin-context'])
  })

  it('reads a disabled Development Canvas kept under its old row id as the row by its package name (spec 048 T014)', async () => {
    // The stored form found in a real dev home: the canvas was turned off while its row id was still `desktop-development-canvas`.
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ version: 1, profiles: [{ profileName: 'desktop', disabledEntries: ['include:desktop-development-canvas'] }] }))
    const persistence = { profileName: 'desktop', statePath: path }
    expect([...readDisabledPluginLifecycleEntries(persistence)]).toEqual(['include:acryl-development-canvas'])
    expect(pluginLifecyclePatches(persistence, new Set(['acryl-development-canvas']))).toEqual([{ id: 'acryl-development-canvas', disabled: true }])
    await setPluginLifecycleEntryEnabled(persistence, 'include:other', false)
    expect(JSON.parse(readFileSync(path, 'utf8')).profiles[0].disabledEntries).toEqual(['include:acryl-development-canvas', 'include:other'])
  })

  it('composes no disable for a row the profile does not have, and keeps it stored for when the plugin comes back (spec 048 T014)', async () => {
    // The Development Canvas is a Market plugin: a home that disabled it and then uninstalled it booted with
    // `patch: entry "desktop-development-canvas" not found` on every start.
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ version: 1, profiles: [{ profileName: 'desktop', disabledEntries: ['include:desktop-development-canvas', 'include:other'] }] }))
    const persistence = { profileName: 'desktop', statePath: path }
    expect(pluginLifecyclePatches(persistence, new Set(['other', 'desktop-shell']))).toEqual([{ id: 'other', disabled: true }])
    expect([...readDisabledPluginLifecycleEntries(persistence)]).toEqual(['include:acryl-development-canvas', 'include:other'])
    expect(pluginLifecyclePatches(persistence, new Set(['acryl-development-canvas', 'other'])))
      .toEqual([{ id: 'acryl-development-canvas', disabled: true }, { id: 'other', disabled: true }])
  })
})
