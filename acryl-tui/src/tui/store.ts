/**
 * Plain, dependency-free projection of Cordis/session events into a single
 * immutable snapshot that React components read through
 * `useSyncExternalStore`. Owns the seq-dedupe boundary between replayed and
 * live session events so that invariant lives in one place, testable without
 * Ink or Cordis.
 * @module @tomowang/dsh-tui/tui/store
 */

import type { AgentStatus } from '@deepseek-ai/dsh-agent'
import type { GoalProjection } from '@deepseek-ai/dsh-goal'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { CallId, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, UserMessage } from '@deepseek-ai/dsh-session'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats'
import type { ContextBreakdownProjection, ContextPressureProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter'
import type { DiscoveredModel, ProviderDraft, ProviderRow } from './modelProfile/types.js'
import type { LoginOverlayState } from './login/types.js'
import type { PluginRow } from './plugins/types.js'
import type { AgentPresetRow } from './agentPresets/types.js'
import type { ApprovalPromptState, QuestionPromptState } from './interaction/types.js'
import { reasoningOf, textOf } from '../render.js'

/** Which pane of the `/model` overlay is showing. */
export type ModelProfileView = 'list' | 'form'

/** Overlay-owned state for the `/model` provider-profile screen. */
export interface ModelProfileOverlayState {
  readonly view: ModelProfileView
  /** Joined provider directory; `undefined` until the first load settles. */
  readonly providers: readonly ProviderRow[] | undefined
  readonly selected: number
  readonly draft: ProviderDraft | undefined
  /** Bumped on every `editProvider`/`createProvider` so the form remounts with fresh local state. */
  readonly formKey: number
  readonly discovered: readonly DiscoveredModel[] | undefined
  readonly busy: boolean
  readonly error: string | undefined
}

/** Overlay-owned state for the `/presets` agent-preset screen. */
export interface AgentPresetsOverlayState {
  /** Joined preset roster; empty while the first load is still in flight (see `busy`). */
  readonly rows: readonly AgentPresetRow[]
  readonly selected: number
  /** The session's currently resolved preset id, or `undefined` without a mounted service. */
  readonly current: string | undefined
  /** Whether the session has run no turn yet — the only state a preset switch is accepted in. */
  readonly blank: boolean
  readonly busy: boolean
  readonly error: string | undefined
}

/**
 * Full-screen overlay replacing the live region's normal controls — except
 * `'approval'`, which `TuiApp` renders inline in the dock (a live-region row
 * with focus, not a `showOverlay` panel) since it's the highest-frequency
 * interruption and doesn't need to hide the transcript to be answered.
 */
export type Overlay =
  | { readonly kind: 'none' }
  | { readonly kind: 'modelProfile'; readonly modelProfile: ModelProfileOverlayState }
  | { readonly kind: 'login'; readonly login: LoginOverlayState }
  | { readonly kind: 'trajectory' }
  | { readonly kind: 'toolCards' }
  | { readonly kind: 'context' }
  | { readonly kind: 'plugins'; readonly rows: readonly PluginRow[] }
  | { readonly kind: 'agentPresets'; readonly agentPresets: AgentPresetsOverlayState }
  | { readonly kind: 'approval'; readonly approval: ApprovalPromptState }
  | { readonly kind: 'userQuestion'; readonly userQuestion: QuestionPromptState }

/** Whole-log figures for the status bar's stats line; each side is `undefined` without its projection unit mounted. */
export interface StatsSnapshot {
  readonly sessionStats: SessionStatsProjection | undefined
  readonly tokenUsage: TokenUsageProjection | undefined
  readonly contextPressure: ContextPressureProjection | undefined
  readonly contextBreakdown: ContextBreakdownProjection | undefined
}

const EMPTY_STATS: StatsSnapshot = {
  sessionStats: undefined,
  tokenUsage: undefined,
  contextPressure: undefined,
  contextBreakdown: undefined,
}

/** The session's current permission preset, folded from `ctx.permissionPresets`. */
export interface PermissionState {
  /** The effective preset name, or `'custom'` when the knobs match no table entry. */
  readonly current: string
  /** Every switchable preset name, in table declaration order. */
  readonly names: readonly string[]
}

/** The session's current agent preset, folded from `ctx.agentPresets`. */
export interface PresetState {
  /** Display label of the resolved preset, or `undefined` when the deployment composes none. */
  readonly current: string | undefined
  /** Whether the session has run no turn yet — the only state a preset switch is accepted in. */
  readonly blank: boolean
}

/** The currently-generating step's accumulated text, folded live from `assistant/chunk`. */
export interface StreamingState {
  readonly turn: number
  readonly step: number
  readonly text: string
  /** Accumulated reasoning/thinking text, distinct from `text`; empty when the step has none. */
  readonly reasoningText: string
}

/** One tool call sent but with no `tool/result` yet, for the live region's spinner row; collapses into the transcript's one-line summary once its result lands. */
export interface PendingToolCall {
  readonly callId: CallId
  readonly name: string
  readonly arguments: string
}

/** The in-flight local shell-escape run (`!` prompt-mode), mirroring `StreamingState`'s live-region role. */
export interface ShellRunState {
  readonly id: number
  readonly command: string
  readonly output: string
}

/** One settled local shell-escape run, ordered into the permanent transcript after every event observed by the time it finished. */
export interface ShellRunRecord {
  readonly id: number
  readonly command: string
  readonly output: string
  readonly exitCode: number | null
  /** The store's `lastSeq` at completion — sorts this record after every event seen so far and before any observed later. */
  readonly afterSeq: number
}

/** One immutable snapshot of everything the TUI renders. */
export interface TuiState {
  /** Session log so far, in append order. */
  readonly events: readonly SessionEvent[]
  /** Highest `seq` that was seeded from replay rather than observed live. */
  readonly replayThrough: number
  /** Current agent lifecycle state. */
  readonly status: AgentStatus
  /** Messages currently pending in the agent's inbox. */
  readonly queued: readonly UserMessage[]
  /** Transient one-line notice (e.g. `/status`), cleared on the next input. */
  readonly notice: string | undefined
  /** Active full-screen overlay, if any, replacing the prompt/status live region. */
  readonly overlay: Overlay
  /** Current permission preset, or `undefined` when `ctx.permissionPresets` isn't composed in this profile. */
  readonly permission: PermissionState | undefined
  /** The session's current goal (the 'goal' session projection: whole value, or `null` before the first create / after a clear tombstone), or `undefined` when the projection unit isn't composed in this profile. */
  readonly goal: GoalProjection | null | undefined
  /** The session's current title (the 'title' session projection: last-wins `session/title` text, or `null` before the first one lands), or `undefined` when `dsh-session-title` isn't composed in this profile. Drives the terminal window/tab title — see `TuiApp`'s `updateTerminalTitle`. */
  readonly title: string | null | undefined
  /** Whole-log stats-line figures, or `undefined` sides when `ctx.sessionProjections` isn't composed in this profile. */
  readonly stats: StatsSnapshot
  /** Current agent preset, or `undefined` when `ctx.agentPresets` isn't composed in this profile. */
  readonly preset: PresetState | undefined
  /** The in-flight step's accumulated text, or `undefined` when nothing is currently streaming. */
  readonly streaming: StreamingState | undefined
  /** Tool calls sent but not yet resolved by a `tool/result`, in call order. */
  readonly pendingToolCalls: readonly PendingToolCall[]
  /** The in-flight local shell-escape run, or `undefined` when none is running. */
  readonly shellRun: ShellRunState | undefined
  /** Settled local shell-escape runs, in completion order, interleaved into the transcript via `afterSeq`. */
  readonly shellHistory: readonly ShellRunRecord[]
  /** Repo-relative file paths backing the `@`-mention dropdown; `undefined` until the first mention triggers a load. */
  readonly fileIndex: FileIndexState
  /** A newer npm-published version of this package, once the startup registry check (`src/updateCheck.ts`) resolves one; `undefined` while unchecked or already current. */
  readonly updateHint: string | undefined
}

/** The `@`-mention dropdown's backing file list, loaded lazily on first use (see `ensureFileIndex` in `src/index.ts`). */
export interface FileIndexState {
  readonly candidates: readonly string[] | undefined
  readonly loading: boolean
}

const EMPTY_FILE_INDEX: FileIndexState = { candidates: undefined, loading: false }

const CLOSED_OVERLAY: Overlay = { kind: 'none' }

type Listener = () => void

/** Mutable projection; `getSnapshot`/`subscribe` satisfy `useSyncExternalStore`. */
export class TuiStore {
  private state: TuiState
  private readonly listeners = new Set<Listener>()
  private lastSeq: number
  // Not part of TuiState: mid-stream assembly state for the in-flight step,
  // rebuilt fresh whenever a chunk's `{turn, step}` doesn't match the last one.
  private streamingAssembler: BlockAssembler | undefined
  private streamingKey: { turn: number; step: number } | undefined
  // Not part of TuiState either: a `tool/result` event carries no name/arguments
  // of its own (only `message.source.callId`), so a later `presentResult` needs
  // this O(1) lookup back to its `tool/call` rather than an O(n) history scan.
  private readonly toolCalls = new Map<CallId, { name: string; arguments: string }>()
  // Backing map for `pendingToolCalls`: insertion-ordered so its `.values()`
  // snapshot lists calls in the order they were sent, same as `toolCalls`
  // above but pruned as each call's result lands.
  private readonly pendingToolCallsMap = new Map<CallId, { name: string; arguments: string }>()

  constructor(initial: { events: readonly SessionEvent[] }) {
    const lastSeq = initial.events.at(-1)?.seq ?? 0
    this.lastSeq = lastSeq
    for (const event of initial.events) {
      if (event.type === 'tool/call') {
        const call = { name: event.data.name, arguments: event.data.arguments }
        this.toolCalls.set(event.data.callId, call)
        this.pendingToolCallsMap.set(event.data.callId, call)
      } else if (event.type === 'tool/result') {
        this.pendingToolCallsMap.delete(event.data.message.source.callId)
      }
    }
    this.state = {
      // `assistant/chunk` rows from a prior session are never folded into
      // `streaming` (see appendEvent/foldChunk) — dropping them here too
      // keeps a resumed session's <Static> transcript free of dead entries
      // that would only ever render as null.
      events: initial.events.filter(event => event.type !== 'assistant/chunk'),
      replayThrough: lastSeq,
      status: 'idle',
      queued: [],
      notice: undefined,
      overlay: CLOSED_OVERLAY,
      permission: undefined,
      goal: undefined,
      title: undefined,
      stats: EMPTY_STATS,
      preset: undefined,
      streaming: undefined,
      pendingToolCalls: this.pendingToolCallsSnapshot(),
      shellRun: undefined,
      shellHistory: [],
      fileIndex: EMPTY_FILE_INDEX,
      updateHint: undefined,
    }
  }

  getSnapshot = (): TuiState => this.state

  /** The `tool/call` a later `tool/result` correlates with, by `callId`; `undefined` when its call was never seen (e.g. log truncation). */
  getToolCall = (callId: CallId): { name: string; arguments: string } | undefined => this.toolCalls.get(callId)

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Append one live session event, ignoring anything already seeded/seen. */
  appendEvent(event: SessionEvent): void {
    if (event.seq <= this.lastSeq) return
    this.lastSeq = event.seq
    if (event.type === 'tool/call') {
      const call = { name: event.data.name, arguments: event.data.arguments }
      this.toolCalls.set(event.data.callId, call)
      this.pendingToolCallsMap.set(event.data.callId, call)
      this.set({ events: [...this.state.events, event], pendingToolCalls: this.pendingToolCallsSnapshot() })
      return
    }
    if (event.type === 'tool/result') {
      this.pendingToolCallsMap.delete(event.data.message.source.callId)
      this.set({ events: [...this.state.events, event], pendingToolCalls: this.pendingToolCallsSnapshot() })
      return
    }
    if (event.type === 'assistant/chunk') {
      this.foldChunk(event.data)
      return
    }
    if (event.type === 'assistant/message') {
      this.streamingAssembler = undefined
      this.streamingKey = undefined
      this.set({ events: [...this.state.events, event], streaming: undefined })
      return
    }
    this.set({ events: [...this.state.events, event] })
  }

  /** Snapshot `pendingToolCallsMap` into `TuiState`'s array shape, in call order. */
  private pendingToolCallsSnapshot(): PendingToolCall[] {
    return [...this.pendingToolCallsMap.entries()].map(([callId, call]) => ({ callId, ...call }))
  }

  /** Fold one raw stream chunk into the in-flight step's live text, keyed by `{turn, step}`. */
  private foldChunk(data: { turn: number; step: number; chunk: StreamChunk }): void {
    const { turn, step, chunk } = data
    if (this.streamingKey?.turn !== turn || this.streamingKey?.step !== step) {
      this.streamingAssembler = new BlockAssembler()
      this.streamingKey = { turn, step }
    }
    this.streamingAssembler!.push(chunk)
    const blocks = this.streamingAssembler!.blocks()
    const text = textOf(blocks)
    const reasoningText = reasoningOf(blocks)
    this.set({ streaming: text === '' && reasoningText === '' ? undefined : { turn, step, text, reasoningText } })
  }

  setStatus(status: AgentStatus): void {
    if (status === this.state.status) return
    this.set({ status })
  }

  setQueued(queued: readonly UserMessage[]): void {
    this.set({ queued })
  }

  setNotice(notice: string | undefined): void {
    this.set({ notice })
  }

  setPermission(permission: PermissionState | undefined): void {
    this.set({ permission })
  }

  /** Refresh the session's current goal from the 'goal' session projection; `undefined` when the projection unit isn't composed, `null` before the first create or after a clear. */
  setGoal(goal: GoalProjection | null | undefined): void {
    this.set({ goal })
  }

  /** Refresh the session's current title from the 'title' session projection; `undefined` when `dsh-session-title` isn't composed, `null` before the first accepted title. */
  setTitle(title: string | null | undefined): void {
    this.set({ title })
  }

  setStats(stats: StatsSnapshot): void {
    this.set({ stats })
  }

  setPreset(preset: PresetState | undefined): void {
    this.set({ preset })
  }

  private shellRunSeq = 0

  /** Begin one local shell-escape run; its output accumulates via `appendShellOutput` until `finishShellRun` settles it into the transcript. */
  startShellRun(command: string): number {
    const id = ++this.shellRunSeq
    this.set({ shellRun: { id, command, output: '' } })
    return id
  }

  /** Append one chunk of stdout/stderr to the in-flight run; a no-op once it's settled or superseded by a later run. */
  appendShellOutput(id: number, chunk: string): void {
    if (this.state.shellRun?.id !== id) return
    this.set({ shellRun: { ...this.state.shellRun, output: this.state.shellRun.output + chunk } })
  }

  /** Settle the in-flight run into the permanent transcript; a no-op once it's already settled or superseded. */
  finishShellRun(id: number, exitCode: number | null): void {
    if (this.state.shellRun?.id !== id) return
    const { command, output } = this.state.shellRun
    this.set({
      shellRun: undefined,
      shellHistory: [...this.state.shellHistory, { id, command, output, exitCode, afterSeq: this.lastSeq }],
    })
  }

  /** Open the `/model` overlay to a fresh, loading provider list. */
  openModelProfile(): void {
    this.set({
      overlay: {
        kind: 'modelProfile',
        modelProfile: {
          view: 'list',
          providers: undefined,
          selected: 0,
          draft: undefined,
          formKey: 0,
          discovered: undefined,
          busy: true,
          error: undefined,
        },
      },
    })
  }

  /** Open the `/login` sign-in overlay to a fresh, loading flow list. */
  openLogin(): void {
    this.set({
      overlay: {
        kind: 'login',
        login: { flows: undefined, selected: 0, signingIn: undefined, prompt: undefined, busy: true, error: undefined },
      },
    })
  }

  /** Patch the open `/login` overlay's sub-state; a no-op once it's closed. */
  updateLogin(patch: Partial<LoginOverlayState>): void {
    if (this.state.overlay.kind !== 'login') return
    this.set({
      overlay: { kind: 'login', login: { ...this.state.overlay.login, ...patch } },
    })
  }

  /** Open the `/trajectory` ledger overlay. */
  openTrajectory(): void {
    this.set({ overlay: { kind: 'trajectory' } })
  }

  /** Open the expandable Tool Cards inspector. */
  openToolCards(): void {
    this.set({ overlay: { kind: 'toolCards' } })
  }

  /** Open the `/context` usage overlay. */
  openContext(): void {
    this.set({ overlay: { kind: 'context' } })
  }

  /** Open the `/plugins` loaded-plugin-tree overlay with a snapshotted row list. */
  openPlugins(rows: readonly PluginRow[]): void {
    this.set({ overlay: { kind: 'plugins', rows } })
  }

  /** Open the `/presets` overlay to a fresh, loading roster. */
  openAgentPresets(init: { current: string | undefined; blank: boolean }): void {
    this.set({
      overlay: {
        kind: 'agentPresets',
        agentPresets: { rows: [], selected: 0, current: init.current, blank: init.blank, busy: true, error: undefined },
      },
    })
  }

  /** Present one pending tool-approval decision, taking over the live region. */
  openApproval(approval: ApprovalPromptState): void {
    this.set({ overlay: { kind: 'approval', approval } })
  }

  /** Present one pending question, taking over the live region. */
  openUserQuestion(userQuestion: QuestionPromptState): void {
    this.set({ overlay: { kind: 'userQuestion', userQuestion } })
  }

  /** Close whichever overlay is open, restoring the normal prompt/status controls. */
  closeOverlay(): void {
    this.set({ overlay: CLOSED_OVERLAY })
  }

  /** Patch the open `/model` overlay's sub-state; a no-op once it's closed. */
  updateModelProfile(patch: Partial<ModelProfileOverlayState>): void {
    if (this.state.overlay.kind !== 'modelProfile') return
    this.set({
      overlay: { kind: 'modelProfile', modelProfile: { ...this.state.overlay.modelProfile, ...patch } },
    })
  }

  /** Patch the open `/presets` overlay's sub-state; a no-op once it's closed. */
  updateAgentPresets(patch: Partial<AgentPresetsOverlayState>): void {
    if (this.state.overlay.kind !== 'agentPresets') return
    this.set({
      overlay: { kind: 'agentPresets', agentPresets: { ...this.state.overlay.agentPresets, ...patch } },
    })
  }

  /** Move the `/presets` overlay's list cursor. */
  selectAgentPresetRow(index: number): void {
    this.updateAgentPresets({ selected: index })
  }

  /** Mark the `@`-mention file index as loading; a no-op once candidates are already present. */
  setFileIndexLoading(): void {
    if (this.state.fileIndex.candidates !== undefined) return
    this.set({ fileIndex: { candidates: undefined, loading: true } })
  }

  /** Settle the `@`-mention file index once `loadFileIndex` resolves. */
  setFileIndex(candidates: readonly string[]): void {
    this.set({ fileIndex: { candidates, loading: false } })
  }

  /** Record a newer npm-published version found by the startup update check; persists for the session (not cleared by `/clear`'s notice reset) until dismissed by a fresh check finding none. */
  setUpdateHint(version: string | undefined): void {
    this.set({ updateHint: version })
  }

  private set(partial: Partial<TuiState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener()
  }
}
