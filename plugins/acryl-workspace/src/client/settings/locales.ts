/** Dictionaries for the section names this package adds to Settings (the only text the Settings shell itself shows). */

export type SettingsSectionKey = 'agents' | 'tabs' | 'palette'
export type SettingsLocaleKey = `${SettingsSectionKey}Nav`

export const en: Record<SettingsLocaleKey, string> = { agentsNav: 'Agents', tabsNav: 'Tabs', paletteNav: 'Command palette' }
export const zh: Record<SettingsLocaleKey, string> = { agentsNav: '智能体', tabsNav: '标签页', paletteNav: '命令面板' }
