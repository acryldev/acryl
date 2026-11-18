/** Dictionaries for the Support settings section. */

export type SupportLocaleKey = 'nav' | 'heading' | 'description' | 'export' | 'exporting' | 'done' | 'privacy'

export const en: Record<SupportLocaleKey, string> = {
  nav: 'Support',
  heading: 'Diagnostics',
  description: 'Download a zip with system facts and the recent logs, to attach to a bug report.',
  export: 'Export diagnostics',
  exporting: 'Preparing...',
  done: 'Downloaded. Check your downloads folder.',
  privacy: 'Secrets such as API keys and tokens are masked, but read the files before sharing them.',
}

export const zh: Record<SupportLocaleKey, string> = {
  nav: '支持',
  heading: '诊断',
  description: '下载包含系统信息和近期日志的压缩包，用于提交问题报告。',
  export: '导出诊断信息',
  exporting: '正在准备...',
  done: '已下载，请查看下载文件夹。',
  privacy: '密钥和令牌等敏感信息已被遮盖，但分享前请先检查文件。',
}
