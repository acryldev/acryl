/** The plugin's Loader-row configuration, validated before anything activates. */

export interface UiControlConfig {
  /**
   * `every-call` (the default): each click, type, select and key press is approved by the user, one call at a
   * time. `none` skips the question and is meant for unattended tests only.
   */
  readonly approval: 'every-call' | 'none'
  /** Where the audit log is written; defaults to the ACRYL home. */
  readonly auditLog?: string
  /**
   * TB30: an outside CLI operator on this machine may drive this window over a loopback-only, secret-token
   * channel (TB03). Off by default - it is new, authenticated network-facing surface, so an operator opts in
   * per profile rather than it appearing for everyone who already had this plugin's row.
   */
  readonly online: boolean
  /** Agent workers: bring-your-own agents driven through this Host. On by default (nothing runs until one is attached). */
  readonly workers: { readonly enabled: boolean; readonly claude: { readonly command?: string; readonly args?: readonly string[] } }
}

/** @throws Error naming the bad field. An unknown value never falls back to something looser. */
export function parseConfig(raw: unknown): UiControlConfig {
  if (raw === undefined || raw === null) return { approval: 'every-call', online: false, workers: { enabled: true, claude: {} } }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('acryl-agent-control: config must be an object')
  const config = raw as Record<string, unknown>
  const unknown = Object.keys(config).find(key => key !== 'approval' && key !== 'auditLog' && key !== 'online' && key !== 'workers')
  if (unknown !== undefined) throw new Error(`acryl-agent-control: unknown config field "${unknown}"`)
  const approval = config.approval ?? 'every-call'
  if (approval !== 'every-call' && approval !== 'none') throw new Error('acryl-agent-control: approval must be "every-call" or "none"')
  if (config.auditLog !== undefined && (typeof config.auditLog !== 'string' || config.auditLog === '')) throw new Error('acryl-agent-control: auditLog must be a path')
  if (config.online !== undefined && typeof config.online !== 'boolean') throw new Error('acryl-agent-control: online must be true or false')
  return { approval, online: config.online === true, workers: parseWorkers(config.workers), ...(config.auditLog === undefined ? {} : { auditLog: config.auditLog as string }) }
}

function parseWorkers(raw: unknown): UiControlConfig['workers'] {
  if (raw === undefined || raw === true) return { enabled: true, claude: {} }
  if (raw === false) return { enabled: false, claude: {} }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('acryl-agent-control: workers must be true, false or an object')
  const workers = raw as Record<string, unknown>
  const unknown = Object.keys(workers).find(key => key !== 'claude')
  if (unknown !== undefined) throw new Error(`acryl-agent-control: unknown workers field "${unknown}"`)
  const claude = workers.claude ?? {}
  if (typeof claude !== 'object' || claude === null || Array.isArray(claude)) throw new Error('acryl-agent-control: workers.claude must be an object')
  const options = claude as Record<string, unknown>
  const extra = Object.keys(options).find(key => key !== 'command' && key !== 'args')
  if (extra !== undefined) throw new Error(`acryl-agent-control: unknown workers.claude field "${extra}"`)
  if (options.command !== undefined && (typeof options.command !== 'string' || options.command === '')) throw new Error('acryl-agent-control: workers.claude.command must be a program name or path')
  if (options.args !== undefined && (!Array.isArray(options.args) || options.args.some(item => typeof item !== 'string'))) throw new Error('acryl-agent-control: workers.claude.args must be a list of strings')
  return { enabled: true, claude: { ...(options.command === undefined ? {} : { command: options.command as string }), ...(options.args === undefined ? {} : { args: options.args as string[] }) } }
}
