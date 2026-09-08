/**
 * Pure text builders for the small always-present live-region rows (status
 * bar, queued-message preview, permission indicator) — the pi-tui
 * equivalents of the old `StatusBar.tsx`/`QueuedIndicator.tsx`/
 * `PermissionIndicator.tsx`, minus the Ink wrapper. `TuiApp` renders each of
 * these through a `DynamicText` that calls the builder fresh every frame, so
 * they always reflect the latest store snapshot (and, for the status bar,
 * the spinner's current frame) without any manual `setText` bookkeeping.
 * @module @tomowang/dsh-tui/tui/liveText
 */

import type { AgentStatus } from '@deepseek-ai/dsh-agent'
import type { GoalPhase, GoalProjection } from '@deepseek-ai/dsh-goal'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { truncate } from '../render.js'
import { stripSessionIdPrefix } from '../sessionId.js'
import type { PermissionState } from './store.js'
import { theme, fg } from './theme.js'

const dim = fg(theme.muted)
const accent = fg(theme.accent)
const warning = fg(theme.warning)

export interface StatusBarParams {
  readonly sessionId: string
  readonly provider: string
  readonly model: string
  readonly status: AgentStatus
  readonly queuedCount: number
  /** Current agent preset's display label, or `undefined` without a mounted preset service. */
  readonly presetLabel: string | undefined
  /** Number of events logged to `agent.session.events` so far. */
  readonly eventCount: number
  /** Current animation frame, shown only while `status === 'running'`. */
  readonly spinnerChar: string
}

export function buildStatusBarText(params: StatusBarParams): string {
  const { sessionId, provider, model, status, queuedCount, presetLabel, eventCount, spinnerChar } = params
  const queuedSuffix = queuedCount > 0 ? ` · ${queuedCount} queued` : ''
  const presetSegment = presetLabel === undefined ? '' : ` · ${presetLabel}`
  const spinnerPart = status === 'running' ? spinnerChar : ''
  return (
    dim(`session ${stripSessionIdPrefix(sessionId)} · `) +
    accent(`${provider}/${model}`) +
    dim(`${presetSegment} · ${spinnerPart} ${status}${queuedSuffix} · ${eventCount} events`)
  )
}

function previewOf(message: UserMessage): string {
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
  return truncate(text, 80)
}

export function buildQueuedText(queued: readonly UserMessage[]): string {
  if (queued.length === 0) return ''
  return queued.map(message => dim(`↳ queued: ${previewOf(message)}`)).join('\n')
}

const PERMISSION_LABELS: Record<string, string> = {
  'read-only': 'Read Only',
  'workspace-write': 'Workspace Write',
  'danger-full-access': 'Full Access',
  custom: 'Custom',
}

const PERMISSION_ICONS: Record<string, string> = {
  'read-only': '⊘',
  'workspace-write': '✎',
  'danger-full-access': '‼',
  custom: '⊛',
}

const PERMISSION_COLORS: Record<string, string> = {
  'read-only': theme.info,
  'workspace-write': theme.success,
  'danger-full-access': theme.error,
  custom: theme.muted,
}

/**
 * Persistent low-key dock row nudging the reader to upgrade once the
 * startup registry check (`src/updateCheck.ts`) finds a newer published
 * version; renders nothing while unchecked or already current. Unlike
 * `notice`, this isn't cleared on the next input — it's meant to stay
 * visible for the rest of the session, mirroring how `gh`/`npm` surface an
 * available-update line.
 */
export function buildUpdateHintText(currentVersion: string, latestVersion: string | undefined): string {
  if (latestVersion === undefined) return ''
  return warning(`⬆ ACRYL update available: v${currentVersion} → v${latestVersion}`) +
    dim(' (run `pnpm add -g @acryl/cli` to upgrade)')
}

export function buildPermissionText(permission: PermissionState | undefined): string {
  if (permission === undefined) return ''
  const icon = PERMISSION_ICONS[permission.current] ?? '•'
  const label = PERMISSION_LABELS[permission.current] ?? permission.current
  const color = fg(PERMISSION_COLORS[permission.current] ?? theme.muted)
  return `${color(`${icon} ${label}`)}${dim(' (shift+tab to cycle)')}`
}

/** Human label for one durable goal phase — the single source of truth shared by the `/goal` notice (`index.ts`) and this strip. */
export function goalPhaseLabel(phase: GoalPhase): string {
  switch (phase) {
    case 'active': return 'active'
    case 'paused': return 'paused'
    case 'blocked': return 'blocked'
    case 'complete': return 'complete'
  }
}

/** Phase color for the goal glyph + label; active reads green, paused amber, blocked coral. */
const GOAL_PHASE_COLORS: Record<string, string> = {
  active: theme.success,
  paused: theme.warning,
  blocked: theme.error,
}

/** Long-objective cap for the goal strip, matching the queued-preview cap. */
const GOAL_OBJECTIVE_LIMIT = 80

/**
 * The goal strip docked above the composer — the terminal GoalBar. Mirrors
 * the web portal's rendering rule exactly: loading (`undefined` — projection
 * unit not composed), absent/cleared (`null`), and complete goals render
 * nothing; a present goal shows a goal glyph, its phase label, and the
 * truncated objective, with the blocker explanation appended for a blocked
 * goal (the portal shows it as a hover tooltip, which a terminal cannot).
 * Mutations live on the `/goal` command, not on the strip.
 */
/**
 * Terminal window/tab title: `<session title> — dsh-tui` once the optional
 * `dsh-session-title` service has accepted one for this session, or just
 * `dsh-tui` before that (loading) or without the service composed —
 * mirroring the harness's own `<session title> — <configured title>` OSC 0
 * convention. Plain text, never ANSI-colored: an OSC 0 title string is
 * displayed verbatim by the terminal chrome, not interpreted as SGR.
 */
export function buildTerminalTitle(title: string | null | undefined): string {
  return title === null || title === undefined ? 'ACRYL' : `${title} — ACRYL`
}

export function buildGoalBarText(goal: GoalProjection | null | undefined): string {
  if (goal === undefined || goal === null || goal.goal.phase === 'complete') return ''
  const snapshot = goal.goal
  const color = fg(GOAL_PHASE_COLORS[snapshot.phase] ?? theme.muted)
  const label = goalPhaseLabel(snapshot.phase)
  const objective = truncate(snapshot.objective, GOAL_OBJECTIVE_LIMIT)
  const blocker = snapshot.phase === 'blocked' && snapshot.blockedReason !== undefined
    ? dim(` · ${snapshot.blockedReason.code}: ${truncate(snapshot.blockedReason.message, GOAL_OBJECTIVE_LIMIT)}`)
    : ''
  return `${color(`🎯 ${label}`)} · ${objective}${blocker}`
}
