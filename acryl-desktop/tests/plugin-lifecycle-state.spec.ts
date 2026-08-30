import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  pluginLifecyclePatches,
  readDisabledPluginLifecycleEntries,
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
      name: 'acryl-development-canvas',
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

  it('fails closed on unknown entries and malformed state', async () => {
    const path = statePath()
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, JSON.stringify({
      version: 1,
      profiles: [{ profileName: 'desktop', disabledEntries: ['include:unknown'] }],
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
      'include:unknown' as 'include:desktop-development-canvas',
      false,
    )).rejects.toThrow('not managed')
  })
})
