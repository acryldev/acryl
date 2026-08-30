import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { prepareDesktopProfile } from '../src/profile.ts'
import { setPluginLifecycleEntryEnabled } from '../src/plugin-lifecycle-state.ts'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('plugin lifecycle profile composition', () => {
  it('applies a persisted Canvas disable as the final generation override', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-plugin-lifecycle-profile-'))
    homes.push(home)
    const statePath = join(home, 'desktop-user-data', 'plugin-lifecycle', 'state.json')
    await setPluginLifecycleEntryEnabled(
      { profileName: 'desktop', statePath },
      'include:desktop-development-canvas',
      false,
    )

    const prepared = prepareDesktopProfile(
      undefined,
      home,
      'darwin',
      'desktop',
      undefined,
      undefined,
      undefined,
      { pluginLifecycleStatePath: statePath },
    )
    const row = composeEntries([prepared.patches])
      .find(entry => entry.id === 'desktop-development-canvas')

    expect(row).toEqual(expect.objectContaining({
      id: 'desktop-development-canvas',
      name: 'acryl-development-canvas',
      disabled: true,
    }))
  })
})
