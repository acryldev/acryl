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
}

/** @throws Error naming the bad field. An unknown value never falls back to something looser. */
export function parseConfig(raw: unknown): UiControlConfig {
  if (raw === undefined || raw === null) return { approval: 'every-call', online: false }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('acryl-agent-control: config must be an object')
  const config = raw as Record<string, unknown>
  const unknown = Object.keys(config).find(key => key !== 'approval' && key !== 'auditLog' && key !== 'online')
  if (unknown !== undefined) throw new Error(`acryl-agent-control: unknown config field "${unknown}"`)
  const approval = config.approval ?? 'every-call'
  if (approval !== 'every-call' && approval !== 'none') throw new Error('acryl-agent-control: approval must be "every-call" or "none"')
  if (config.auditLog !== undefined && (typeof config.auditLog !== 'string' || config.auditLog === '')) throw new Error('acryl-agent-control: auditLog must be a path')
  if (config.online !== undefined && typeof config.online !== 'boolean') throw new Error('acryl-agent-control: online must be true or false')
  return { approval, online: config.online === true, ...(config.auditLog === undefined ? {} : { auditLog: config.auditLog as string }) }
}
