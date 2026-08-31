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
import { execFile } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { createAcrylSessionBridge, type AcrylSessionBridge } from 'acryl-harness-runtime'
import { startDirectHost, type DirectHost } from '../host/direct.js'
import { TuiStore } from '../tui/store.js'
import { mountTui, type TuiHandle } from '../tui/TuiApp.js'
import type { TuiActions } from '../tui/actions.js'
import type { PluginRow } from '../tui/plugins/types.js'
import type { ProviderDraft, ProviderRow, StoredProviderProfile } from '../tui/modelProfile/types.js'
import type { AgentPresetRow } from '../tui/agentPresets/types.js'
import { loadFileIndex } from '../tui/fileIndex.js'
import { logoutNoneMessage, logoutSuccessMessage } from '../tui/auth-guidance.js'
import { stripSessionIdPrefix } from '../sessionId.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { GoalError } from '@deepseek-ai/dsh-goal'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { ACRYL_VERSION } from '../version.ts'

const TUI_VERSION = ACRYL_VERSION
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
  // A session is blank until the first turn actually starts; injected context
  // (AGENTS.md, skill catalog, cron notices) is not a turn. Mirrors Tomo's/harness
  // semantics so `/presets` can offer a preset switch on a not-yet-started session.
  return !session.events.some(event => event.type === 'turn/start')
}

/** Read a nested value out of an untyped resolved/raw settings section. */
function getAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Derive a POSIX-identifier credential ref from a provider route, e.g. `my-proxy` -> `MY_PROXY_API_KEY`. */
function deriveApiKeyRef(route: string): string {
  const upper = route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const identifier = /^[A-Z_]/.test(upper) ? upper : `P_${upper}`
  return `${identifier}_API_KEY`
}

/** Open a URL in the platform's default browser (fire-and-forget). */
function openBrowser(url: string): Promise<void> {
  const platform = process.platform
  const command: [string, string[]] = platform === 'darwin' ? ['open', [url]]
    : platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]]
  return new Promise(resolve => { execFile(command[0], command[1], () => resolve()) })
}

/** Nest a provider settings section at its path, e.g. `['providers','deepseek']` -> `{ providers: { deepseek: section } }`. */
function nestAtPath(path: readonly string[], section: Record<string, unknown>): Record<string, unknown> {
  let patch: Record<string, unknown> = section
  for (let index = path.length - 1; index >= 0; index--) patch = { [path[index]]: patch }
  return patch
}

