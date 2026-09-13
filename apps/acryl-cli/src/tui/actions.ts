/**
 * Callback surface the TUI's interactive components (the prompt editor,
 * every overlay) call into; implemented once in `src/index.ts`, where each
 * method closes over the live `Agent`/`TuiStore`/services. Framework-free so
 * it can be shared by `commands.ts`, the prompt editor, and every overlay
 * without any of them depending on pi-tui.
 * @module @tomowang/dsh-tui/tui/actions
 */

import type { AuthMethod } from 'acryl-control'
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
  /** Configure provider authentication: open the `/login` sign-in overlay. */
  login(): void
  /** Remove provider authentication for the active provider (clears its stored API key). */
  logout(): void
  /** Close the `/login` overlay. */
  closeLogin(): void
  /** Run the authorization flow for the selected provider (pi-ai OAuth). `method` defaults to the flow's first (its preferred) method when omitted. */
  beginAuthorization(key: string, method?: AuthMethod): void
  /** Answer the in-flight authorization prompt (typed text/secret, or a chosen option id). */
  answerAuthorizationPrompt(value: string): void
  /** Close the `/model` overlay, discarding any in-progress edit. */
  closeModelProfile(): void
  /** Return from the add/edit form to the provider list without saving. */
  backToProviderList(): void
  /** Open a blank draft for a new custom provider. */
  createProvider(): void
  /** Switch to `/model`'s custom-provider form directly, from wherever the caller is (e.g. `/login`'s provider list, which offers no custom-provider path of its own). */
  addCustomProvider(): void
  /** Open an existing provider's stored profile for editing. */
  editProvider(route: string): void
  /** Open `/model` and jump straight to editing this provider — the entry point `/login`'s provider list uses for an already-configured route, since it offers no edit/models path of its own. */
  openProviderEditor(route: string): void
  /** Persist a draft via `ctx.settings`/`ctx.credentials`, then reload the list. */
  saveProvider(draft: ProviderDraft): void
  /** Remove a provider's settings section and credential. */
  deleteProvider(row: ProviderRow): void
  /** Remove only a draft's stored credential (both the `apiKeyEnv` reference and any `/login` record), keeping its settings profile (baseURL/api/models) intact. */
  clearApiKey(draft: ProviderDraft): void
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

  /**
   * Dispatch a plugin-registered command (spec 034 T009) - `runSlashCommand`
   * calls this for any command not in its own built-in switch. Optional so a
   * test double implementing `TuiActions` doesn't need a no-op for it.
   */
  runDynamicCommand?(command: string): void
  /** Close a plugin-registered command's overlay - its own Component calls this on Escape, matching every other overlay's own close convention. */
  closeDynamic(): void

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
