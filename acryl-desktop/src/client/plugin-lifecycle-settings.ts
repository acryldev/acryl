/** Desktop-owned lifecycle tab contribution for the Plugins Settings section. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginArchitectureSettingsTab } from './PluginArchitectureSettingsTab.tsx'
import { PluginLifecycleSettingsTab } from './PluginLifecycleSettingsTab.tsx'
import { createPluginArchitectureApi } from './plugin-architecture-api.ts'
import { createPluginLifecycleApi } from './plugin-lifecycle-api.ts'
import { en, zh, type PluginLifecycleLocaleKey } from './plugin-lifecycle-locales.ts'
import { installPluginLifecycleStyles } from './plugin-lifecycle-styles.ts'

export const PLUGIN_LIFECYCLE_LOCALE_NAMESPACE = 'desktop.pluginLifecycle'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desktop.pluginLifecycle': PluginLifecycleLocaleKey
  }
}

/** Register the lifecycle page between configurable settings and read-only inventory. */
export function applyPluginLifecycleSettings(ctx: ClientContext): void {
  const architectureApi = createPluginArchitectureApi(ctx)
  const lifecycleApi = createPluginLifecycleApi(ctx.loader)
  const t = ctx.locale.bind(PLUGIN_LIFECYCLE_LOCALE_NAMESPACE)
  ctx.effect(
    () => ctx.locale.register(PLUGIN_LIFECYCLE_LOCALE_NAMESPACE, { zh, en }),
    'acryl-desktop: plugin lifecycle dictionaries',
  )
  ctx.effect(
    () => installPluginLifecycleStyles(),
    'acryl-desktop: plugin lifecycle styles',
  )
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'architecture',
    order: 4,
    label: () => t('architectureTab'),
    locale: PLUGIN_LIFECYCLE_LOCALE_NAMESPACE,
    inject: () => ({ api: architectureApi }),
  }, PluginArchitectureSettingsTab))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'lifecycle',
    order: 5,
    label: () => t('tab'),
    locale: PLUGIN_LIFECYCLE_LOCALE_NAMESPACE,
    inject: () => ({ api: lifecycleApi }),
  }, PluginLifecycleSettingsTab))
}
