// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { agentsSettingsPlugin } from '../../src/client/agents/agents-settings-plugin.ts'
import type { AgentsState } from '../../src/client/agents/agents-state.ts'
import { paletteSettingsPlugin } from '../../src/client/palette/palette-settings-plugin.ts'
import type { PaletteConfigState } from '../../src/client/palette/palette-config.ts'
import { settingsSharedPlugin } from '../../src/client/settings/section-plugin.ts'
import { tabsSettingsPlugin } from '../../src/client/tabs/tabs-settings-plugin.ts'
import type { WorkspaceTabRegistry } from '../../src/client/tabs/registry/tab-registry.ts'
import type { TabTypesState } from '../../src/client/tabs/tab-types-state.ts'

const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

/** DSH 0.2's locale service refuses a second registration of a namespace's locale; this fake does the same. */
function strictLocale() {
  const registered = new Set<string>()
  return {
    register(ns: string, dicts: Record<string, unknown>) {
      for (const locale of Object.keys(dicts)) {
        const key = `${ns}/${locale}`
        if (registered.has(key)) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`)
        registered.add(key)
      }
      return () => { for (const locale of Object.keys(dicts)) registered.delete(`${ns}/${locale}`) }
    },
    bind: () => (key: string) => key,
  }
}

describe('ACRYL Settings sections', () => {
  it('all three load (Agents, Tabs, Command palette), with the shared dictionary and styles registered once', async () => {
    const sections: string[] = []
    const root = new Context()
    root.provide('locale', strictLocale())
    root.provide('slots', {
      inject: (_name: string, register: () => () => void) => register(),
      register: (options: { id: string }) => { sections.push(options.id); return () => { sections.splice(sections.indexOf(options.id), 1) } },
    })
    const fibers = [
      root.plugin(settingsSharedPlugin()),
      root.plugin(agentsSettingsPlugin({} as AgentsState)),
      root.plugin(tabsSettingsPlugin({} as TabTypesState, {} as WorkspaceTabRegistry)),
      root.plugin(paletteSettingsPlugin({} as PaletteConfigState)),
    ]
    await settle()
    expect(sections.sort()).toEqual(['agents', 'palette', 'tabs'])
    expect(document.querySelectorAll('#acryl-workspace-settings-styles')).toHaveLength(1)
    for (const fiber of fibers) await fiber.dispose()
    expect(document.querySelectorAll('#acryl-workspace-settings-styles')).toHaveLength(0)
  })
})
