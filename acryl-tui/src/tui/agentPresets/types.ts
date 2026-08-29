/**
 * Plain, Cordis-agnostic snapshot of one agent preset, joined from
 * `ctx.agentPresets.list()` for the `/presets` overlay.
 * @module @tomowang/dsh-tui/tui/agentPresets/types
 */

/** One preset row as the overlay renders it. */
export interface AgentPresetRow {
  /** Stable identifier; the preset directory's name. */
  readonly id: string
  /** Display label: a built-in English name for the four shipped ids, else the preset's own name, else its id. */
  readonly label: string
  /** One sentence on what this preset is for, when it published one. */
  readonly description: string | undefined
  /** `'system'` for a shipped preset, `'user'` for a locally authored one. */
  readonly trust: 'system' | 'user'
  /** Why this preset cannot compose a session, `undefined` when it can. */
  readonly broken: string | undefined
}
