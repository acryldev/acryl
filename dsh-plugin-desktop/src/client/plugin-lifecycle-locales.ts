/** Locale dictionaries for the Desktop plugin lifecycle Settings tab. */

export type PluginLifecycleLocaleKey =
  | 'tab'
  | 'loading'
  | 'error'
  | 'retry'
  | 'search'
  | 'catalog'
  | 'empty'
  | 'host'
  | 'client'
  | 'configuration'
  | 'enabled'
  | 'disabled'
  | 'mounted'
  | 'notMounted'
  | 'notApplicable'
  | 'pending'
  | 'loadingPhase'
  | 'active'
  | 'failed'
  | 'unloading'
  | 'protected'
  | 'enable'
  | 'disable'
  | 'reload'
  | 'reloadAll'
  | 'confirmDisable'
  | 'cancel'
  | 'shortcut'
  | 'architectureTab'
  | 'architectureIntro'
  | 'fibers'
  | 'services'
  | 'dependencies'
  | 'provides'
  | 'effects'
  | 'loaderEntry'
  | 'module'
  | 'parentFiber'
  | 'rootFiber'
  | 'available'
  | 'missing'
  | 'resolvedBy'
  | 'none'

export const en: Record<PluginLifecycleLocaleKey, string> = {
  tab: 'Lifecycle',
  loading: 'Loading plugin lifecycle…',
  error: 'Plugin lifecycle could not be loaded.',
  retry: 'Retry',
  search: 'Search plugins',
  catalog: 'Host and Client plugins',
  empty: 'No plugins match this search.',
  host: 'Host',
  client: 'Client',
  configuration: 'Configuration',
  enabled: 'Enabled',
  disabled: 'Disabled',
  mounted: 'Mounted',
  notMounted: 'Not mounted',
  notApplicable: 'No Client face',
  pending: 'Pending',
  loadingPhase: 'Loading',
  active: 'Mounted',
  failed: 'Failed',
  unloading: 'Unmounting',
  protected: 'Protected',
  enable: 'Enable',
  disable: 'Disable',
  reload: 'Reload',
  reloadAll: 'Reload managed plugins',
  confirmDisable: 'Confirm disable',
  cancel: 'Cancel',
  shortcut: 'Session shortcut: /reload [loader-entry-id]',
  architectureTab: 'Architecture',
  architectureIntro: 'Live native Cordis Fibers, injected dependencies, services, and owned effects. Host and Client are independent contexts.',
  fibers: 'Fibers',
  services: 'Services',
  dependencies: 'Injects',
  provides: 'Provides',
  effects: 'Owned effects',
  loaderEntry: 'Loader entry',
  module: 'Module',
  parentFiber: 'Parent Fiber',
  rootFiber: 'Root Fiber',
  available: 'Available',
  missing: 'Missing',
  resolvedBy: 'Resolved by Fiber',
  none: 'None',
}

export const zh: Record<PluginLifecycleLocaleKey, string> = {
  tab: '生命周期',
  loading: '正在加载插件生命周期…',
  error: '无法加载插件生命周期。',
  retry: '重试',
  search: '搜索插件',
  catalog: 'Host 与 Client 插件',
  empty: '没有匹配的插件。',
  host: 'Host',
  client: 'Client',
  configuration: '配置',
  enabled: '已启用',
  disabled: '已禁用',
  mounted: '已挂载',
  notMounted: '未挂载',
  notApplicable: '无 Client 端',
  pending: '等待中',
  loadingPhase: '加载中',
  active: '已挂载',
  failed: '失败',
  unloading: '正在卸载',
  protected: '受保护',
  enable: '启用',
  disable: '禁用',
  reload: '重新加载',
  reloadAll: '重新加载受管插件',
  confirmDisable: '确认禁用',
  cancel: '取消',
  shortcut: '会话快捷命令：/reload [loader-entry-id]',
  architectureTab: '架构',
  architectureIntro: '实时原生 Cordis Fiber、注入依赖、服务与所拥有的 effect。Host 与 Client 是独立上下文。',
  fibers: 'Fiber',
  services: '服务',
  dependencies: '注入依赖',
  provides: '提供服务',
  effects: '所拥有的 effect',
  loaderEntry: 'Loader 条目',
  module: '模块',
  parentFiber: '父 Fiber',
  rootFiber: '根 Fiber',
  available: '可用',
  missing: '缺失',
  resolvedBy: '由 Fiber 提供',
  none: '无',
}
