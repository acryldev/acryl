/**
 * ACRYL terminal host adapter: brings up one normal local runtime, opens or
 * resumes one native durable DSH session through a runtime-owned bridge,
 * projects the durable log into `TuiStore`, and drives the pi-tui shell.
 *
 * Session-inspector overlays (/trajectory, /tools, /context, /plugins) and the
 * /model /presets /goal /plan /compact commands are wired to the runtime so the
 * TUI shows the same capabilities the web surface does. `/clear` flushes the
 * current session and re-attaches a fresh one (durable history stays on disk).
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
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { GoalError } from '@deepseek-ai/dsh-goal'
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
  '  /help        show this help',
  '  /model       manage LLM provider profiles',
  '  /trajectory  browse the turn/step event ledger',
  '  /tools       browse and expand tool cards',
  '  /context     show context-window usage',
  '  /plugins     show the loaded plugin tree',
  '  /presets     view/switch agent presets',
  '  /goal        set or view the long-running goal',
  '  /plan        enter plan mode',
  '  /compact     summarize and compact session history',
  '  /clear       flush the session and start a new one',
  '  /exit, /quit exit ACRYL',
  'any text submits; Ctrl+C cancels; Ctrl+D | Ctrl+C exits',
].join('\n')

interface TuiSession {
  readonly id: string
  readonly store: TuiStore
  readonly actions: TuiActions
  readonly instance: TuiHandle
  readonly bridge: AcrylSessionBridge
  readonly exitPromise: Promise<'exit' | 'clear'>
  dispose(preserveScreen: boolean): Promise<void>
}

async function attachSession(host: DirectHost, resumeId: string | undefined): Promise<TuiSession> {
  const bridge = createAcrylSessionBridge(host.ctx, {
    profile: host.profile,
    generationId: randomUUID(),
    attachment: 'owner',
    cwd: process.cwd(),
  })
  const store = new TuiStore({ events: [] })
  let signal: (kind: 'exit' | 'clear') => void = () => {}
  const exitPromise = new Promise<'exit' | 'clear'>(resolve => { signal = resolve })
  const id = await bridge.open(resumeId)

  storeSetStatus(store, await bridge.snapshot(id))
  void bridge.subscribeEvents(id, event => {
    store.appendEvent(event)
    void bridge.snapshot(id).then(next => storeSetStatus(store, next))
  })
  const agent = host.ctx.agents?.get?.(SessionId(id))
  const session = agent?.session
  const history: string[] = []

  const actions: TuiActions = {
    send(text) {
      store.setNotice(undefined)
      void bridge.submitPrompt({ sessionId: id, text }).catch(error => {
        store.setNotice(error instanceof Error ? error.message : String(error))
      })
    },
    cancel() {
      void bridge.cancel(id).catch(() => {})
    },
    shutdown() { signal('exit') },
    help() { store.setNotice(HELP_TEXT) },
    recordHistory(line) { history.push(line); if (history.length > PROMPT_HISTORY_LIMIT) history.shift() },
    clear() {
      // Flush + re-attach a fresh session; the durable session stays on disk.
      store.setNotice('clearing…')
      signal('clear')
    },
    cyclePermission() { store.setNotice('permission cycling is not composed in this profile yet') },
    compact() {
      const compaction = host.ctx.get('compaction')
      if (compaction === undefined || agent === undefined) return store.setNotice('compaction is not available in this profile')
      store.setNotice('compacting…')
      void compaction.compactNow(agent, new AbortController().signal)
        .then(result => store.setNotice(result === null ? 'no compactable history yet' : undefined))
        .catch((error: unknown) => {
          const message = error instanceof ManualCompactionError ? error.code : error instanceof Error ? error.message : String(error)
          store.setNotice(`compaction failed: ${message}`)
        })
    },
    plan(rawInput) {
      const planMode = host.ctx.get('planMode')
      if (planMode === undefined || agent === undefined) return store.setNotice('plan mode is not available in this profile')
      const message = rawInput.trim()
      if (message === 'off') {
        planMode.set(agent, false)
        store.setNotice('Plan mode off.')
        return
      }
      const outcome = planMode.set(agent, true)
      if (message !== '') agent.steer(createUserMessage({ content: [{ type: 'text', text: message }], source: { kind: 'user' } }))
      store.setNotice(outcome === 'committed' ? 'Plan mode on. Use /plan off to leave.' : 'Entering plan mode (applies from the next step). Use /plan off to leave.')
    },
    goal(command) {
      const goals = host.ctx.get('goals')
      if (goals === undefined || agent === undefined) return store.setNotice('goal mode is not available in this profile')
      try {
        const current = goals.get(agent)
        switch (command.kind) {
          case 'show':
            store.setNotice(current === undefined ? 'No goal is currently set. Use /goal <objective> to set one.' : `Goal: ${current.objective}`)
            return
          case 'invalid-edit':
            store.setNotice('Goal editing requires a replacement objective.')
            return
          case 'create':
            store.setNotice(`Goal created: ${goals.create(agent, { objective: command.objective }).objective}`)
            return
          case 'edit':
            if (current === undefined) return store.setNotice('No goal to edit.')
            store.setNotice(`Goal updated: ${goals.edit(agent, { id: current.id, revision: current.revision }, { objective: command.objective }).objective}`)
            return
          case 'pause':
            if (current === undefined) return store.setNotice('No goal to pause.')
            goals.pause(agent, { id: current.id, revision: current.revision })
            return store.setNotice('Goal paused.')
          case 'resume':
            if (current === undefined) return store.setNotice('No goal to resume.')
            goals.resume(agent, { id: current.id, revision: current.revision })
            return store.setNotice('Goal resumed.')
          case 'clear':
            if (current === undefined) return store.setNotice('No goal to clear.')
            goals.clear(agent, { id: current.id, revision: current.revision })
            return store.setNotice('Goal cleared.')
        }
      } catch (error) {
        store.setNotice(error instanceof GoalError ? 'The goal command is not valid for the current state. Run /goal to view available commands.' : `goal command failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    runShell() { store.setNotice('shell mode is not composed in this profile yet') },
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
  const instance = mountTui({
    store,
    actions,
    sessionId: id,
    provider: selection?.provider ?? '',
    model: selection?.model ?? '',
    version: TUI_VERSION,
    cwd: process.cwd(),
    promptHistory: history,
    getTool: toolPreview(host.ctx),
    getToolCall: store.getToolCall,
  })

  return Object.freeze({
    id,
    store,
    actions,
    instance,
    bridge,
    exitPromise,
    async dispose(preserveScreen: boolean) {
      instance.unmount({ preserveScreen })
      await bridge.dispose()
    },
  })
}

function storeSetStatus(store: TuiStore, snapshot: { agentStatus: string }): void {
  store.setStatus(failUnknown(snapshot.agentStatus))
}

/** Mount one interactive pi-tui session over the bridge; loop over `/clear` re-attaches. */
export async function runAcrylTui(options: RunAcrylTuiOptions): Promise<AcrylTuiResult> {
  const host: DirectHost = await startDirectHost({ profile: options.profile })
  let current: TuiSession | undefined
  let settled = false

  try {
    current = await attachSession(host, options.resumeSessionId)
    for (;;) {
      const kind = await current.exitPromise
      if (kind === 'exit') break
      // /clear: flush + re-attach a fresh session (preserve the screen for the fresh mount).
      await current.dispose(true)
      current = await attachSession(host, undefined)
    }
    const sessionId = current.id
    const resumeHint = stripSessionIdPrefix(sessionId)
    // Restore the terminal before handing the resume hint back to the CLI.
    await current.dispose(false)
    await host.dispose()
    settled = true
    return Object.freeze({
      sessionId,
      resumeHint,
      async dispose() {
        if (settled) return
        settled = true
        await host.dispose()
      },
    })
  } catch (error) {
    await current?.dispose(false).catch(() => {})
    await host.dispose()
    throw error
  }
}
