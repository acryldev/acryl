/**
 * The first-run "connect a model" step: whether this app has a model credential yet, and the one write that gives it
 * one. The key travels through the Host's own credentials Remote, the same store the Models settings page writes, so
 * DeepSeek Harness owns it under its home; this module never writes it to the app folder, the ACRYL home or the page.
 *
 * The Remote faces are read by name through the narrow ports below, like the workspace's other optional Host services,
 * so a composition without the chat simply has no card instead of holding the whole plugin pending.
 */

/** The share of `remote.credentials` this step uses. */
export interface ModelCredentialsPort {
  describe(refs: readonly string[]): Promise<{
    readonly ok: boolean
    readonly value?: Readonly<Record<string, { readonly configured: boolean }>>
    readonly error?: { readonly message: string }
  }>
  set(ref: string, value: string): Promise<{
    readonly ok: boolean
    readonly error?: { readonly message: string }
  }>
}

/** The share of `remote.llm` this step uses. */
export interface ModelLlmPort {
  listProviders(): Promise<{
    readonly ok: boolean
    readonly value?: readonly { readonly id: string; readonly name: string }[]
    readonly error?: { readonly message: string }
  }>
  listConfigurableProviders(): Promise<{
    readonly ok: boolean
    readonly value?: readonly { readonly provider: string }[]
    readonly error?: { readonly message: string }
  }>
}

/**
 * The share of `remote.session` the account check uses: the same catalog the Models page joins for
 * `ProviderRow.accountAvailable` (a `deepseek-account` group with at least one live model means the signed-in account can
 * serve requests, so the API-key card has nothing to ask for).
 */
export interface ModelSessionPort {
  modelCatalog(): Promise<{
    readonly ok: boolean
    readonly value?: {
      readonly groups: readonly { readonly id: string; readonly models: readonly unknown[] }[]
    }
    readonly error?: { readonly message: string }
  }>
}

/** The group id the Models page checks for an available account route (`ProviderRow.accountAvailable`). */
export const ACCOUNT_MODEL_GROUP = 'deepseek-account'

/** What the chat surface shows for the step. */
export type ModelConnectState =
  /** The Host has not answered yet; nothing is shown. */
  | { readonly status: 'checking' }
  /** A key (or an account route) is configured; the step stays out of the way. */
  | { readonly status: 'ready' }
  /** No model can serve a request: the card asks for a key. */
  | { readonly status: 'needs-key'; readonly busy: boolean; readonly error: string | null }
  /** The person chose "Not now"; remembered so the step does not nag. */
  | { readonly status: 'dismissed' }
  /** The Host has no credentials or model service (a composition without the chat). */
  | { readonly status: 'unavailable' }

/** The credential reference the official DeepSeek route resolves through by default (`llm-deepseek-api-key`'s `apiKeyEnv`). */
export const DEFAULT_MODEL_KEY_REF = 'DEEPSEEK_API_KEY'

/** Where the dismissal is kept (browser storage, per viewer, like the workspace's other conveniences). */
export const MODEL_CONNECT_DISMISSED_KEY = 'acryl-workspace:model-connect'

