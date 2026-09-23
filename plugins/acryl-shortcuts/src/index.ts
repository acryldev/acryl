/**
 * Host side of the shortcuts registry: registers the `acryl-shortcuts` settings namespace so the
 * client's `ctx.settingsScope.bind({namespace: 'acryl-shortcuts'})` derives a real, writable
 * section instead of sitting permanently `unavailable` (found exactly this way: without this
 * registration, `SettingsScopeController.derive()` never finds the namespace in the describe
 * mirror's `namespaces` list, so every combo reassignment from the Shortcuts settings page silently
 * dropped and the UI kept showing the default). Matching a live keydown is still pure client-side
 * DOM handling with no PTY, no routes, no other server state - that work lives entirely in `./client`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { SHORTCUTS_SETTINGS_NAMESPACE, ShortcutsSettingsSchema } from './shortcuts-settings.ts'

export { SHORTCUTS_SETTINGS_NAMESPACE, ShortcutsSettingsSchema } from './shortcuts-settings.ts'

/** Stable Cordis plugin name. */
export const name = 'acryl-shortcuts'

/** Register the durable shortcuts section when the optional settings service is composed. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SHORTCUTS_SETTINGS_NAMESPACE, ShortcutsSettingsSchema)
  })
}
