/** Settings > Tabs, registered through the shared section plugin. */

import { settingsSectionPlugin } from '../settings/section-plugin.ts'
import type { TabTypesState } from './tab-types-state.ts'
import { TabsSection } from './TabsPanel.tsx'

/** @param tabTypes - the shared enable and disable state of the tab types. */
export function tabsSettingsPlugin(tabTypes: TabTypesState) {
  return settingsSectionPlugin('acryl-workspace-tabs-settings', 'tabs', 41, (ctx, base) => ctx.slots.register({ ...base, inject: () => ({ tabTypes }) }, TabsSection))
}
