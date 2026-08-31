/**
 * Root orchestrator: builds the pi-tui component tree once, then patches it
 * imperatively from `TuiStore` change notifications — the pi-tui equivalent
 * of `App.tsx` (root component) + `mount.tsx` (the `render()` call site)
 * combined, since pi-tui has no JSX/reconciler to split those across.
 *
 * Two different update strategies are used, deliberately:
 *
 * - The live region (notice, queued preview, streaming text, status bar,
 *   stats line, permission indicator, update hint) is a `DynamicText`/`Spinner` per row,
 *   each pulling straight from `store.getSnapshot()` at render time. There is
 *   no manual `setText` bookkeeping to keep in sync — every repaint just
 *   reflects whatever the store currently holds. The approve/reject panel
 *   (`ApprovalSlot`) is a live-region row too, but an interactive one: it
 *   delegates render/input to whichever `ApprovalOverlay` is currently
 *   active and takes focus while one is, rather than covering the screen.
 * - The transcript is append-only: `appendNewTranscriptItems` diffs the
 *   store's `events`/`shellHistory` arrays against how much has already been
 *   turned into a `createTranscriptLine` child of `documentContainer`,
 *   appending only the new tail. Re-formatting the whole transcript on every
 *   store change would be wasteful for a long session — `ScrollView`'s own
 *   viewport culling (confirmed in pi-tui's own test suite: painting a huge
 *   scroll child is O(viewport), not O(content)) is what makes this safe to
 *   grow without bound.
 *
 * Overlays (`/model`, `/trajectory`, Ctrl+O tool cards, `/context`,
 * `/plugins`, `/presets`, question) are `tui.showOverlay(...)` calls keyed
 * off `store.getSnapshot().overlay.kind` — see `updateOverlay`. Approval is
 * the one exception: it renders inline in the dock instead (see above).
 * @module @tomowang/dsh-tui/tui/TuiApp
 */

import {
  TuiAltScreen,
  ProcessTerminal,
  Container,
  ScrollView,
  VStack,
  HStack,
  KeybindingsManager,
  TUI_KEYBINDINGS,
  setKeybindings,
  visibleWidth,
  type TUI,
  type Component,
  type OverlayHandle,
} from '@earendil-works/pi-tui'
import type { RenderOptions } from '../render.js'
import { formatEvent, formatPendingToolCalls, formatShellRun, formatShellRunLive, formatStreamingText } from '../render.js'
import { buildContextLine, buildStatsLine } from './statsFormat.js'
import { buildGoalBarText, buildPermissionText, buildQueuedText, buildStatusBarText, buildTerminalTitle, buildUpdateHintText } from './liveText.js'
import { createTranscriptLine, DynamicText, padTranscriptText } from './text.js'
import { CustomEditor } from './CustomEditor.js'
import { Spinner } from './Spinner.js'
import { readClipboard } from './clipboard.js'
import { YlyPet } from '../yly/yly-pet.js'
import type { YlyState as YlyMode } from '../yly/yly-programs.js'
import type { TuiActions } from './actions.js'
import type { TuiState, TuiStore } from './store.js'
import { theme, fg } from './theme.js'
import { ModelProfileOverlay } from './modelProfile/ModelProfileOverlay.js'
import { TrajectoryOverlay } from './trajectory/TrajectoryOverlay.js'
import { ToolCardsOverlay } from './toolCards/ToolCardsOverlay.js'
import { ContextOverlay } from './context/ContextOverlay.js'
import { PluginsOverlay } from './plugins/PluginsOverlay.js'
import { AgentPresetsOverlay } from './agentPresets/AgentPresetsOverlay.js'
import { ApprovalOverlay } from './interaction/ApprovalOverlay.js'
import { QuestionOverlay } from './interaction/QuestionOverlay.js'

const secondary = fg(theme.secondary)

export interface MountOptions {
  readonly store: TuiStore
  readonly actions: TuiActions
  readonly sessionId: string
  readonly provider: string
  readonly model: string
  readonly version: string
  readonly cwd: string
  /** Submitted-line history for the prompt's up/down-arrow recall; owned outside this tree so `/clear` can preserve it. */
  readonly promptHistory: string[]
  /** Look up a tool's declared presentation, for `tool/call`/`tool/result` cards. */
  readonly getTool: RenderOptions['getTool']
  /** Look up a `tool/call`'s name/arguments by `callId`, for a `tool/result` to present with. */
  readonly getToolCall: RenderOptions['getToolCall']
}

