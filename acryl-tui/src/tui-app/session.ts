/**
 * ACRYL terminal host adapter: brings up one normal local runtime, opens or
 * resumes one native durable DSH session through the runtime-owned bridge,
 * projects the durable event log into `TuiStore`, and drives the pi-tui shell
 * (ported from `tomowang/dsh-tui`) through `TuiActions`. The adapter owns the
 * mount/dispose order only; it reuses ACRYL runtime ownership.
 *
 * The session-inspector overlays (/trajectory, /tools, /context, /plugins) are
 * wired to the runtime (durable log, tool registry, projections, loader) so the
 * TUI shows the same capabilities the web surface does. Model/preset/plan/goal/
 * compaction remain best-effort: they open the ported overlay and surface the
 * runtime's own notice when the backing service is not composed in the profile.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { createAcrylSessionBridge, type AcrylSessionBridge } from 'acryl-harness-runtime'
import { startDirectHost, type DirectHost } from '../host/direct.js'
import { TuiStore } from '../tui/store.js'
import { mountTui, type TuiHandle } from '../tui/TuiApp.js'
import type { TuiActions } from '../tui/actions.js'
import type { PluginRow } from '../tui/plugins/types.js'
import { loadFileIndex } from '../tui/fileIndex.js'
import { stripSessionIdPrefix } from '../sessionId.js'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'

const TUI_VERSION = '0.1.0-dev.0'
const PROMPT_HISTORY_LIMIT = 200

export interface RunAcrylTuiOptions {
  readonly profile: string
  readonly resumeSessionId?: string
}

export interface AcrylTuiResult {
  readonly sessionId: string
  readonly resumeHint: string
  dispose(): Promise<void>
}

function failUnknown(status: string): 'idle' | 'running' {
  return status === 'running' ? 'running' : 'idle'
}

function toolPreview(ctx: Context) {
  return (name: string) => ctx.get('tools')?.get(name)
}

function fiberStateLabel(state: unknown): PluginRow['state'] {
  const labels: Record<string, PluginRow['state']> = {
    active: 'active', pending: 'pending', loading: 'loading', failed: 'failed',
    unloading: 'unloading', disposed: 'disposed',
  }
  return labels[String(state)] ?? undefined
}

/** Snapshot the loader's current entry tree into plain display rows, or `undefined` without a loader. */
function pluginRows(ctx: Context): PluginRow[] | undefined {
  const loader = ctx.get('loader')
  if (loader === undefined) return undefined
  return [...loader.entries()].map(entry => ({
    id: entry.id,
    name: entry.options.name,
    disabled: entry.disabled,
    group: Boolean(entry.options.group),
    state: entry.fiber === undefined ? undefined : fiberStateLabel(entry.fiber.state),
  }))
}

function sessionBlank(session: Session): boolean {
  return session.events.length === 0
}

const HELP_TEXT = [
  'available commands:',
  '  /help      show this help',
  '  /model     manage LLM provider profiles',
  '  /trajectory  browse the turn/step event ledger',
  '  /tools     browse and expand tool cards',
  '  /context   show context-window usage',
  '  /plugins   show the loaded plugin tree',
  '  /presets   view/switch agent presets',
  '  /goal      set or view the long-running goal',
  '  /plan      enter plan mode',
  '  /compact   summarize and compact session history',
  '  /clear     flush the session and start a new one',
  '  /exit, /quit  exit ACRYL',
  'any text submits; Ctrl+C cancels; Ctrl+D | Ctrl+C exits',
].join('\n')

