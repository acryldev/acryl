/**
 * The reader's line of input. Subclasses pi-tui's `Editor` rather than
 * re-implementing readline-style editing: multi-line motion, kill-ring word
 * ops, undo, and history recall are all already Editor defaults (see
 * `TUI_KEYBINDINGS` in the pi-tui package — its defaults already match this
 * app's old hand-rolled bindings almost 1:1: Ctrl+B/F, Ctrl+A/E, Alt+Left/
 * Right, Ctrl+W, Alt+D, Ctrl+K/U all come for free). What's genuinely new
 * here, layered on top via `handleInput`/`render` overrides, mirrors the
 * pieces the old `PromptInput.tsx` had to hand-roll because Ink had no
 * equivalent: `Ctrl+O` (Tool Cards toggle), shell mode (a leading `!` on an
 * empty buffer swaps Enter to run a local command), `Shift+Tab` (permission
 * preset cycle), and the two-press Ctrl+C/Ctrl+D exit-arm sequence — all
 * short-circuited before `super.handleInput` so Editor's own bindings never
 * see them. Slash-command and `@`-mention completion are *not* hand-rolled
 * here at all: they're a `PromptAutocompleteProvider` (see
 * `promptAutocomplete.ts`) wired via `setAutocompleteProvider`, and Editor
 * renders and drives that dropdown itself.
 * @module @tomowang/dsh-tui/tui/CustomEditor
 */

import type { AgentStatus } from '@deepseek-ai/dsh-agent'
import { Editor, Key, matchesKey, type TUI } from '@earendil-works/pi-tui'
import type { TuiActions } from './actions.js'
import { matchSlashCommands, parseGoalCommand, parsePlanCommand, runSlashCommand } from './commands.js'
import { editorTheme, shellModeEditorBorderColor } from './piTheme.js'
import { PromptAutocompleteProvider, type GetFileCandidates } from './promptAutocomplete.js'
import { theme, fg } from './theme.js'

const EXIT_ARM_TIMEOUT_MS = 2000
const armedHint = fg(theme.muted)
const shellModeHint = fg(theme.warning)

export interface CustomEditorDeps {
  readonly getStatus: () => AgentStatus
  /** Submitted-line history for up/down-arrow recall; owned outside the component tree so it survives `/clear`. */
  readonly history: string[]
  readonly getFileCandidates: GetFileCandidates
}