export interface TuiHandle {
  unmount(options?: { preserveScreen?: boolean }): void
  waitUntilExit(): Promise<void>
}

/** Full-screen panel anchored at the top — every overlay's uniform placement. */
const OVERLAY_OPTIONS = { anchor: 'top-left' as const, row: 0, col: 0, width: '100%' as const, maxHeight: '100%' as const }

/**
 * Wraps an overlay `Component` so it always paints every cell of the
 * terminal, not just however many lines its own content happens to need.
 * `tui.showOverlay` composites exactly what `render()` returns onto the base
 * frame at the requested position/size — it does not clear or pad the rest
 * of that box — so a short overlay (e.g. a "No tool cards yet" one-liner)
 * otherwise leaves the transcript/dock's last-painted content visible
 * underneath it, which reads as a rendering bug (old messages "bleeding
 * through" around a top-anchored panel) rather than an intentional
 * takeover. Padding to the full terminal height/width here, once, means no
 * individual overlay has to reimplement this.
 */
class FullScreenOverlay implements Component {
  constructor(
    private readonly inner: Component,
    private readonly tui: TUI,
  ) {}

  get wantsKeyRelease(): boolean {
    return this.inner.wantsKeyRelease ?? false
  }

  invalidate(): void {
    this.inner.invalidate()
  }

  handleInput(data: string): void {
    this.inner.handleInput?.(data)
  }

  render(width: number): string[] {
    const lines = this.inner.render(width)
    const height = Math.max(lines.length, this.tui.terminal.rows)
    const padded: string[] = []
    for (let i = 0; i < height; i++) {
      const line = lines[i] ?? ''
      const pad = width - visibleWidth(line)
      padded.push(pad > 0 ? line + ' '.repeat(pad) : line)
    }
    return padded
  }
}

/**
 * Dock row that delegates to whichever `ApprovalOverlay` is currently
 * active, or renders nothing between approvals. Unlike the other dock rows
 * (`DynamicText`, pulling read-only text from the store each render), this
 * one also takes focus and forwards keystrokes — it's how the approve/reject
 * panel gets shown inline, in the live region, instead of as a
 * full-screen `showOverlay` panel covering the transcript.
 */
class ApprovalSlot implements Component {
  private current: ApprovalOverlay | undefined

  set(component: ApprovalOverlay | undefined): void {
    this.current = component
  }

  invalidate(): void {
    this.current?.invalidate()
  }

  render(width: number): string[] {
    return this.current?.render(width) ?? []
  }

  handleInput(data: string): void {
    this.current?.handleInput(data)
  }
}

let activeTui: TUI | undefined

/**
 * Synchronous, best-effort terminal restoration for a crash exit — the same
 * last-line-of-defense role the old Ink-era `restoreTerminal()` played, now
 * delegating to `tui.stop()` (which owns raw mode, alt-screen exit, and
 * cursor visibility) instead of hand-writing ANSI escapes.
 */
export function restoreActiveTerminal(): void {
  if (activeTui === undefined) return
  const tui = activeTui
  activeTui = undefined
  try {
    tui.stop()
  } catch {
    // Already stopped, or the process is exiting either way.
  }
}

let keybindingsConfigured = false

/**
 * Emacs-style Ctrl+P/Ctrl+N aliases, and history recall on up/down —
 * matching the old hand-rolled `PromptInput` exactly. Also frees `Home`/`End`
 * from `TuiAltScreen`'s default viewport-jump-to-top/bottom bindings: the
 * alt-screen's own viewport navigation intercepts input *before* it reaches
 * the focused component (confirmed empirically — an unmodified `Home`
 * scrolled the transcript instead of moving the prompt's cursor to line
 * start), which would otherwise silently break `Editor`'s own
 * `cursorLineStart`/`cursorLineEnd` (`Home`/`End`/Ctrl+A/Ctrl+E) whenever the
 * prompt has focus, which is effectively always. `Ctrl+A`/`Ctrl+E` still
 * give line motion and `PageUp`/`PageDown`/mouse wheel still give transcript
 * scroll, so unbinding the dedicated top/bottom jump is a reasonable trade.
 * Configured once, globally (pi-tui's keybinding registry is module-global,
 * not per-instance).
 */
