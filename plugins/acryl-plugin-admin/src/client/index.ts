/**
 * Cordis Client plugin: Settings > Plugins > Architecture and Lifecycle tabs, for every surface.
 *
 * It contributes two `settings.plugins.tab` entries and owns their dictionaries and styles, each inside one
 * effect. It talks to its Host half over the private same-origin routes and never assumes a surface.
 */

// Pulls in `ctx.slots` (declared by the renderer package) and the settings slot map.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { applyPluginLifecycleSettings } from './lifecycle/plugin-lifecycle-settings.ts'

export const name = 'acryl-plugin-admin-client'
/** `slots` for the tab contributions, `locale` for their dictionaries. */
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  applyPluginLifecycleSettings(ctx)
}

export { PluginArchitectureSettingsTab } from './architecture/PluginArchitectureSettingsTab.tsx'
export type {
  PluginArchitectureSettingsTabInjected,
  PluginArchitectureSettingsTabProps,
} from './architecture/PluginArchitectureSettingsTab.tsx'
export { PluginLifecycleSettingsTab } from './lifecycle/PluginLifecycleSettingsTab.tsx'
export type {
  PluginLifecycleSettingsTabInjected,
  PluginLifecycleSettingsTabProps,
} from './lifecycle/PluginLifecycleSettingsTab.tsx'
export {
  createPluginArchitectureApi,
  parseCordisPlaneSnapshot,
} from './architecture/plugin-architecture-api.ts'
export type { PluginArchitectureApi } from './architecture/plugin-architecture-api.ts'
export {
  createPluginLifecycleApi,
  parsePluginLifecycleSnapshot,
} from './lifecycle/plugin-lifecycle-api.ts'
export type {
  PluginLifecycleApi,
  PluginLifecycleClientEntryView,
  PluginLifecycleClientSnapshot,
} from './lifecycle/plugin-lifecycle-api.ts'
export { applyPluginLifecycleSettings } from './lifecycle/plugin-lifecycle-settings.ts'