/** The same reference derivation the Models page uses for a hand-declared provider (`deriveKeyRef`). */
export function deriveModelKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}_API_KEY`
}

export interface ModelConnectDeps {
  /** Resolves `remote.credentials` when it is needed; undefined when the Host does not offer it. */
  readonly getCredentials: () => ModelCredentialsPort | undefined
  /** Resolves `remote.llm` when it is needed; undefined when the Host does not offer it. */
  readonly getLlm: () => ModelLlmPort | undefined
  /** Resolves `remote.session` for the account-availability join; absent in a composition without the session remote. */
  readonly getSession?: (() => ModelSessionPort | undefined) | undefined
  /** Where the dismissal is kept; absent when browser storage is blocked. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | undefined
  /** Open Settings on its Models section (the step's secondary action). */
  readonly openSettings?: (() => void) | undefined
}

/**
 * One controller per workspace lifetime: the card's state, its readiness check, and the credential write. The card
 * renders from {@link getSnapshot}; every change replaces the snapshot so React's store hook sees it.
 */
export class ModelConnectControl {
  private state: ModelConnectState = { status: 'checking' }
  private readonly listeners = new Set<() => void>()
  /** A refresh that started before a connect must not overwrite the connect's outcome. */
  private generation = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private retries = 0
  private disposed = false

  constructor(private readonly deps: ModelConnectDeps) {}

  getSnapshot = (): ModelConnectState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Run the first check. Called once from the plugin's effect. @returns disposer. */
  start(): () => void {
    this.disposed = false
    void this.refresh()
    return () => {
      this.disposed = true
      this.generation += 1
      if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
  }

  /** Re-read readiness; a credential added elsewhere (the Settings page, another tab) hides the card. */
  async refresh(): Promise<void> {
    const generation = ++this.generation
    const credentials = this.deps.getCredentials()
    const llm = this.deps.getLlm()
    if (credentials === undefined || llm === undefined) {
      this.set({ status: 'unavailable' })
      return
    }
    const providers = await Promise.resolve(llm.listProviders()).catch(() => undefined)
    if (generation !== this.generation) return
    // The Remote faces activate before the llm service finishes registering its routes; an empty list at first sight is
    // "not yet", not "no chat". Retry for a few seconds before concluding the Host has no provider.
    if (providers === undefined || !providers.ok || providers.value === undefined || providers.value.length === 0) {
      this.retryLater()
      return
    }
    // The Models page's own account join (`ProviderRow.accountAvailable`): a signed-in account shows a live
    // `deepseek-account` model group, and then the API-key card has nothing to ask for. A route merely being registered is
    // not enough; the catalog is what says the account can serve requests.
    const session = this.deps.getSession?.()
    if (session !== undefined) {
      const catalog = await Promise.resolve(session.modelCatalog()).catch(() => undefined)
      if (generation !== this.generation) return
      const accountAvailable = catalog?.ok === true
        && catalog.value !== undefined
        && catalog.value.groups.some(group => group.id === ACCOUNT_MODEL_GROUP && group.models.length > 0)
      if (accountAvailable) {
        this.retries = 0
        this.set({ status: 'ready' })
        return
      }
    }
    const refs = new Set<string>([DEFAULT_MODEL_KEY_REF])
    const directory = await Promise.resolve(llm.listConfigurableProviders()).catch(() => undefined)
    if (directory?.ok === true && directory.value !== undefined)
      for (const entry of directory.value) refs.add(deriveModelKeyRef(entry.provider))
    const described = await Promise.resolve(credentials.describe([...refs])).catch(() => undefined)
    if (generation !== this.generation) return
    if (described === undefined || !described.ok || described.value === undefined) {
      this.retryLater()
      return
    }
    this.retries = 0
    if (Object.values(described.value).some(info => info.configured)) {
      this.set({ status: 'ready' })
      return
    }
    if (this.deps.storage?.getItem(MODEL_CONNECT_DISMISSED_KEY) === '1') {
      this.set({ status: 'dismissed' })
      return
    }
    this.set({ status: 'needs-key', busy: false, error: null })
  }

  /** Try again shortly while the Host is still coming up; stop after about ten seconds. */
  private retryLater(): void {
    if (this.disposed || this.retryTimer !== undefined) return
    this.retries += 1
    if (this.retries > 20) {
      this.set({ status: 'unavailable' })
      return
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.refresh()
    }, 500)
  }

  /**
   * Store the typed key through the Host's credential service. On success the card leaves; the key itself is never
   * kept here (the field that holds it is cleared by the caller after this resolves).
   * @param key - what the person pasted; surrounding whitespace is not part of a key.
   */
  async connect(key: string): Promise<void> {
    const value = key.trim()
    const credentials = this.deps.getCredentials()
    if (credentials === undefined) {
      this.set({ status: 'unavailable' })
      return
    }
    if (value === '') {
      this.set({ status: 'needs-key', busy: false, error: 'Paste an API key first.' })
      return
    }
    this.set({ status: 'needs-key', busy: true, error: null })
    const result = await Promise.resolve(credentials.set(DEFAULT_MODEL_KEY_REF, value)).catch((cause: unknown) => ({
      ok: false,
      error: { message: cause instanceof Error ? cause.message : String(cause) },
    }))
    if (!result.ok) {
      this.set({ status: 'needs-key', busy: false, error: result.error?.message ?? 'The key was not stored.' })
      return
    }
    this.set({ status: 'ready' })
  }

  /** "Not now": remembered in browser storage so the step does not come back on the next page. */
  dismiss(): void {
    this.deps.storage?.setItem(MODEL_CONNECT_DISMISSED_KEY, '1')
    this.set({ status: 'dismissed' })
  }

  /** The card's secondary action: Settings > Models, for a provider other than the official DeepSeek route. */
  openSettings(): void {
    this.deps.openSettings?.()
  }

  private set(state: ModelConnectState): void {
    this.state = state
    for (const listener of [...this.listeners]) listener()
  }
}
