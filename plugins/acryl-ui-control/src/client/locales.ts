/** Dictionaries for the Agent Control settings section. */

export type AgentControlLocaleKey = 'nav' | 'heading' | 'description' | 'empty' | 'refresh' | 'loading' | 'time' | 'tool' | 'control' | 'result'

export const en: Record<AgentControlLocaleKey, string> = {
  nav: 'Agent Control',
  heading: 'What the agent did in this window',
  description: 'Every click, keystroke and look the agent made, newest first. Text it typed is never recorded here.',
  empty: 'Nothing yet.',
  refresh: 'Refresh',
  loading: 'Loading...',
  time: 'Time',
  tool: 'Action',
  control: 'Control',
  result: 'Result',
}

export const zh: Record<AgentControlLocaleKey, string> = {
  nav: '智能体控制',
  heading: '智能体在此窗口中的操作',
  description: '智能体的每次点击、按键和查看，最新的在前。它输入的文字不会记录在这里。',
  empty: '暂无记录。',
  refresh: '刷新',
  loading: '加载中...',
  time: '时间',
  tool: '操作',
  control: '控件',
  result: '结果',
}
