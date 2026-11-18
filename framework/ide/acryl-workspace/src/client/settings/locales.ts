/** Dictionaries for the section names this package opens (the only text the Settings shell itself shows). */

export type SettingsSectionKey = 'agents' | 'tabs' | 'palette' | 'models'
export type SettingsLocaleKey = `${SettingsSectionKey}Nav`

export const en: Record<SettingsLocaleKey, string> = { agentsNav: 'Agents', tabsNav: 'Tabs', paletteNav: 'Command palette', modelsNav: 'Models' }
export const zh: Record<SettingsLocaleKey, string> = { agentsNav: '智能体', tabsNav: '标签页', paletteNav: '命令面板', modelsNav: '模型' }
