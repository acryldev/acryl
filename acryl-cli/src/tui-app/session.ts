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
import {
  computeCredentialProjection,
  AuthorizationService,
  type AuthorizationInteraction,
  type AuthorizationPort,
  type CredentialProjectionLlmPort,
  type CredentialProjectionRow,
  type CredentialProjectionServices,
  type CredentialProjectionSettingsPort,
  type RouteActivationPort,
} from 'acryl-control'
import { startDirectHost, type DirectHost } from '../host/direct.js'
import { TuiStore } from '../tui/store.js'
import { mountTui, type TuiHandle } from '../tui/TuiApp.js'
import type { TuiActions } from '../tui/actions.js'
import type { PluginRow } from '../tui/plugins/types.js'
import { deriveApiKeyRef, maskKeyPreview, type ProviderDraft, type ProviderRow, type StoredProviderProfile } from '../tui/modelProfile/types.js'
import type { AgentPresetRow } from '../tui/agentPresets/types.js'
import { loadFileIndex } from '../tui/fileIndex.js'
import { stripSessionIdPrefix } from '../sessionId.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { GoalError } from '@deepseek-ai/dsh-goal'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { ACRYL_VERSION } from '../version.ts'

/** The credential-record scope `dsh-llm-pi-ai` writes a `/login` sign-in under (`credentialKey('llm-pi-ai', providerId)`). */
const LOGIN_RECORD_SCOPE = 'llm-pi-ai'

// Typed `host.ctx.get(...)` ports for the raw DSH runtime services this host
// adapter reads/writes directly (finding R9: no untyped service handles).
// `acryl-control`'s narrower credential/authorization ports cover the shared
// read side; these extend them with the write/discovery methods only the
// host adapter itself needs.
type SettingsServicePort = CredentialProjectionSettingsPort & {
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
}
interface CredentialRecordLike {
  readonly kind: string
  readonly key?: string
}
interface CredentialsServicePort {
  describe(ref: string): Promise<{ readonly configured: boolean }>
  readRecord?(key: string): Promise<CredentialRecordLike | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
  deleteRecord?(key: string): Promise<void>
  resolve?(ref: string): Promise<{ readonly value?: string } | undefined>
}
type LlmServicePort = CredentialProjectionLlmPort & {
  discoverModels(ns: string, request: Record<string, unknown>): Promise<readonly { readonly id: string; readonly name?: string; readonly contextWindow?: number; readonly maxTokens?: number }[]>
}
type AuthorizationListPort = AuthorizationPort & {
  list(): readonly { readonly key: string; readonly label: string; readonly methods: readonly { readonly id: string; readonly label: string }[]; readonly inFlight: boolean }[]
}
interface AgentPresetsServicePort {
  list(): Promise<readonly { readonly id: string; readonly name?: string; readonly description?: string; readonly trust: 'system' | 'user'; readonly broken: string | undefined }[]>
}

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

/**
 * `dsh-llm-pi-ai`'s own credential record key under `LOGIN_RECORD_SCOPE`
 * (`credentialKey('llm-pi-ai', providerId)`, i.e. `"llm-pi-ai/<providerId>"`).
 * A `/login` sign-in (OAuth or API key) writes here through pi-ai's own
 * `CredentialStore`, entirely separate from the `apiKeyEnv` reference a
 * manually configured provider's settings profile points at.
 * `acryl-control`'s `CredentialProjection` computes this internally for the
 * read side; only `clearApiKey`'s explicit delete still needs it directly.
 */
function loginRecordKey(providerId: string): string {
  return `${LOGIN_RECORD_SCOPE}/${providerId}`
}

/**
 * Wait out `ctx.settings`' asynchronous watcher queue after a write.
 *
 * `settingsSvc.update()`'s returned promise resolves once the write commits
 * to the settings document — but `dsh-llm-pi-ai`'s own reactive watcher (the
 * thing that actually rebuilds its live `Models` registry and re-registers
 * routes with `ctx.llm`) runs on a *separate* promise chained off that
 * commit, not before it settles. A caller that reads `ctx.llm.listModels()`
 * or `listProviders()` immediately after `update()` resolves races that
 * watcher and sees the pre-write state. `setImmediate` runs after the
 * Node microtask queue drains, which is exactly where that chained watcher
 * promise settles, so awaiting one flush is enough to see the write reflected.
 */
