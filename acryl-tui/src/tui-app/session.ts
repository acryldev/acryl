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
import { deriveApiKeyRef, maskKeyPreview, type ProviderDraft, type ProviderRow, type StoredProviderProfile } from '../tui/modelProfile/types.js'
import type { AgentPresetRow } from '../tui/agentPresets/types.js'
import { loadFileIndex } from '../tui/fileIndex.js'
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

/**
 * `dsh-llm-pi-ai`'s own credential record scope (`credentialKey('llm-pi-ai', providerId)`,
 * i.e. `"llm-pi-ai/<providerId>"`). A `/login` sign-in (OAuth or API key) writes here through
 * pi-ai's own `CredentialStore`, entirely separate from the `apiKeyEnv` reference a manually
 * configured provider's settings profile points at — so a provider's "has credentials" status
 * has to check both places, and this is the address for the first.
 */
function piAiRecordKey(providerId: string): string {
  return `llm-pi-ai/${providerId}`
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

  // Re-join `ctx.llm`'s provider directory with `ctx.settings`/`ctx.credentials`
  // and refresh the open `/model` overlay's list. The three services are
  // optional and re-checked at point of use (the same pattern the other
  // model-profile actions use), so a profile that does not mount them degrades
  // to an error notice instead of refusing to start.
  // Pulled out of `loadProviders()` so `/logout` (which must work whether or
  // not `/model` happens to be the open overlay — `store.updateModelProfile`
  // is a no-op while it isn't) can compute the same row list independently,
  // instead of reading `/model`'s possibly-empty cached overlay state and
  // reporting "no active providers" even when providers plainly exist.
  async function computeProviderRows(): Promise<ProviderRow[] | undefined> {
    const settingsSvc: any = host.ctx.get('settings')
    const credentialsSvc: any = host.ctx.get('credentials')
    const llmSvc: any = host.ctx.get('llm')
    if (settingsSvc === undefined || credentialsSvc === undefined || llmSvc === undefined) return undefined
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
      // A `/login` sign-in never sets `apiKeyEnv` — it writes pi-ai's own login
      // record instead — so `info.configured` alone would still read "no key"
      // for a provider the user just successfully signed into via OAuth or a
      // catalog API key. Check that record too before reporting "not configured".
      const loginRecord = await credentialsSvc.readRecord?.(piAiRecordKey(entry.provider))
      // A `/login` record's `kind` names the actual method used ('grant' is an
      // OAuth token, 'api-key' is a catalog-flow-typed key); the ref-based path
      // (`apiKeyEnv`) only ever comes from typing a key into `/model` directly,
      // so it's unambiguously 'api-key' too. A row can only be one or the
      // other in practice — `/login` and `/model` write to different storage,
      // and a provider signed in through one is not simultaneously the other.
      const authMethod: 'oauth' | 'api-key' | undefined = loginRecord !== undefined
        ? (loginRecord.kind === 'grant' ? 'oauth' : 'api-key')
        : info.configured ? 'api-key' : undefined
      const isLive = live.has(entry.provider)
      // `value?.models` only reflects a settings-document override; omitting it
      // (the normal case — nobody names an explicit model list unless
      // customizing) means "use the installed catalog's own models", which
      // only a live registration can actually answer. Falling back to the
      // settings value alone left every un-customized route — the common case
      // for every OAuth/catalog sign-in — showing zero models in `/model`,
      // even though the route worked fine for real requests.
      const models = isLive
        ? await llmSvc.listModels(entry.provider).catch(() => value?.models ?? [])
        : value?.models ?? []
      rows.push({
        route: entry.provider,
        displayName: value?.displayName ?? entry.displayName,
        settingsNs: entry.settingsNs,
        settingsPath: entry.settingsPath,
        configured: userValue !== undefined,
        live: isLive,
        api: value?.api,
        baseURL: value?.baseURL,
        apiKeyRef,
        apiKeyConfigured: info.configured || loginRecord !== undefined,
        authMethod,
        models,
        revision: descriptor?.revision,
      })
    }
    return rows
  }

  async function loadProviders(): Promise<void> {
    const rows = await computeProviderRows()
    if (rows === undefined) {
      store.updateModelProfile({ providers: [], busy: false, error: 'Model provider settings are not available in this profile.' })
      return
    }
    store.updateModelProfile({ providers: rows, busy: false, error: undefined, selected: 0 })
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
        const credentialsSvc: any = host.ctx.get('credentials')
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

  // A `/login` sign-in only ever writes a credential (the OAuth grant or typed
  // API key) — it never touches `ctx.settings`. `dsh-llm-pi-ai` only registers
  // a route as live once its settings section names it (even with an empty
  // profile, which just means "use the installed catalog's own defaults"), so
  // without this a successful sign-in leaves the provider credentialed but
  // still absent from `ctx.llm`'s live directory and unusable from `/model`.
  // Writes only when the route has no settings profile yet, so it never clobbers
  // one the user already configured (custom baseURL, model overrides, etc.).
  // Returns whether this call actually wrote a settings change — the
  // retroactive-repair loop in `loadAuthorizationFlows` uses that (not mere
  // completion) to decide whether it's worth refreshing state, so an
  // already-caught-up flow doesn't retrigger `refreshCredentialState` ->
  // `loadAuthorizationFlows` -> this same repair pass forever (that loop is
  // exactly what corrupted every OAuth display name into a multi-hundred-KB
  // string of repeated "-oauth" suffixes and reset `/model`'s list selection
  // to 0 on every iteration).
  async function ensureProviderActivated(providerId: string, method: string | undefined): Promise<boolean> {
    const settingsSvc: any = host.ctx.get('settings')
    const llmSvc: any = host.ctx.get('llm')
    if (settingsSvc === undefined || llmSvc === undefined) return false
    const entry = (llmSvc.listConfigurableProviders() as Array<{ provider: string; displayName: string; settingsNs: string; settingsPath: readonly string[] }>)
      .find(candidate => candidate.provider === providerId)
    if (entry === undefined) return false
    const descriptors = settingsSvc.describe({ redactSecrets: true }) as Array<{ ns: string; user?: unknown; revision?: number }>
    const descriptor = descriptors.find(candidate => candidate.ns === entry.settingsNs)
    const existing = descriptor === undefined ? undefined : getAtPath(descriptor.user, entry.settingsPath) as { displayName?: string } | undefined
    // OAuth-signed-in routes get a permanent, stored `-oauth` name suffix (not
    // just a rendered tag) so a route the user later adds as a *second*,
    // API-key-authenticated custom route under the same catalog name — the
    // dual-credential workaround discussed for this same provider — is
    // unambiguously distinct everywhere a name is shown, not just wherever
    // the auth-method badge happens to render. Runs on every successful
    // OAuth sign-in, not only the first, so a route that already has a
    // profile (signed in earlier, before this suffix existed) gets it
    // retroactively too, without touching anything else already configured
    // there — the merge-only `update()` leaves every other field as is.
    //
    // `entry.displayName` reflects whatever is *currently* configured, not a
    // stable catalog base — `listConfigurableProviders()` merges in the
    // settings-stored name once one exists. Stripping any existing `-oauth`
    // run before re-appending is what makes this idempotent: without it,
    // the retroactive-repair pass in `loadAuthorizationFlows` (which calls
    // this for every already-oauth-configured route on every app launch)
    // re-suffixes an already-suffixed name every single time it runs.
    const baseName = entry.displayName.replace(/(?:-oauth)+$/, '')
    const oauthName = `${baseName}-oauth`
    if (existing !== undefined) {
      if (method === 'oauth' && existing.displayName !== oauthName) {
        await settingsSvc.update(entry.settingsNs, nestAtPath(entry.settingsPath, { displayName: oauthName }), descriptor?.revision)
        await flushSettingsWatchers()
        return true
      }
      return false
    }
    const section = method === 'oauth' ? { displayName: oauthName } : {}
    await settingsSvc.update(entry.settingsNs, nestAtPath(entry.settingsPath, section), descriptor?.revision)
    await flushSettingsWatchers()
    return true
  }

  // Fetch the registered authorization flows (providers that ship a login via
  // dsh-llm-pi-ai) and refresh the open `/login` overlay's list.
  async function loadAuthorizationFlows(): Promise<void> {
    const authSvc: any = host.ctx.get('authorization')
    const credentialsSvc: any = host.ctx.get('credentials')
    if (authSvc === undefined) {
      store.updateLogin({ flows: [], busy: false, error: 'Sign-in is not available in this profile.' })
      return
    }
    try {
      const entries = authSvc.list() as Array<{ key: string; label: string; methods: Array<{ id: string; label: string }>; inFlight: boolean }>
      // A flow's `key` IS its stored credential's record key, so this is a
      // direct presence check — the durable "signed in and ready to use"
      // signal a transient `setNotice` can't provide once the overlay moves on.
      const list = await Promise.all(entries.map(async entry => {
        const record = credentialsSvc === undefined ? undefined : await credentialsSvc.readRecord?.(entry.key)
        return {
          ...entry,
          configured: record !== undefined,
          authMethod: record === undefined ? undefined : (record.kind === 'grant' ? 'oauth' as const : 'api-key' as const),
        }
      }))
      store.updateLogin({ flows: list, busy: false, error: undefined })
      // Retroactive repair for routes signed in via OAuth before the
      // `-oauth` display-name suffix existed: `ensureProviderActivated` is
      // idempotent (it only writes when the stored name doesn't already
      // carry the suffix), so replaying it here on every already-configured
      // OAuth flow costs nothing once it's caught up.
      const toRepair = list.filter(flow => flow.configured && flow.authMethod === 'oauth' && flow.key.startsWith('llm-pi-ai/'))
      if (toRepair.length > 0) {
        void (async () => {
          let repaired = false
          for (const flow of toRepair) {
            try {
              // Sequential, not `Promise.all`: `ensureProviderActivated` reads
              // the namespace's revision, then writes expecting that exact
              // revision back — running several concurrently against the
              // *same* namespace means every write after the first reads a
              // now-stale revision and throws SettingsConflictError. Running
              // them one at a time means each one sees the revision the
              // previous write actually landed at.
              if (await ensureProviderActivated(flow.key.slice('llm-pi-ai/'.length), 'oauth')) repaired = true
            } catch {
              // Best-effort background repair — a conflict or transient
              // failure here must not surface as an unhandled rejection (it
              // previously crashed the whole process) or block the others;
              // the repair simply retries next time `/login` opens.
            }
          }
          if (repaired) refreshCredentialState()
        })()
      }
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
  // happens to refetch on its own. Refreshing both together after any action
  // that can change either's picture closes that gap regardless of which
  // overlay initiated the change; each update is a no-op while its overlay
  // isn't the one currently open.
  function refreshCredentialState(): void {
    void loadProviders()
    void loadAuthorizationFlows()
  }

  /** Open `/model`'s blank custom-provider draft — assumes `/model` is (or is about to become) the open overlay. Shared by `createProvider` (already there) and `addCustomProvider` (getting there first). */
  function openCustomProviderDraft(): void {
    const llmSvc: any = host.ctx.get('llm')
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
    login() { store.openLogin(); void loadAuthorizationFlows() },
    closeLogin() { store.closeOverlay() },
    beginAuthorization(key, method) {
      void (async () => {
        const authSvc: any = host.ctx.get('authorization')
        const credentialsSvc: any = host.ctx.get('credentials')
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
        try {
          const outcome = await authSvc.begin({ key, method, interaction })
          if (outcome.status === 'authorized') {
            store.setNotice(`Signed in to ${flow.label} — credentials saved, ready to use from /model.`)
            if (key.startsWith('llm-pi-ai/')) await ensureProviderActivated(key.slice('llm-pi-ai/'.length), method)
            refreshCredentialState()
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
      refreshCredentialState()
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
        const rows = await computeProviderRows()
        store.updateModelProfile({ providers: rows ?? [], busy: false, error: rows === undefined ? 'Model provider settings are not available in this profile.' : undefined, selected: 0 })
        const row = rows?.find(entry => entry.route === route)
        if (row === undefined) {
          store.setNotice(`Provider "${route}" not found.`)
          return
        }
        openEditFormForRow(row)
      })()
    },
    saveProvider(draft) {
      void (async () => {
        const settingsSvc: any = host.ctx.get('settings')
        const credentialsSvc: any = host.ctx.get('credentials')
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
          refreshCredentialState()
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
          await flushSettingsWatchers()
          store.setNotice(`Removed ${row.displayName}.`)
          refreshCredentialState()
        } catch (error) {
          store.setNotice(`delete failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    clearApiKey(draft) {
      void (async () => {
        const credentialsSvc: any = host.ctx.get('credentials')
        if (credentialsSvc === undefined) {
          store.setNotice('Credentials are not available in this profile.')
          return
        }
        try {
          // A provider's credential can live in either of two independent
          // stores (see `piAiRecordKey`'s doc comment) depending on whether it
          // was set here or via `/login` — clear whichever is actually there.
          await credentialsSvc.unset(draft.apiKeyRef)
          await credentialsSvc.deleteRecord?.(piAiRecordKey(draft.route))
          store.setNotice(`Removed the API key for ${draft.displayName || draft.route}.`)
          store.updateModelProfile({ view: 'list' })
          refreshCredentialState()
        } catch (error) {
          store.setNotice(`Could not remove the key: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    },
    discoverModelsForDraft(draft) {
      void (async () => {
        const llmSvc: any = host.ctx.get('llm')
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