function ensureKeybindings(): void {
  if (keybindingsConfigured) return
  keybindingsConfigured = true
  setKeybindings(
    new KeybindingsManager(TUI_KEYBINDINGS, {
      'tui.editor.cursorUp': ['up', 'ctrl+p'],
      'tui.editor.cursorDown': ['down', 'ctrl+n'],
      'tui.editor.historyPrevious': ['up', 'ctrl+p'],
      'tui.editor.historyNext': ['down', 'ctrl+n'],
      'tui.altScreen.top': [],
      'tui.altScreen.bottom': [],
    }),
  )
}

class TuiApp implements TuiHandle {
  private readonly tui: TuiAltScreen
  private readonly documentContainer = new Container()
  private readonly editor: CustomEditor
  private readonly spinner: Spinner
  private readonly pet: YlyPet
  private appendedEventsCount = 0
  private appendedShellCount = 0
  private currentOverlayKind: TuiState['overlay']['kind'] = 'none'
  private overlayHandle: OverlayHandle | undefined
  private readonly approvalSlot = new ApprovalSlot()
  private wasRunning = false
  private stopped = false
  /** Last title string sent to the terminal, so an unrelated store change doesn't re-issue the same OSC 0 write every render. */
  private lastTerminalTitle: string | undefined

  constructor(private readonly options: MountOptions) {
    const { store, actions } = options
    const terminal = new ProcessTerminal()
    this.tui = new TuiAltScreen(terminal, true, undefined, {
      mouse: true,
      // Secondary-click paste: pi-tui only wires this on Windows, so ACRYL
      // patches that gate open and reads the clipboard here (see
      // `patches/@earendil-works__pi-tui@0.84.2.patch`). Injecting as a
      // bracketed-paste sequence routes it through the same path as Cmd+V, so
      // both the Editor and every miniTextField field handle it identically.
      onRightClickPaste: () => {
        void readClipboard()
          .then(text => this.tui.getFocusedComponent()?.handleInput?.(`\x1b[200~${text}\x1b[201~`))
          .catch(() => {})
      },
    })
    this.spinner = new Spinner(this.tui)
    this.pet = new YlyPet(this.tui)

    const transcriptScrollView = new ScrollView(this.documentContainer, { follow: 'end', primary: true, overscroll: 'chain' })

    this.editor = new CustomEditor(this.tui, actions, {
      getStatus: () => store.getSnapshot().status,
      history: options.promptHistory,
      getFileCandidates: () => this.waitForFileIndex(),
    })

    const noticeText = new DynamicText(() => {
      const notice = store.getSnapshot().notice
      return notice === undefined ? '' : secondary(notice)
    })
    // The goal strip, docked above the queued preview — the terminal GoalBar
    // (see `buildGoalBarText`), mirroring the web portal's input-dock stack
    // where the GoalBar card sits above the Queue panel.
    const goalText = new DynamicText(() => buildGoalBarText(store.getSnapshot().goal))
    const queuedText = new DynamicText(() => buildQueuedText(store.getSnapshot().queued))
    const streamingText = new DynamicText(width => {
      const streaming = store.getSnapshot().streaming
      if (streaming === undefined) return ''
      const text = formatStreamingText(streaming.text, streaming.reasoningText, this.spinner.current()) ?? ''
      return padTranscriptText(text, width).join('\n')
    })
    const pendingToolCallsText = new DynamicText(width => {
      const { pendingToolCalls } = store.getSnapshot()
      const text = formatPendingToolCalls(pendingToolCalls, this.spinner.current(), options.getTool)
      return padTranscriptText(text, width).join('\n')
    })
    const shellRunLiveText = new DynamicText(width => {
      const run = store.getSnapshot().shellRun
      if (run === undefined) return ''
      return padTranscriptText(formatShellRunLive(run.command, run.output), width).join('\n')
    })
    const statusBarText = new DynamicText(() => {
      const state = store.getSnapshot()
      return buildStatusBarText({
        sessionId: options.sessionId,
        provider: options.provider,
        model: options.model,
        status: state.status,
        queuedCount: state.queued.length,
        presetLabel: state.preset?.current,
        eventCount: state.events.length,
        spinnerChar: this.spinner.current(),
      })
    })
    const permissionText = new DynamicText(() => buildPermissionText(store.getSnapshot().permission))
    const updateHintText = new DynamicText(() => buildUpdateHintText(options.version, store.getSnapshot().updateHint))
    const statsLineText = new DynamicText(() => {
      const stats = store.getSnapshot().stats
      const line = buildStatsLine(stats.sessionStats, stats.tokenUsage)
      const context = buildContextLine(stats.contextPressure)
      return [line, context].filter(group => group !== '').join('| ')
    })

    const dock = new VStack(
      [
        noticeText,
        goalText,
        queuedText,
        streamingText,
        pendingToolCallsText,
        shellRunLiveText,
        statusBarText,
        this.approvalSlot,
        this.editor,
        permissionText,
        updateHintText,
        statsLineText,
      ],
      { gap: 0 },
    )
    // Fixed ACRYL header: the YLY pet (top-left, animated) beside the brand
    // name + session info. Unlike the old whale banner this does not scroll
    // with the transcript — the pet stays put while the conversation scrolls.
    const headerInfo = new DynamicText(() => {
      const { provider, model, cwd } = options
      return [fg(theme.primary)('ACRYL'), '', `${provider}/${model}`, cwd].join('\n')
    })
    const header = new HStack(
      [
        { component: this.pet, basis: 34, shrink: 0 },
        { component: headerInfo, basis: 'auto', grow: 1 },
      ],
      { gap: 1, align: 'start' },
    )

    const layoutRoot = new VStack(
      [
        { component: header, basis: 'auto', shrink: 0 },
        { component: transcriptScrollView, basis: 0, grow: 1, minSize: 1 },
        { component: dock, basis: 'auto', shrink: 1, minSize: 1 },
      ],
      { gap: 0 },
    )
    this.tui.setLayoutRoot(layoutRoot)
    this.tui.setFocus(this.editor)

    this.appendNewTranscriptItems(store.getSnapshot())
    this.updateTerminalTitle(store.getSnapshot().title)
    this.updatePetMode(store.getSnapshot())
    store.subscribe(() => {
      const state = store.getSnapshot()
      this.appendNewTranscriptItems(state)
      this.updateOverlay(state.overlay)
      this.updateTerminalTitle(state.title)
      this.updatePetMode(state)
      const running = state.status === 'running'
      if (running !== this.wasRunning) {
        this.wasRunning = running
        if (running) this.spinner.start()
        else this.spinner.stop()
      }
      this.tui.requestRender()
    })
  }

