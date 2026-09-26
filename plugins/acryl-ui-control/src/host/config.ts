/** The plugin's Loader-row configuration, validated before anything activates. */

export interface UiControlConfig {
  /**
   * `every-call` (the default): each click, type, select and key press is approved by the user, one call at a
   * time. `none` skips the question and is meant for unattended tests only.
   */
  readonly approval: 'every-call' | 'none'
  /** Where the audit log is written; defaults to the ACRYL home. */
  readonly auditLog?: string
}

/** @throws Error naming the bad field. An unknown value never falls back to something looser. */
export function parseConfig(raw: unknown): UiControlConfig {
  if (raw === undefined || raw === null) return { approval: 'every-call' }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('acryl-ui-control: config must be an object')
  const config = raw as Record<string, unknown>
  const unknown = Object.keys(config).find(key => key !== 'approval' && key !== 'auditLog')
  if (unknown !== undefined) throw new Error(`acryl-ui-control: unknown config field "${unknown}"`)
  const approval = config.approval ?? 'every-call'
  if (approval !== 'every-call' && approval !== 'none') throw new Error('acryl-ui-control: approval must be "every-call" or "none"')
  if (config.auditLog !== undefined && (typeof config.auditLog !== 'string' || config.auditLog === '')) throw new Error('acryl-ui-control: auditLog must be a path')
  return { approval, ...(config.auditLog === undefined ? {} : { auditLog: config.auditLog as string }) }
}