export class CustomEditor extends Editor {
  private shellMode = false
  private armedKey: 'c' | 'd' | undefined
  private armTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    tui: TUI,
    private readonly actions: TuiActions,
    private readonly deps: CustomEditorDeps,
  ) {
    // paddingX: 2 reserves exactly the width of the `'› '`/`'! '` prompt
    // prefix `render()` splices into the first content row below — Editor's
    // own box has no left/right border glyphs (just a horizontal rule above
    // and below, see `dist/components/editor.js`), so a content row's first
    // `paddingX` characters are always literal, uncolored spaces, safe to
    // overwrite in place without touching the actual text or its layout.
    // 20 is pi-tui's own hard cap for `autocompleteMaxVisible` (see
    // `EditorOptions` in `dist/components/editor.d.ts`) — the highest this
    // dropdown can go without pi-tui adding a taller ceiling itself.
    super(tui, editorTheme, { paddingX: 2, autocompleteMaxVisible: 20 })
    this.setAutocompleteProvider(new PromptAutocompleteProvider(deps.getFileCandidates))
    this.onSubmit = (text) => this.handleSubmit(text)
    // Seed up/down-arrow recall with the persisted history (oldest first) so
    // prompts from earlier runs — and from before a `/clear` remount, which
    // builds a fresh editor — are navigable from the first keystroke, not
    // only ones submitted through this instance. `addToHistory` unshifts, so
    // the resulting order is newest-first exactly as `navigateHistory`
    // expects, with its own dedupe and 100-entry cap applied — pre-sliced to
    // the newest 100 here too, so an install with years of persisted history
    // doesn't pay O(persisted-count) unshift work on every construction just
    // to end up keeping the same last 100 entries.
    for (const line of deps.history.slice(-100)) this.addToHistory(line)
  }

  private armOrConfirmExit(key: 'c' | 'd'): void {
    if (this.armedKey === key) {
      if (this.armTimer !== undefined) clearTimeout(this.armTimer)
      this.armedKey = undefined
      this.actions.shutdown()
      return
    }
    if (this.armTimer !== undefined) clearTimeout(this.armTimer)
    this.armedKey = key
    this.tui.requestRender()
    this.armTimer = setTimeout(() => {
      this.armTimer = undefined
      this.armedKey = undefined
      this.tui.requestRender()
    }, EXIT_ARM_TIMEOUT_MS)
  }

  private clearArm(): void {
    if (this.armTimer !== undefined) clearTimeout(this.armTimer)
    this.armTimer = undefined
    this.armedKey = undefined
  }

  private setShellMode(enabled: boolean): void {
    this.shellMode = enabled
    this.borderColor = enabled ? shellModeEditorBorderColor : editorTheme.borderColor
  }

  private handleSubmit(text: string): void {
    const trimmed = text.trim()
    const shellMode = this.shellMode
    this.setShellMode(false)
    if (trimmed === '') return
    if (this.deps.history.at(-1) !== trimmed) {
      this.deps.history.push(trimmed)
      this.actions.recordHistory(trimmed)
    }
    this.addToHistory(trimmed)
    if (shellMode) {
      this.actions.runShell(trimmed)
      return
    }
    // `/plan` takes a free-text argument (a message, or `off`), so it's
    // parsed ahead of the whitespace-free command matching below.
    const planArgs = parsePlanCommand(trimmed)
    if (planArgs !== undefined) {
      this.actions.plan(planArgs)
      return
    }
    // `/goal` takes a free-text objective (or a control word), so it shares
    // `/plan`'s parse-ahead shape — a bare `/goal` routes here too, ahead of
    // the whitespace-free matcher.
    const goalCommand = parseGoalCommand(trimmed)
    if (goalCommand !== undefined) {
      this.actions.goal(goalCommand)
      return
    }
    const matches = trimmed.startsWith('/') && !/\s/.test(trimmed) ? matchSlashCommands(trimmed) : []
    if (matches.length > 0) {
      runSlashCommand(matches[0].command, this.actions)
      return
    }
    this.actions.send(trimmed)
  }

  override handleInput(data: string): void {
    // The permanent transcript is append-only, so tool-card expansion lives
    // in its own overlay — Ctrl+O always opens it, before anything else.
    if (matchesKey(data, Key.ctrl('o'))) {
      this.actions.openToolCards()
      return
    }
    // A leading `!` at an empty prompt is Claude Code's shell-mode
    // convention: it's consumed rather than inserted, so Backspace on an
    // empty shell-mode buffer (which would otherwise no-op) exits it — same
    // convention as the Ctrl+C/Ctrl+D exit-arming below.
    if (!this.shellMode && data === '!' && this.getText() === '') {
      this.setShellMode(true)
      this.tui.requestRender()
      return
    }
    if (this.shellMode && (matchesKey(data, Key.escape) || (matchesKey(data, Key.backspace) && this.getText() === ''))) {
      this.setShellMode(false)
      this.tui.requestRender()
      return
    }
    // Shift+Tab cycles the permission preset, mirroring Claude Code's mode switcher.
    if (matchesKey(data, 'shift+tab')) {
      this.actions.cyclePermission()
      return
    }
    if (matchesKey(data, Key.ctrl('c'))) {
      if (this.deps.getStatus() === 'running') {
        this.actions.cancel()
        return
      }
      if (this.getText() !== '') {
        this.setText('')
        this.setShellMode(false)
        this.clearArm()
        this.tui.requestRender()
        return
      }
      this.armOrConfirmExit('c')
      return
    }
    if (matchesKey(data, Key.ctrl('d'))) {
      // While a turn is running, Ctrl+D does nothing at all (neither
      // forward-delete nor exit-arm) — mirrors the old PromptInput exactly.
      if (this.deps.getStatus() === 'running') return
      if (this.getText() !== '') {
        // Editor's own default keybinding (`tui.editor.deleteCharForward`)
        // already includes ctrl+d — let it handle the actual delete.
        super.handleInput(data)
        return
      }
      this.armOrConfirmExit('d')
      return
    }
    super.handleInput(data)
  }

  override render(width: number): string[] {
    const hints: string[] = []
    if (this.armedKey !== undefined) hints.push(armedHint(`Press Ctrl+${this.armedKey.toUpperCase()} again to exit`))
    if (this.shellMode) hints.push(shellModeHint('! shell mode — Enter runs the command, Esc/Backspace exits'))
    return [...hints, ...this.withPromptPrefix(super.render(width), width)]
  }

  /**
   * Splices a `'› '`/`'! '` prompt marker into the editor box's first
   * content row (index 1 — index 0 is always the top border), replacing
   * that row's leading `paddingX` spaces. Skipped below `paddingX: 2`'s
   * width-clamped floor (mirrors `Editor.render`'s own `maxPadding` clamp)
   * rather than risk eating actual text in a pathologically narrow terminal.
   */
  private withPromptPrefix(lines: string[], width: number): string[] {
    if (lines.length < 2) return lines
    const maxPadding = Math.max(0, Math.floor((width - 1) / 2))
    if (maxPadding < 2) return lines
    const prefix = this.borderColor(this.shellMode ? '! ' : '› ')
    const next = [...lines]
    next[1] = prefix + next[1].slice(2)
    return next
  }
}
