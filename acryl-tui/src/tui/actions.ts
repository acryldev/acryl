/**
 * Callback surface the TUI's interactive components (the prompt editor,
 * every overlay) call into; implemented once in `src/index.ts`, where each
 * method closes over the live `Agent`/`TuiStore`/services. Framework-free so
 * it can be shared by `commands.ts`, the prompt editor, and every overlay
 * without any of them depending on pi-tui.
 * @module @tomowang/dsh-tui/tui/actions
 */

import type { GoalCommand } from './commands.js'
import type { ProviderDraft, ProviderRow } from './modelProfile/types.js'
import type { QuestionAnswer } from './interaction/types.js'

export interface TuiActions {
  /** Route free text to steering (running) or follow-up (idle). */
  send(text: string): void
  /** Run one local shell command (not sent to the agent) and print its output to the transcript. */
  runShell(command: string): void
  /** Cancel the active turn. */
  cancel(): void
  /** Flush and exit. */
  shutdown(): void
  /** Publish the `/help` command list and key shortcuts as the live-region notice. */
  help(): void
  /** Persist one newly submitted history line for cross-session up/down-arrow recall (best-effort; no-op without a settings service). */
  recordHistory(line: string): void
  /** Flush the current session, then start a brand-new one in a fresh screen. */
  clear(): void
  /** Switch to the next permission preset (read-only/workspace-write/full-access), wrapping around. */
  cyclePermission(): void
  /** Manually trigger session-history compaction via `ctx.compaction`. */
  compact(): void
  /** Enter plan mode (optionally steering `rawInput` as its first message), or `off` to leave it, via `ctx.planMode`. */
  plan(rawInput: string): void
  /** Run one parsed `/goal` command (show/create/edit/pause/resume/clear) via `ctx.goals`. */
  goal(command: GoalCommand): void
  /** Start (or no-op if already loaded/loading) the background load backing the `@`-mention dropdown. */
  ensureFileIndex(): void

  /** Open the `/model` provider-profile overlay and start loading providers. */
  openModelProfile(): void
  /** Configure provider authentication: open the provider list (the auth surface). */
  login(): void
  /** Remove provider authentication for the active provider (clears its stored API key). */
  logout(): void
  /** Close the `/model` overlay, discarding any in-progress edit. */
  closeModelProfile(): void
  /** Return from the add/edit form to the provider list without saving. */
  backToProviderList(): void
  /** Move the provider list's selection cursor. */
  selectProvider(index: number): void
  /** Open a blank draft for a new custom provider. */
  createProvider(): void
  /** Open an existing provider's stored profile for editing. */
  editProvider(route: string): void
  /** Persist a draft via `ctx.settings`/`ctx.credentials`, then reload the list. */
  saveProvider(draft: ProviderDraft): void
  /** Remove a provider's settings section and credential. */
  deleteProvider(row: ProviderRow): void
  /** Probe a draft's endpoint via `ctx.llm.discoverModels`. */
  discoverModelsForDraft(draft: ProviderDraft): void
  /** Save `{provider, model}` as the Agent's default model selection. */
  setActiveModel(provider: string, model: string): void

  /** Open the `/trajectory` ledger overlay. */
  openTrajectory(): void
  /** Close the `/trajectory` overlay. */
  closeTrajectory(): void

  /** Open the Tool Cards inspector, where individual cards can expand/collapse. */
  openToolCards(): void
  /** Close the Tool Cards inspector. */
  closeToolCards(): void

  /** Open the `/context` usage overlay. */
  openContext(): void
  /** Close the `/context` overlay. */
  closeContext(): void

  /** Open the `/plugins` loaded-plugin-tree overlay. */
  openPlugins(): void
  /** Close the `/plugins` overlay. */
  closePlugins(): void

  /** Open the `/presets` agent-preset overlay and start loading the roster. */
  openAgentPresets(): void
  /** Close the `/presets` overlay. */
  closeAgentPresets(): void
  /** Move the `/presets` list's selection cursor. */
  selectAgentPresetRow(index: number): void
  /** Apply a different agent preset to the current (blank) session. */
  applyAgentPreset(id: string): void

  /** Answer the pending in-terminal tool-approval prompt. */
  answerApproval(outcome: 'allowed-once' | 'rejected'): void
  /** Answer the pending in-terminal question prompt. */
  answerQuestion(answer: QuestionAnswer): void
}
