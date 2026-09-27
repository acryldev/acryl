/**
 * One Settings section as a dependency-gated child plugin: it waits (PENDING, not failed) for the settings shell
 * and the locale service, and registers the shared dictionary, the shared styles and its own section inside
 * owned effects, so they unwind together. Each section (agents, tabs, palette) supplies only its registration,
 * because the slot's component typing is concrete per section.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type SettingsLocaleKey, type SettingsSectionKey } from './locales.ts'
import { installSettingsStyles } from './styles.ts'

export const SETTINGS_LOCALE_NAMESPACE = 'acryl.workspace.settings'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'acryl.workspace.settings': SettingsLocaleKey
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
      ctx.effect(() => ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, { zh, en }), `${name}: dictionaries`)
      ctx.effect(() => installSettingsStyles(), `${name}: styles`)
      const base: SectionBase = { name: 'settings.section', id, order, label: () => t(`${id}Nav`), locale: SETTINGS_LOCALE_NAMESPACE }
      ctx.slots.inject('settings.section', () => register(ctx, base))
    },
  }
}
