import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
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
      .toBe('/home/u/.acryl/.dsh/plugin-lifecycle/state.json')

    const previous = { ACRYL_HOME: process.env.ACRYL_HOME, DSH_HOME: process.env.DSH_HOME }
    try {
      delete process.env.DSH_HOME
      process.env.ACRYL_HOME = '/tmp/acryl-home'
      expect(resolvePluginLifecycleStatePath())
        .toBe('/tmp/acryl-home/.dsh/plugin-lifecycle/state.json')

      // An isolated or dev run sets only DSH_HOME. Resolving it from the ACRYL
      // root instead would write overrides into the operator's real install.
      delete process.env.ACRYL_HOME
      process.env.DSH_HOME = '/tmp/acryl-dev/.dsh'
      expect(resolvePluginLifecycleStatePath())
        .toBe('/tmp/acryl-dev/.dsh/plugin-lifecycle/state.json')
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
    expect(pluginLifecyclePatches({ profileName: 'desktop', statePath: path })).toEqual([])
  })

  it('persists a managed disable and removes it on enable', async () => {
    const path = statePath()
    const bootstrap = { profileName: 'desktop', statePath: path }

    await setPluginLifecycleEntryEnabled(
      bootstrap,
      'include:desktop-development-canvas',
      false,
    )

    expect([...readDisabledPluginLifecycleEntries(bootstrap)]).toEqual([
      'include:desktop-development-canvas',
    ])
    expect(pluginLifecyclePatches(bootstrap)).toEqual([{
      id: 'desktop-development-canvas',
      disabled: true,
    }])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      version: 1,
      profiles: [{
        profileName: 'desktop',
        disabledEntries: ['include:desktop-development-canvas'],
      }],
    })

    await setPluginLifecycleEntryEnabled(
      bootstrap,
      'include:desktop-development-canvas',
      true,
    )
    expect([...readDisabledPluginLifecycleEntries(bootstrap)]).toEqual([])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, profiles: [] })
  })

  it('keeps profile overrides isolated', async () => {
    const path = statePath()
    await setPluginLifecycleEntryEnabled(
      { profileName: 'work', statePath: path },
      'include:desktop-development-canvas',
      false,
    )

    expect(pluginLifecyclePatches({ profileName: 'desktop', statePath: path })).toEqual([])
    expect(pluginLifecyclePatches({ profileName: 'work', statePath: path })).toHaveLength(1)
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
          'include:desktop-development-canvas',
          'include:has spaces',
        ],
      }],
    }))
    expect([...readDisabledPluginLifecycleEntries({ profileName: 'desktop', statePath: path })].sort())
      .toEqual(['include:cordis-plugin-graph', 'include:desktop-development-canvas'])

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
})
