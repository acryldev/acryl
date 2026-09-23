import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the SlotRegistry Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the SettingsScope Context merge (ctx.settingsScope) and the
// 'settings.section' SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ShortcutsRegistry, SHORTCUTS_SETTINGS_NAMESPACE } from './shortcuts-service.ts'
import { ShortcutsSection } from './ShortcutsSection.tsx'

export const name = 'acryl-shortcuts-client'
export const inject = ['slots', 'settingsScope']

export { ShortcutsRegistry, SHORTCUTS_SETTINGS_NAMESPACE } from './shortcuts-service.ts'
export type { ShortcutAction } from './shortcuts-service.ts'
export { formatCombo, matchesCombo, describeCombo } from './combo.ts'

/**
 * Provide `ctx.shortcuts` (a plain registry keyed by combo overrides, mirroring `ui-theme`'s
 * shape) and register the Shortcuts settings page. Every other plugin that owns a hotkey should
 * `inject: ['shortcuts']`, call `ctx.shortcuts.register(...)` once with a stable id/label/default
 * combo, and read the live combo back through `ctx.shortcuts.getCombo(id)` instead of hardcoding
 * a key check.
 */
export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<Record<string, string>>({ namespace: SHORTCUTS_SETTINGS_NAMESPACE })
  const registry = new ShortcutsRegistry(scope)
  ctx.provide('shortcuts', registry)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'shortcuts',
    order: 90,
    label: 'Shortcuts',
    inject: () => ({ shortcuts: registry }),
  }, ShortcutsSection))
}
