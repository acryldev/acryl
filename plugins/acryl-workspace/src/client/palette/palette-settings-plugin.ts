/** Settings > Command palette, registered through the shared section plugin. */

import { settingsSectionPlugin } from '../settings/section-plugin.ts'
import type { PaletteConfigState } from './palette-config.ts'
import { PaletteSection } from './PalettePanel.tsx'

/** @param config - what the palette lists, shared with the palette itself. */
export function paletteSettingsPlugin(config: PaletteConfigState) {
  return settingsSectionPlugin('acryl-workspace-palette-settings', 'palette', 42, (ctx, base) => ctx.slots.register({ ...base, inject: () => ({ config }) }, PaletteSection))
}