  /** Drive the YLY pet's mode from the live agent state (idle/thinking/tool/typing). */
  private updatePetMode(state: TuiState): void {
    let mode: YlyMode = 'idle'
    if (state.status === 'running') {
      if (state.pendingToolCalls.length > 0) mode = 'tool'
      else if (state.streaming !== undefined && (state.streaming.text !== '' || state.streaming.reasoningText !== '')) mode = 'typing'
      else mode = 'thinking'
    }
    this.pet.setMode(mode)
  }

  /** Push the terminal window/tab title (OSC 0) when the session's title projection changes; a no-op once already reflecting the current value. */
  private updateTerminalTitle(title: string | null | undefined): void {
    const text = buildTerminalTitle(title)
    if (text === this.lastTerminalTitle) return
    this.lastTerminalTitle = text
    this.tui.terminal.setTitle(text)
  }

  start(): void {
    activeTui = this.tui
    this.pet.start()
    this.tui.start()
  }

  private appendNewTranscriptItems(state: TuiState): void {
    const { getTool, getToolCall } = this.options
    if (state.events.length > this.appendedEventsCount) {
      for (let i = this.appendedEventsCount; i < state.events.length; i++) {
        const event = state.events[i]
        const formatted = formatEvent(event, { replay: event.seq <= state.replayThrough, getTool, getToolCall })
        if (formatted !== undefined && formatted !== '') this.documentContainer.addChild(createTranscriptLine(formatted))
      }
      this.appendedEventsCount = state.events.length
    }
    if (state.shellHistory.length > this.appendedShellCount) {
      for (let i = this.appendedShellCount; i < state.shellHistory.length; i++) {
        const run = state.shellHistory[i]
        this.documentContainer.addChild(createTranscriptLine(formatShellRun(run.command, run.output, run.exitCode)))
      }
      this.appendedShellCount = state.shellHistory.length
    }
  }

