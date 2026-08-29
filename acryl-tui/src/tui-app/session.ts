/**
 * ACRYL terminal host adapter: brings up one normal local runtime, opens or
 * resumes one native durable DSH session through the runtime-owned bridge,
 * projects the durable event log into `TuiStore`, and drives the pi-tui shell
 * (ported from `tomowang/dsh-tui`) through `TuiActions`. The adapter owns the
 * mount/dispose order only; it reuses ACRYL runtime ownership and never
 * constructs a Cordis tree or touches DSH agent internals directly.
 *
 * First slice scope: create/resume -> prompt -> stream -> tool state -> cancel
 * -> clean dispose. Overlay, approval/question, model/preset and shell-mode
 * surfaces are intentionally stubbed (later increments).
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { createAcrylSessionBridge, type AcrylSessionBridge } from 'acryl-harness-runtime'
import { startDirectHost, type DirectHost } from '../host/direct.js'
import { TuiStore } from '../tui/store.js'
import { mountTui, type TuiHandle } from '../tui/TuiApp.js'
import type { TuiActions } from '../tui/actions.js'
import { loadFileIndex } from '../tui/fileIndex.js'
import { stripSessionIdPrefix } from '../sessionId.js'

const TUI_VERSION = '0.1.0-dev.0'
const PROMPT_HISTORY_LIMIT = 200
const NOT_AVAILABLE = 'not available in this build yet'

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

    // Seed the store from the durable log, then follow the same log live. The
    // store's seq boundary keeps one render per event across replay and live.
    const store = new TuiStore({ events: created.events(sessionId) })
    const initial = await created.snapshot(sessionId)
    store.setStatus(failUnknown(initial.agentStatus))
    void created.subscribeEvents(sessionId, event => {
      store.appendEvent(event)
      // Keep the running/idle status bar honest as turns start and end.
      void created.snapshot(sessionId).then(next => store.setStatus(failUnknown(next.agentStatus)))
    })

    const history: string[] = []
    let exitResolve: () => void = () => {}
    const exited = new Promise<void>(resolve => { exitResolve = resolve })

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
        store.setNotice('available: any text submits, Ctrl+C cancels, Ctrl+D exits, /help shows commands')
      },
      recordHistory(line) {
        history.push(line)
        if (history.length > PROMPT_HISTORY_LIMIT) history.shift()
      },
      clear() {
        store.setNotice(`/clear ${NOT_AVAILABLE}`)
      },
      cyclePermission() {
        store.setNotice(`permission cycling ${NOT_AVAILABLE}`)
      },
      compact() {
        store.setNotice(`/compact ${NOT_AVAILABLE}`)
      },
      plan() {
        store.setNotice(`plan mode ${NOT_AVAILABLE}`)
      },
      goal() {
        store.setNotice(`goal mode ${NOT_AVAILABLE}`)
      },
      runShell() {
        store.setNotice(`shell mode ${NOT_AVAILABLE}`)
      },
      ensureFileIndex() {
        if (store.getSnapshot().fileIndex.candidates !== undefined) return
        void loadFileIndex(process.cwd()).then(candidates => store.setFileIndex(candidates))
      },
      openModelProfile() { store.setNotice(`/model ${NOT_AVAILABLE}`) },
      openTrajectory() { store.setNotice(`/trajectory ${NOT_AVAILABLE}`) },
      openToolCards() { store.setNotice(`/tools ${NOT_AVAILABLE}`) },
      openContext() { store.setNotice(`/context ${NOT_AVAILABLE}`) },
      openPlugins() { store.setNotice(`/plugins ${NOT_AVAILABLE}`) },
      openAgentPresets() { store.setNotice(`/presets ${NOT_AVAILABLE}`) },
      // The remaining methods are inert in this first slice (no overlay opens).
      closeModelProfile() {},
      backToProviderList() {},
      selectProvider() {},
      createProvider() {},
      editProvider() {},
      saveProvider() {},
      deleteProvider() {},
      discoverModelsForDraft() {},
      setActiveModel() {},
      closeTrajectory() {},
      closeToolCards() {},
      closeContext() {},
      closePlugins() {},
      closeAgentPresets() {},
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
