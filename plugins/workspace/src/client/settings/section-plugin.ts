/**
 * The Settings sections this package adds (Agents, Tabs, Command palette): one shared plugin owns their dictionary and styles, and each
 * section is a dependency-gated child plugin that only registers itself. The dictionary has one owner because DSH 0.2's locale service
 * refuses a second registration of a namespace ("already has locale"): when every section registered it, only the first section loaded
 * and the other two vanished from Settings.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@acryl/ui/frame'
import { en, zh, type SettingsLocaleKey, type SettingsSectionKey } from './locales.ts'
import { installSettingsStyles } from './styles.ts'

export const SETTINGS_LOCALE_NAMESPACE = 'acryl.workspace.settings'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.workspace.settings': SettingsLocaleKey
  }
}

/** The sections' shared dictionary and styles, registered once for all of them. */
export function settingsSharedPlugin() {
  return {
    name: 'acryl-workspace-settings-shared',
    inject: ['locale'],
    apply(ctx: ClientContext): void {
      ctx.effect(() => ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, { zh, en }), 'acryl-workspace settings: dictionaries')
      ctx.effect(() => installSettingsStyles(), 'acryl-workspace settings: styles')
    },
  }
}

/** The options every section shares; the section adds its own `inject` and component. */
export interface SectionBase {
  readonly name: 'settings.section'
  readonly id: SettingsSectionKey
  readonly order: number
  readonly label: () => string
  readonly locale: typeof SETTINGS_LOCALE_NAMESPACE
}

/**
 * @param name - the Cordis plugin name.
 * @param id - the section id; its nav label is `<id>Nav` in the dictionary.
 * @param order - nav order among the sections (lower first).
 * @param register - registers the section's component with the given base options; returns the slot disposer.
 */
export function settingsSectionPlugin(name: string, id: SettingsSectionKey, order: number, register: (ctx: ClientContext, base: SectionBase) => () => void) {
  return {
    name,
    inject: ['slots', 'locale'],
    apply(ctx: ClientContext): void {
      const t = ctx.locale.bind(SETTINGS_LOCALE_NAMESPACE)
      const base: SectionBase = { name: 'settings.section', id, order, label: () => t(`${id}Nav`), locale: SETTINGS_LOCALE_NAMESPACE }
      ctx.slots.inject('settings.section', () => register(ctx, base))
    },
  }
}
