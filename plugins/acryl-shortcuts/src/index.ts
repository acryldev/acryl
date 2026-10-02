/**
 * Host side of the shortcuts registry: registers the `acryl-shortcuts` namespace in ACRYL's own settings service
 * (`ctx.acrylSettings`). Matching a live keydown is pure client-side DOM handling with no PTY, no routes, no other
 * server state - that work lives entirely in `./client`.
 *
 * DETACHED CLIENT (spec 001 R24): the client half bound its section through the DeepSeek Harness client settings
 * scope (`ctx.settingsScope`), which 0.2 removed. Persisting combos from the browser needs an ACRYL route over
 * `acrylSettings`; until that exists the client keeps its defaults.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-settings'
import { SHORTCUTS_SETTINGS_NAMESPACE, ShortcutsSettingsSchema } from './shortcuts-settings.ts'

export { SHORTCUTS_SETTINGS_NAMESPACE, ShortcutsSettingsSchema } from './shortcuts-settings.ts'

/** Stable Cordis plugin name. */
export const name = 'acryl-shortcuts'

/** Register the durable shortcuts section when the optional settings service is composed. */
export function apply(ctx: Context): void {
  ctx.inject(['acrylSettings'], (settingsCtx) => {
    settingsCtx.acrylSettings.register(SHORTCUTS_SETTINGS_NAMESPACE, ShortcutsSettingsSchema)
  })
}