  /** Loads (once, cached in the store) and resolves with the `@`-mention file index, for `CustomEditor`'s autocomplete provider. */
  private waitForFileIndex(): Promise<readonly string[]> {
    const { store, actions } = this.options
    actions.ensureFileIndex()
    const snapshot = store.getSnapshot().fileIndex
    if (snapshot.candidates !== undefined) return Promise.resolve(snapshot.candidates)
    return new Promise(resolve => {
      const unsubscribe = store.subscribe(() => {
        const current = store.getSnapshot().fileIndex
        if (current.candidates !== undefined) {
          unsubscribe()
          resolve(current.candidates)
        }
      })
    })
  }

  private buildOverlayComponent(overlay: TuiState['overlay']): Component | undefined {
    const { store, actions, getTool, getToolCall } = this.options
    switch (overlay.kind) {
      case 'none':
        return undefined
      case 'modelProfile':
        return new ModelProfileOverlay(store, actions)
      case 'trajectory':
        return new TrajectoryOverlay(this.tui, store, actions, getTool)
      case 'toolCards':
        return new ToolCardsOverlay(this.tui, store, actions, getTool, getToolCall)
      case 'context':
        return new ContextOverlay(store, actions)
      case 'plugins':
        return new PluginsOverlay(this.tui, overlay.rows, actions)
      case 'agentPresets':
        return new AgentPresetsOverlay(store, actions)
      case 'approval':
        // Rendered inline via `approvalSlot` in `updateOverlay` instead —
        // never reaches a full-screen `showOverlay` panel.
        return undefined
      case 'userQuestion':
        return new QuestionOverlay(overlay.userQuestion, actions)
    }
  }

  private updateOverlay(overlay: TuiState['overlay']): void {
    if (overlay.kind === this.currentOverlayKind) return
    const previousKind = this.currentOverlayKind
    this.currentOverlayKind = overlay.kind
    if ((overlay.kind === 'approval' || overlay.kind === 'userQuestion') && previousKind !== 'approval' && previousKind !== 'userQuestion') {
      // OSC 9 desktop notification — same mechanism Claude Code's own CLI
      // uses; Ghostty/Kitty/iTerm2 forward it straight to the OS
      // notification center, and a terminal without OSC 9 support just
      // ignores the unrecognized sequence (no fallback needed).
      const message = overlay.kind === 'approval' ? 'ACRYL is waiting for your approval' : 'ACRYL is waiting for your answer'
      this.tui.terminal.write(`\x1b]9;${message}\x07`)
    }
    if (previousKind === 'approval') this.approvalSlot.set(undefined)
    if (this.overlayHandle !== undefined) {
      this.overlayHandle.hide()
      this.overlayHandle = undefined
    }
    if (overlay.kind === 'approval') {
      this.approvalSlot.set(new ApprovalOverlay(overlay.approval, this.options.actions))
      this.tui.setFocus(this.approvalSlot)
      return
    }
    this.tui.setFocus(this.editor)
    const component = this.buildOverlayComponent(overlay)
    if (component === undefined) return
    this.overlayHandle = this.tui.showOverlay(new FullScreenOverlay(component, this.tui), OVERLAY_OPTIONS)
  }

  unmount(options?: { preserveScreen?: boolean }): void {
    if (this.stopped) return
    this.stopped = true
    this.spinner.stop()
    this.pet.stop()
    this.tui.stop(options)
    if (activeTui === this.tui) activeTui = undefined
  }

  waitUntilExit(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }
}

/** Mount the interactive front door. */
export function mountTui(options: MountOptions): TuiHandle {
  ensureKeybindings()
  const app = new TuiApp(options)
  app.start()
  return app
}