function flushSettingsWatchers(): Promise<void> {
  return new Promise<void>(resolve => { setImmediate(resolve) })
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

  // Read `credentialProjectionServices()`'s three optional services and join
  // them through `acryl-control`'s `CredentialProjection` — the one shared
  // read-model `/login` and `/model` both consume, so `hasSettingsProfile`/
  // `hasCredential`/`isLive`/`authMethod` mean the same thing everywhere
  // (specs/001-acryl-refactor-improvements-and-tech-debt, findings R1/R3).
  // Re-checked at point of use (the same pattern the other model-profile
  // actions use), so a profile that does not mount them degrades to an error
  // notice instead of refusing to start.
  // Called independently by `/logout` too (which must work whether or not
  // `/model` happens to be the open overlay — `store.updateModelProfile` is a
  // no-op while it isn't), instead of reading `/model`'s possibly-empty
  // cached overlay state and reporting "no active providers" even when
  // providers plainly exist.
  function credentialProjectionServices(): CredentialProjectionServices | undefined {
    const settingsSvc = host.ctx.get('settings') as SettingsServicePort | undefined
    const credentialsSvc = host.ctx.get('credentials') as CredentialsServicePort | undefined
    const llmSvc = host.ctx.get('llm') as LlmServicePort | undefined
    if (settingsSvc === undefined || credentialsSvc === undefined || llmSvc === undefined) return undefined
    return { settings: settingsSvc, credentials: credentialsSvc, llm: llmSvc }
  }

  async function credentialRows(): Promise<readonly CredentialProjectionRow[] | undefined> {
    const services = credentialProjectionServices()
    if (services === undefined) return undefined
    return computeCredentialProjection(services, { deriveApiKeyRef, loginRecordScope: LOGIN_RECORD_SCOPE })
  }

  /** Map the shared `CredentialProjectionRow` onto `/model`'s own `ProviderRow` presentation shape. */
  function toProviderRow(row: CredentialProjectionRow): ProviderRow {
    return {
      route: row.route,
      displayName: row.displayName,
      settingsNs: row.settingsNs,
      settingsPath: row.settingsPath,
      configured: row.hasSettingsProfile,
      live: row.isLive,
      api: row.api,
      baseURL: row.baseURL,
      apiKeyRef: row.apiKeyRef,
      apiKeyConfigured: row.hasCredential,
      authMethod: row.authMethod,
      models: row.models,
      revision: row.revision,
    }
  }

  async function loadProviders(): Promise<void> {
    const rows = await credentialRows()
    if (rows === undefined) {
      store.updateModelProfile({ providers: [], busy: false, error: 'Model provider settings are not available in this profile.' })
      return
    }
    const providers: ProviderRow[] = rows.map(toProviderRow)
    store.updateModelProfile({ providers, busy: false, error: undefined, selected: 0 })
  }

  // Shared by `editProvider` (called from /model's own provider list, which
  // already has `overlay.modelProfile.providers` loaded) and `openProviderEditor`
  // (called from /login, which has to open /model and load that list first) --
  // one path into the edit form (masked key preview, Models editor) regardless
  // of which overlay the user started from.
  function openEditFormForRow(row: ProviderRow): void {
    const overlay = store.getSnapshot().overlay
    if (overlay.kind !== 'modelProfile') return
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
      authMethod: row.authMethod,
      apiKeyDraft: '',
      apiKeyPreview: undefined,
      models: row.models,
      revision: row.revision,
    }
    const formKey = overlay.modelProfile.formKey + 1
    store.updateModelProfile({ view: 'form', draft, formKey })
    // Never pre-fill the editable draft field with the real secret — only
    // fetch it to render a short, non-reversible first/last-chars preview
    // (masked via maskKeyPreview) so the field doesn't look empty when a
    // key genuinely is set. OAuth-authenticated routes have no separate
    // api-key ref to resolve here; the "signed in via OAuth" hint already
    // covers that case.
    if (row.authMethod === 'api-key') {
      void (async () => {
        const credentialsSvc = host.ctx.get('credentials') as CredentialsServicePort | undefined
        const resolved = await credentialsSvc?.resolve?.(row.apiKeyRef).catch(() => undefined)
        if (resolved?.value === undefined) return
        const current = store.getSnapshot().overlay
        if (current.kind !== 'modelProfile' || current.modelProfile.formKey !== formKey) return
        const currentDraft = current.modelProfile.draft
        if (currentDraft === undefined) return
        store.updateModelProfile({ draft: { ...currentDraft, apiKeyPreview: maskKeyPreview(resolved.value) } })
      })()
    }
  }

  // `AuthorizationService`'s `RouteActivationPort`: a `/login` sign-in only
  // ever writes a credential (the OAuth grant or typed API key) — it never
  // touches `ctx.settings`. `dsh-llm-pi-ai` only registers a route as live
  // once its settings section names it (even with an empty profile, which
  // just means "use the installed catalog's own defaults"), so without this
  // a successful sign-in leaves the provider credentialed but still absent
  // from `ctx.llm`'s live directory and unusable from `/model`. Writes only
  // when the route has no settings profile yet, so it never clobbers one the
  // user already configured (custom baseURL, model overrides, etc.), and
  // never touches `displayName` — no auth-method name suffix; `authMethod`
  // is rendered as a badge from the projection instead (specs/001-…, R2).
  const routeActivationPort: RouteActivationPort = {
    async ensureRouteActivated(providerId) {
      const settingsSvc = host.ctx.get('settings') as SettingsServicePort | undefined
      const llmSvc = host.ctx.get('llm') as LlmServicePort | undefined
      if (settingsSvc === undefined || llmSvc === undefined) return
      const entry = llmSvc.listConfigurableProviders().find(candidate => candidate.provider === providerId)
      if (entry === undefined) return
      const descriptors = settingsSvc.describe({ redactSecrets: true })
      const descriptor = descriptors.find(candidate => candidate.ns === entry.settingsNs)
      const existing = descriptor === undefined ? undefined : getAtPath(descriptor.user, entry.settingsPath)
      if (existing !== undefined) return
      await settingsSvc.update(entry.settingsNs, nestAtPath(entry.settingsPath, {}), descriptor?.revision)
      await flushSettingsWatchers()
    },
  }

  // Fetch the registered authorization flows (providers that ship a login via
  // dsh-llm-pi-ai), derive each one's configured/authMethod from the same
  // shared `CredentialProjection` `/model` reads (not an independent record
  // read — one source of truth, specs/001-…, R3/R4), and refresh the open
  // `/login` overlay's list.
  async function loadLoginFlows(): Promise<void> {
    const authSvc = host.ctx.get('authorization') as AuthorizationListPort | undefined
    if (authSvc === undefined) {
      store.updateLogin({ flows: [], busy: false, error: 'Sign-in is not available in this profile.' })
      return
    }
    try {
      const entries = authSvc.list()
      const rows = await credentialRows()
      const byKey = new Map((rows ?? []).map(row => [loginRecordKey(row.route), row] as const))
      const list = entries.map(entry => {
        const row = byKey.get(entry.key)
        return { ...entry, configured: row?.hasCredential ?? false, authMethod: row?.authMethod }
      })
      store.updateLogin({ flows: list, busy: false, error: undefined })
    } catch (error) {
      store.updateLogin({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // `/login` and `/model` each hold their own independently-fetched read of
  // the same underlying credential/settings state, and neither overlay
  // invalidates the other's cache when it changes something — only the one
  // that's actually open right now gets refreshed by its own action. A key
  // saved, cleared, or signed into through one surface then reads stale
  // ("still shows signed in", "shows configured but the edit screen is
  // empty") the next time the *other* surface is opened, until that surface
  // happens to refetch on its own. Syncing both together after any action
  // that can change either's picture closes that gap regardless of which
  // overlay initiated the change; each update is a no-op while its overlay
  // isn't the one currently open. Also the `AuthorizationService`
  // `credential.changed` listener (targeted at the signed-in key today; both
  // overlays currently re-fetch their whole list either way).
  function syncCredentialViews(): void {
    void loadProviders()
    void loadLoginFlows()
  }

  /** Open `/model`'s blank custom-provider draft — assumes `/model` is (or is about to become) the open overlay. Shared by `createProvider` (already there) and `addCustomProvider` (getting there first). */
  function openCustomProviderDraft(): void {
    const llmSvc = host.ctx.get('llm') as LlmServicePort | undefined
    // Every `dsh-llm-pi-ai` route — catalog or custom — lives at the same
    // settings namespace (`directoryEntries()` stamps every entry with the
    // plugin's own `NS`), so any already-configurable entry's `settingsNs`
    // is the right one for a brand-new route too; there is always at least
    // one (the installed catalog is never empty). `settingsPath` is
    // recomputed from the typed route at save time in `buildDraft()`, since
    // the route itself does not exist yet here.
    const settingsNs: string | undefined = llmSvc?.listConfigurableProviders?.()[0]?.settingsNs
    if (settingsNs === undefined) {
      store.setNotice('Adding a custom provider is not available in this profile.')
      return
    }
    const draft: ProviderDraft = {
      route: '',
      isNew: true,
      settingsNs,
      settingsPath: [],
      displayName: '',
      api: '',
      baseURL: '',
      apiKeyRef: '',
      apiKeyConfigured: false,
      authMethod: undefined,
      apiKeyDraft: '',
      apiKeyPreview: undefined,
      models: [],
      revision: undefined,
    }
    const overlay = store.getSnapshot().overlay
    const formKey = overlay.kind === 'modelProfile' ? overlay.modelProfile.formKey + 1 : 1
    store.updateModelProfile({ view: 'form', draft, formKey })
  }

  // Fetch the deployment's agent-preset roster and refresh the open `/presets`
  // overlay's row list. The service is optional, same pattern as the other
  // model/profile actions: absent degrades to the overlay's empty message.
  async function loadAgentPresets(): Promise<void> {
    const presetsSvc = host.ctx.get('agentPresets') as AgentPresetsServicePort | undefined
    if (presetsSvc === undefined) {
      // Service is not composed in this profile: settle the spinner to the neutral
      // empty message instead of leaving `/presets` on a perpetual 'Loading...'.
      store.updateAgentPresets({ rows: [], busy: false, error: undefined })
      return
    }
    try {
      const list = await presetsSvc.list()
      const rows: AgentPresetRow[] = list.map(preset => ({
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
      void bridge.cancel(id).catch(error => {
        store.setNotice(`Could not cancel: ${error instanceof Error ? error.message : String(error)}`)
      })
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
    login() { store.openLogin(); void loadLoginFlows() },
    closeLogin() { store.closeOverlay() },
    beginAuthorization(key, method) {
      void (async () => {
        const authSvc = host.ctx.get('authorization') as AuthorizationListPort | undefined
        const credentialsSvc = host.ctx.get('credentials') as CredentialsServicePort | undefined
        if (authSvc === undefined) {
          store.setNotice('Sign-in is not available in this profile.')
          return
        }
        const overlay = store.getSnapshot().overlay
        const flow = overlay.kind === 'login' ? overlay.login.flows?.find(entry => entry.key === key) : undefined
        if (flow === undefined) return
        const selectedMethod = method ?? flow.methods[0]?.id
        // The authorization flow deliberately asks for a replacement key in an
        // empty secret field. Preserve that behavior, but carry a masked hint
        // into the prompt so an already-configured route does not look empty.
        const existingRecord = selectedMethod === 'api-key'
          ? await credentialsSvc?.readRecord?.(flow.key)
          : undefined
        const storedApiKeyPreview = typeof existingRecord?.key === 'string'
          ? maskKeyPreview(existingRecord.key)
          : undefined
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
                : prompt.kind === 'secret'
                  ? { kind: 'secret' as const, message: prompt.message, placeholder: prompt.placeholder, storedApiKeyPreview }
                  : { kind: 'text' as const, message: prompt.message, placeholder: prompt.placeholder }
              store.updateLogin({ prompt: state })
              prompt.signal?.addEventListener('abort', () => {
                if (pendingPromptResolve === resolve) pendingPromptResolve = undefined
                store.updateLogin({ prompt: undefined })
                reject(new Error('authorization prompt withdrawn'))
              }, { once: true })
            })
          },
        }
        const authorizationService = new AuthorizationService({
          authorization: authSvc,
          routeActivation: routeActivationPort,
          onCredentialChanged: () => syncCredentialViews(),
        })
        try {
          const outcome = await authorizationService.begin({ key, method, interaction: interaction as AuthorizationInteraction })
          if (outcome.status === 'authorized') {
            store.setNotice(`Signed in to ${flow.label} — credentials saved, ready to use from /model.`)
          } else {
            store.updateLogin({ error: 'Sign-in cancelled.' })
          }
        } catch (error) {
          store.updateLogin({ error: `Sign-in failed: ${error instanceof Error ? error.message : String(error)}` })
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
    // `/logout` used to silently guess a single provider (the current default
    // model's, or the only configured one) and delete its credential with no
    // list, no confirmation — and for an OAuth route it only ever unset the
    // unused apiKeyEnv ref, never the actual login record, so it didn't even
    // fully sign the route out. Open `/model`'s provider list instead: it
    // already shows every route with its auth method, and Ctrl+D on a
    // selected row (`clearApiKey`) correctly clears both the api-key ref and
    // any OAuth grant.
    logout() {
      store.openModelProfile()
      store.setNotice('Select a provider, then Ctrl+D to sign out.')
      void loadProviders()
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
    backToProviderList() {
      store.updateModelProfile({ view: 'list' })
      // The provider list was fetched once, whenever `/model` first opened;
      // it never self-refreshes while an edit screen is showing. Without this,
      // stepping back after confirming "(already set)" on the edit screen —
      // itself reflecting a credential that landed after that first fetch —
      // still shows the stale pre-fetch state (no ✓, "[no api key]").
      syncCredentialViews()
    },
    createProvider() { openCustomProviderDraft() },
    addCustomProvider() {
      // `store.updateModelProfile()` is a no-op unless `/model` is already the
      // open overlay — this is the one path that isn't already there (`/login`
      // has no custom-provider path of its own), so switch first.
      store.openModelProfile()
      void loadProviders()
      openCustomProviderDraft()
    },
    editProvider(route) {
      const overlay = store.getSnapshot().overlay
      if (overlay.kind !== 'modelProfile') return
      const row = overlay.modelProfile.providers?.find(entry => entry.route === route)
      if (row === undefined) return
      openEditFormForRow(row)
    },
    // Entry point from /login: choosing an already-configured provider there
    // used to just re-run sign-in, with no way to see its masked key or manage
    // its models without separately learning /model's own navigation. Opens
    // /model and jumps straight to that provider's edit form instead.
    openProviderEditor(route) {
      void (async () => {
        store.openModelProfile()
        const rows = await credentialRows()
        const providers = rows?.map(toProviderRow)
        store.updateModelProfile({ providers: providers ?? [], busy: false, error: rows === undefined ? 'Model provider settings are not available in this profile.' : undefined, selected: 0 })
        const row = providers?.find(entry => entry.route === route)
        if (row === undefined) {
          store.setNotice(`Provider "${route}" not found.`)
          return
        }
        openEditFormForRow(row)
      })()
    },
    saveProvider(draft) {
      void (async () => {
        const settingsSvc = host.ctx.get('settings') as SettingsServicePort | undefined
        const credentialsSvc = host.ctx.get('credentials') as CredentialsServicePort | undefined
        if (settingsSvc === undefined || credentialsSvc === undefined) {
          store.setNotice('Provider settings are not available in this profile.')
          return
        }
        if (draft.isNew && draft.route.trim() === '') {
          store.updateModelProfile({ error: 'Provider ID is required.' })
          return
        }
        try {
          const key = draft.apiKeyDraft.trim()
          if (key !== '') await credentialsSvc.set(draft.apiKeyRef, key)
          // An empty string/array here means "the user never touched this
          // field" for a catalog route (every field on `ProviderDraft` is a
          // plain string, so there is no `undefined` to distinguish "unset"
          // from "explicitly blanked"). Per `PiAiProviderProfile`'s own
          // contract, omitting a field defers to the installed catalog's
          // default — writing it as `''`/`[]` instead is an explicit override
          // to "no protocol"/"no endpoint"/"no models", which fails
          // `assertServiceable` and refuses the whole write (or, for `models`,
          // would silently zero out every model on an otherwise-working route).
          const section: StoredProviderProfile = {
            ...draft.displayName.trim() === '' ? {} : { displayName: draft.displayName },
            ...draft.api.trim() === '' ? {} : { api: draft.api },
            ...draft.baseURL.trim() === '' ? {} : { baseURL: draft.baseURL },
            apiKeyEnv: draft.apiKeyRef,
            ...draft.models.length === 0 ? {} : { models: draft.models },
          }
          await settingsSvc.update(draft.settingsNs, nestAtPath(draft.settingsPath, section as unknown as Record<string, unknown>), draft.revision)
          await flushSettingsWatchers()
          store.setNotice(`Saved ${draft.displayName || draft.route} — credentials stored, ready to use from /model.`)
          store.updateModelProfile({ view: 'list' })
          syncCredentialViews()
        } catch (error) {
          store.setNotice(`save failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    deleteProvider(row) {
      void (async () => {
        const settingsSvc = host.ctx.get('settings') as SettingsServicePort | undefined
        const credentialsSvc = host.ctx.get('credentials') as CredentialsServicePort | undefined
        if (settingsSvc === undefined || credentialsSvc === undefined) {
          store.setNotice('Provider settings are not available in this profile.')
          return
        }
        try {
          await credentialsSvc.unset(row.apiKeyRef)
          await settingsSvc.update(row.settingsNs, nestAtPath(row.settingsPath, {}), row.revision)
          await flushSettingsWatchers()
          store.setNotice(`Removed ${row.displayName}.`)
          syncCredentialViews()
        } catch (error) {
          store.setNotice(`delete failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    clearApiKey(draft) {
      void (async () => {
        const credentialsSvc = host.ctx.get('credentials') as CredentialsServicePort | undefined
        if (credentialsSvc === undefined) {
          store.setNotice('Credentials are not available in this profile.')
          return
        }
        try {
          // A provider's credential can live in either of two independent
          // stores (see `loginRecordKey`'s doc comment) depending on whether it
          // was set here or via `/login` — clear whichever is actually there.
          await credentialsSvc.unset(draft.apiKeyRef)
          await credentialsSvc.deleteRecord?.(loginRecordKey(draft.route))
          store.setNotice(`Removed the API key for ${draft.displayName || draft.route}.`)
          store.updateModelProfile({ view: 'list' })
          syncCredentialViews()
        } catch (error) {
          store.setNotice(`Could not remove the key: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    discoverModelsForDraft(draft) {
      void (async () => {
        const llmSvc = host.ctx.get('llm') as LlmServicePort | undefined
        if (llmSvc === undefined) {
          store.setNotice('Model discovery is not available in this profile.')
          return
        }
        store.updateModelProfile({ busy: true })
        try {
          // A route the installed catalog ships (e.g. `zai`) answers from that
          // catalog with no network call — see `dsh-llm-pi-ai`'s discovery
          // module — so this surfaces new catalog entries a package update
          // adds, but not a model the provider added to its own API before the
          // installed catalog caught up (e.g. a newly released model tier).
          // For those, use "m" on an existing provider to type the id directly.
          const request: Record<string, unknown> = {}
          if (!draft.isNew) request.provider = draft.route
          if (draft.baseURL.trim() !== '') request.baseURL = draft.baseURL.trim()
          if (draft.api.trim() !== '') request.api = draft.api.trim()
          if (draft.apiKeyDraft.trim() !== '') request.apiKey = draft.apiKeyDraft.trim()
          const discovered = await llmSvc.discoverModels(draft.settingsNs, request)
          store.updateModelProfile({ busy: false, discovered })
        } catch (error) {
          store.updateModelProfile({ busy: false, discovered: [] })
          store.setNotice(`Model discovery failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    setActiveModel(provider, model) {
      void (async () => {
        try {
          // Switches the running session immediately (`agentOptions.provider`/
          // `model` are a one-time construction input to `ctx.agents.create`,
          // not a live setting — this is the only thing that actually changes
          // what an already-open session sends its next request to).
          await bridge.selectModel({ sessionId: id, provider, model })
          store.setActiveModel({ provider, model })
          // Also persist as the default so a *future* session starts here too;
          // best-effort — the live switch above already succeeded either way.
          try {
            await host.ctx.get('agentDefaultModel')?.saveSelection({ provider, model })
          } catch {
            // Non-fatal: the current session's model already changed.
          }
          store.setNotice(`Active model set to ${model} (${provider}).`)
          void loadProviders()
        } catch (error) {
          store.setNotice(`Could not set active model: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
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