/** English display names for the shipped preset ids (the metadata is authored in Chinese, and there is no server-side locale resolution). */
const PRESET_LABELS: Record<string, string> = {
  standard: 'Standard mode',
  code: 'Code mode',
  minimal: 'Minimal mode',
  cordis: 'Creator mode',
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

  // Re-join `ctx.llm`'s provider directory with `ctx.settings`/`ctx.credentials`
  // and refresh the open `/model` overlay's list. The three services are
  // optional and re-checked at point of use (the same pattern the other
  // model-profile actions use), so a profile that does not mount them degrades
  // to an error notice instead of refusing to start.
  async function loadProviders(): Promise<void> {
    const settingsSvc: any = host.ctx.get('settings')
    const credentialsSvc: any = host.ctx.get('credentials')
    const llmSvc: any = host.ctx.get('llm')
    if (settingsSvc === undefined || credentialsSvc === undefined || llmSvc === undefined) {
      store.updateModelProfile({ providers: [], busy: false, error: 'Model provider settings are not available in this profile.' })
      return
    }
    const configurable = llmSvc.listConfigurableProviders()
    const live = new Set((llmSvc.listProviders() as Array<{ id: string }>).map((provider: { id: string }) => provider.id))
    const descriptors = settingsSvc.describe({ redactSecrets: true }) as Array<{ ns: string; value: unknown; user?: unknown; revision?: number }>
    const byNs = new Map<string, (typeof descriptors)[number]>(descriptors.map(descriptor => [descriptor.ns, descriptor]))
    const rows: ProviderRow[] = []
    for (const entry of configurable) {
      const descriptor = byNs.get(entry.settingsNs)
      const value = (descriptor === undefined ? undefined : getAtPath(descriptor.value, entry.settingsPath)) as StoredProviderProfile | undefined
      const userValue = descriptor === undefined ? undefined : getAtPath(descriptor.user, entry.settingsPath)
      const apiKeyRef = value?.apiKeyEnv ?? deriveApiKeyRef(entry.provider)
      const info = await credentialsSvc.describe(apiKeyRef)
      rows.push({
        route: entry.provider,
        displayName: value?.displayName ?? entry.displayName,
        settingsNs: entry.settingsNs,
        settingsPath: entry.settingsPath,
        configured: userValue !== undefined,
        live: live.has(entry.provider),
        api: value?.api,
        baseURL: value?.baseURL,
        apiKeyRef,
        apiKeyConfigured: info.configured,
        models: value?.models ?? [],
        revision: descriptor?.revision,
      })
    }
    store.updateModelProfile({ providers: rows, busy: false, error: undefined, selected: 0 })
  }

  // Fetch the registered authorization flows (providers that ship a login via
  // dsh-llm-pi-ai) and refresh the open `/login` overlay's list.
  async function loadAuthorizationFlows(): Promise<void> {
    const authSvc: any = host.ctx.get('authorization')
    if (authSvc === undefined) {
      store.updateLogin({ flows: [], busy: false, error: 'Sign-in is not available in this profile.' })
      return
    }
    try {
      const list = authSvc.list() as Array<{ key: string; label: string; methods: Array<{ id: string; label: string }>; inFlight: boolean }>
      store.updateLogin({ flows: list, busy: false, error: undefined })
    } catch (error) {
      store.updateLogin({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Fetch the deployment's agent-preset roster and refresh the open `/presets`
  // overlay's row list. The service is optional, same pattern as the other
  // model/profile actions: absent degrades to the overlay's empty message.
  async function loadAgentPresets(): Promise<void> {
    const presetsSvc: any = host.ctx.get('agentPresets')
    if (presetsSvc === undefined) {
      // Service is not composed in this profile: settle the spinner to the neutral
      // empty message instead of leaving `/presets` on a perpetual 'Loading...'.
      store.updateAgentPresets({ rows: [], busy: false, error: undefined })
      return
    }
    try {
      const list = await presetsSvc.list()
      const rows: AgentPresetRow[] = list.map((preset: any) => ({
        id: preset.id,
        label: PRESET_LABELS[preset.id as string] ?? preset.name ?? preset.id,
        description: preset.description,
        trust: preset.trust,
        broken: preset.broken,
      }))
      store.updateAgentPresets({ rows, busy: false, error: undefined })
    } catch (error) {
      store.updateAgentPresets({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Resolves the single in-flight authorization prompt, if any. Set by the
  // flow's `prompt()` interaction and settled by `answerAuthorizationPrompt`.
  let pendingPromptResolve: ((value: string) => void) | undefined

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
    openModelProfile() { store.openModelProfile(); void loadProviders() },
    login() { store.openLogin(); void loadAuthorizationFlows() },
    closeLogin() { store.closeOverlay() },
    selectLoginFlow(index) { store.updateLogin({ selected: index }) },
    beginAuthorization(key) {
      void (async () => {
        const authSvc: any = host.ctx.get('authorization')
        if (authSvc === undefined) {
          store.setNotice('Sign-in is not available in this profile.')
          return
        }
        const overlay = store.getSnapshot().overlay
        const flow = overlay.kind === 'login' ? overlay.login.flows?.find(entry => entry.key === key) : undefined
        if (flow === undefined) return
        store.updateLogin({ signingIn: key })
        const interaction = {
          notify(notice: { message: string; url?: string; code?: string }) {
            if (notice.url !== undefined) void openBrowser(notice.url)
            const parts = [notice.message]
            if (notice.url !== undefined) parts.push(notice.url)
            if (notice.code !== undefined) parts.push(`Code: ${notice.code}`)
            store.setNotice(parts.join('\n'))
          },
          async prompt(prompt: { kind: 'text' | 'secret' | 'select'; message: string; options?: readonly { id: string; label: string; description?: string }[]; placeholder?: string; signal?: AbortSignal }) {
            return await new Promise<string>((resolve, reject) => {
              if (prompt.signal?.aborted) { reject(new Error('authorization prompt withdrawn')); return }
              pendingPromptResolve = resolve
              const state = prompt.kind === 'select'
                ? { kind: 'select' as const, message: prompt.message, options: (prompt.options ?? []).map(option => ({ id: option.id, label: option.label, description: option.description })) }
                : { kind: prompt.kind, message: prompt.message, placeholder: prompt.placeholder }
              store.updateLogin({ prompt: state })
              prompt.signal?.addEventListener('abort', () => {
                if (pendingPromptResolve === resolve) pendingPromptResolve = undefined
                store.updateLogin({ prompt: undefined })
                reject(new Error('authorization prompt withdrawn'))
              }, { once: true })
            })
          },
        }
        try {
          const outcome = await authSvc.begin({ key, interaction })
          if (outcome.status === 'authorized') {
            store.setNotice(`Signed in to ${flow.label}.`)
            void loadAuthorizationFlows()
          } else {
            store.setNotice('Sign-in cancelled.')
          }
        } catch (error) {
          store.setNotice(`Sign-in failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          store.updateLogin({ signingIn: undefined })
        }
      })()
    },
    answerAuthorizationPrompt(value) {
      const resolve = pendingPromptResolve
      pendingPromptResolve = undefined
      store.updateLogin({ prompt: undefined })
      if (resolve !== undefined) resolve(value)
    },
    logout() {
      void (async () => {
        const credentialsSvc: any = host.ctx.get('credentials')
        if (credentialsSvc === undefined) {
          store.setNotice('Credentials are not available in this profile.')
          return
        }
        const selection = host.ctx.get('agentDefaultModel')?.currentSelection?.() as { provider?: string } | undefined
        const overlay = store.getSnapshot().overlay
        const rows = overlay.kind === 'modelProfile' ? overlay.modelProfile.providers : undefined
        const row = rows?.find(entry => entry.route === selection?.provider)
          ?? (rows !== undefined && rows.length === 1 ? rows[0] : undefined)
        if (row === undefined) {
          store.setNotice(logoutNoneMessage())
          return
        }
        try {
          await credentialsSvc.unset(row.apiKeyRef)
          store.setNotice(logoutSuccessMessage(row.displayName))
          void loadProviders()
        } catch (error) {
          store.setNotice(`logout failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
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
      void loadAgentPresets()
    },
    closeModelProfile() { store.closeOverlay() },
    backToProviderList() { store.updateModelProfile({ view: 'list' }) },
    selectProvider(index) { store.updateModelProfile({ selected: index }) },
    createProvider() { store.updateModelProfile({ view: 'form', draft: undefined }) },
    editProvider(route) {
      const overlay = store.getSnapshot().overlay
      if (overlay.kind !== 'modelProfile') return
      const row = overlay.modelProfile.providers?.find(entry => entry.route === route)
      if (row === undefined) return
      const draft: ProviderDraft = {
        route: row.route,
        isNew: false,
        settingsNs: row.settingsNs,
        settingsPath: row.settingsPath,
        displayName: row.displayName,
        api: row.api ?? '',
        baseURL: row.baseURL ?? '',
        apiKeyRef: row.apiKeyRef,
        apiKeyConfigured: row.apiKeyConfigured,
        apiKeyDraft: '',
        models: row.models,
        revision: row.revision,
      }
      store.updateModelProfile({ view: 'form', draft, formKey: overlay.modelProfile.formKey + 1 })
    },
    saveProvider(draft) {
      void (async () => {
        const settingsSvc: any = host.ctx.get('settings')
        const credentialsSvc: any = host.ctx.get('credentials')
        if (settingsSvc === undefined || credentialsSvc === undefined) {
          store.setNotice('Provider settings are not available in this profile.')
          return
        }
        try {
          const key = draft.apiKeyDraft.trim()
          if (key !== '') await credentialsSvc.set(draft.apiKeyRef, key)
          const section: StoredProviderProfile = {
            displayName: draft.displayName,
            api: draft.api,
            baseURL: draft.baseURL,
            apiKeyEnv: draft.apiKeyRef,
            models: draft.models,
          }
          await settingsSvc.update(draft.settingsNs, nestAtPath(draft.settingsPath, section as unknown as Record<string, unknown>), draft.revision)
          store.setNotice(`Saved ${draft.displayName || draft.route}.`)
          store.updateModelProfile({ view: 'list' })
          void loadProviders()
        } catch (error) {
          store.setNotice(`save failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    deleteProvider(row) {
      void (async () => {
        const settingsSvc: any = host.ctx.get('settings')
        const credentialsSvc: any = host.ctx.get('credentials')
        if (settingsSvc === undefined || credentialsSvc === undefined) {
          store.setNotice('Provider settings are not available in this profile.')
          return
        }
        try {
          await credentialsSvc.unset(row.apiKeyRef)
          await settingsSvc.update(row.settingsNs, nestAtPath(row.settingsPath, {}), row.revision)
          store.setNotice(`Removed ${row.displayName}.`)
          void loadProviders()
        } catch (error) {
          store.setNotice(`delete failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
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