/** Mount one interactive pi-tui session over the bridge. Resolves when the shell exits. */
export async function runAcrylTui(options: RunAcrylTuiOptions): Promise<AcrylTuiResult> {
  const host: DirectHost = await startDirectHost({ profile: options.profile })
  let bridge: AcrylSessionBridge | undefined
  let instance: TuiHandle | undefined
  let settled = false

  try {
    const created = createAcrylSessionBridge(host.ctx, {
      profile: options.profile,
      generationId: randomUUID(),
      attachment: 'owner',
      cwd: process.cwd(),
    })
    bridge = created
    const sessionId = await created.open(options.resumeSessionId)

    // Seed the store from the durable log, then follow the same log live.
    const store = new TuiStore({ events: created.events(sessionId) })
    const initial = await created.snapshot(sessionId)
    store.setStatus(failUnknown(initial.agentStatus))
    void created.subscribeEvents(sessionId, event => {
      store.appendEvent(event)
      void created.snapshot(sessionId).then(next => store.setStatus(failUnknown(next.agentStatus)))
    })

    const history: string[] = []
    let exitResolve: () => void = () => {}
    const exited = new Promise<void>(resolve => { exitResolve = resolve })
    const agent = host.ctx.agents?.get?.(SessionId(sessionId))
    const session = agent?.session

    const actions: TuiActions = {
      send(text) {
        store.setNotice(undefined)
        void created.submitPrompt({ sessionId, text }).catch(error => {
          store.setNotice(error instanceof Error ? error.message : String(error))
        })
      },
      cancel() {
        void created.cancel(sessionId).catch(() => {})
      },
      shutdown() {
        exitResolve()
      },
      help() {
        store.setNotice(HELP_TEXT)
      },
      recordHistory(line) {
        history.push(line)
        if (history.length > PROMPT_HISTORY_LIMIT) history.shift()
      },
      clear() {
        // Flush + attach a fresh session in a later increment; for now the
        // durable session is preserved so nothing is lost.
        store.setNotice('/clear: flushing and starting a new session (coming with session picker)')
      },
      cyclePermission() {
        store.setNotice('permission cycling is not composed in this profile yet')
      },
      compact() {
        store.setNotice('compaction is not composed in this profile yet')
      },
      plan() {
        store.setNotice('plan mode is not composed in this profile yet')
      },
      goal() {
        store.setNotice('goal mode is not composed in this profile yet')
      },
      runShell() {
        store.setNotice('shell mode is not composed in this profile yet')
      },
      ensureFileIndex() {
        if (store.getSnapshot().fileIndex.candidates !== undefined) return
        void loadFileIndex(process.cwd()).then(candidates => store.setFileIndex(candidates))
      },
      openModelProfile() { store.openModelProfile() },
      openTrajectory() { store.openTrajectory() },
      openToolCards() { store.openToolCards() },
      openContext() { store.openContext() },
      openPlugins() {
        const rows = pluginRows(host.ctx)
        if (rows === undefined) store.setNotice('/plugins: loader tree is not composed in this profile')
        else store.openPlugins(rows)
      },
      openAgentPresets() {
        store.openAgentPresets({ current: undefined, blank: session === undefined ? true : sessionBlank(session) })
      },
      closeModelProfile() { store.closeOverlay() },
      backToProviderList() { store.updateModelProfile({ view: 'list' }) },
      selectProvider(index) { store.updateModelProfile({ selected: index }) },
      createProvider() { store.updateModelProfile({ view: 'form', draft: undefined }) },
      editProvider() {},
      saveProvider() {},
      deleteProvider() {},
      discoverModelsForDraft() {},
      setActiveModel() {},
      closeTrajectory() { store.closeOverlay() },
      closeToolCards() { store.closeOverlay() },
      closeContext() { store.closeOverlay() },
      closePlugins() { store.closeOverlay() },
      closeAgentPresets() { store.closeOverlay() },
      selectAgentPresetRow() {},
      applyAgentPreset() {},
      answerApproval() {},
      answerQuestion() {},
    }

    const selection = host.ctx.get('agentDefaultModel')?.currentSelection()
    instance = mountTui({
      store,
      actions,
      sessionId,
      provider: selection?.provider ?? '',
      model: selection?.model ?? '',
      version: TUI_VERSION,
      cwd: process.cwd(),
      promptHistory: history,
      getTool: toolPreview(host.ctx),
      getToolCall: store.getToolCall,
    })

    await exited

    instance.unmount()
    await created.dispose()
    await host.dispose()
    const resumeHint = stripSessionIdPrefix(sessionId)
    return Object.freeze({
      sessionId,
      resumeHint,
      async dispose() {
        if (settled) return
        settled = true
        instance?.unmount()
        await bridge?.dispose()
        await host.dispose()
      },
    })
  } catch (error) {
    instance?.unmount()
    await bridge?.dispose().catch(() => {})
    await host.dispose()
    throw error
  }
}
