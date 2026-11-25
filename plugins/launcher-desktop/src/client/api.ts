/** Same-origin browser client for the launcher routes (`../contract.ts`). */
import {
  LAUNCHER_ADD_PATH, LAUNCHER_ADE_PATH, LAUNCHER_APPLICATIONS_PATH, LAUNCHER_ASSISTANT_FOLDER_PATH, LAUNCHER_BLENDS_PATH, LAUNCHER_PLUGIN_CATALOG_PATH, LAUNCHER_PLUGIN_PULL_PATH, LAUNCHER_PLUGINS_PATH, LAUNCHER_PUBLISH_PATH, LAUNCHER_PUBLISH_PLAN_PATH, LAUNCHER_SHARE_PATH, LAUNCHER_SHARE_PLAN_PATH, LAUNCHER_GITHUB_PATH, LAUNCHER_GITHUB_START_PATH, LAUNCHER_GITHUB_POLL_PATH, LAUNCHER_GITHUB_DISCONNECT_PATH, LAUNCHER_HEALTH_PATH, LAUNCHER_NEW_PATH, LAUNCHER_REMOVE_PATH, LAUNCHER_START_PATH, LAUNCHER_STATE_PATH, LAUNCHER_STOP_PATH, LAUNCHER_UPDATE_PATH, LAUNCHER_UPDATE_SELF_PATH,
  type AppSharePlanRequest, type AppSharePlanView, type GithubPollView, type GithubStartView, type GithubView, type AppShareRequest, type AppShareResponse, type AssistantFolderResponse, type BlendView, type BlendsResponse, type HealthView, type NewAppRequest, type PluginPullResponse, type PluginsResponse, type PluginView, type PublishPlanRequest, type PublishPlanView,
  type PluginCatalogView, type PublishRequest, type PublishResponse, type StateResponse,
} from '../contract.ts'

export interface HealthResponse extends HealthView {
  /** The saved model key, masked (`sk-...1234`), or null. */
  readonly keyMask: string | null
}

export interface LauncherApi {
  state(): Promise<StateResponse>
  health(): Promise<HealthResponse>
  /** The registry's Blends; rejects with the reason in words when it cannot be read. */
  blends(): Promise<readonly BlendView[]>
  /** The Cordis plugin catalog of the public registry; rejects with the reason in words when it cannot be read. */
  pluginCatalog(): Promise<PluginCatalogView>
  add(path: string): Promise<StateResponse>
  remove(id: string): Promise<StateResponse>
  /** Put the app's launcher where the OS looks for apps (`on`), or take it out again. */
  inApplications(id: string, on: boolean): Promise<StateResponse>
  create(request: NewAppRequest): Promise<StateResponse>
  start(id: string): Promise<StateResponse>
  /** Bring the newer release of the app's Blend into it, keeping the person's changes. */
  update(id: string): Promise<StateResponse>
  /** Update this app itself to its Blend's newer release. */
  updateSelf(): Promise<StateResponse>
  stop(id: string): Promise<StateResponse>
  /** ACRYL ADE in a window (`desktop`) or the browser (`web`); made the first time (about a minute). */
  openAde(surface: 'web' | 'desktop'): Promise<StateResponse>
  /** The folder the assistant's agent works in (the apps folder, made if missing). */
  assistantFolder(): Promise<string>
  /** The plugins of a running app; rejects with the reason in words (for example that the app is not running). */
  plugins(id: string): Promise<readonly PluginView[]>
  pullPlugin(id: string, source: string): Promise<PluginPullResponse>
  /** What publishing a plugin would send; sends nothing. */
  publishPlan(request: PublishPlanRequest): Promise<PublishPlanView>
  /** The person's yes to the plan they read. */
  publish(request: PublishRequest): Promise<PublishResponse>
  /** What sharing a whole app would send (its repository, visibility, changed files); sends nothing. */
  sharePlan(request: AppSharePlanRequest): Promise<AppSharePlanView>
  github(): Promise<GithubView>
  githubStart(): Promise<GithubStartView>
  githubPoll(): Promise<GithubPollView>
  githubDisconnect(): Promise<GithubView>
  /** The person's yes to the share plan they read. */
  share(request: AppShareRequest): Promise<AppShareResponse>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** The Host's refusal in words (`{ error }`), or the status when it gave none. */
async function failure(response: Response): Promise<Error> {
  let said: unknown
  try { said = ((await response.json()) as { error?: unknown }).error } catch { said = undefined }
  return new Error(typeof said === 'string' && said !== '' ? said : `The launcher answered HTTP ${String(response.status)}.`)
}

/** @param fetchImpl - injectable for tests; defaults to the page's fetch. */
export function createLauncherApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): LauncherApi {
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetchImpl(path, { method: 'GET', credentials: 'same-origin' })
    if (!response.ok) throw await failure(response)
    return await response.json() as T
  }
  const post = async (path: string, body: unknown): Promise<StateResponse> => {
    const response = await fetchImpl(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw await failure(response)
    return await response.json() as StateResponse
  }
  const send = async <T>(path: string, body: unknown): Promise<T> => {
    const response = await fetchImpl(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw await failure(response)
    return await response.json() as T
  }
  return {
    state: () => get<StateResponse>(LAUNCHER_STATE_PATH),
    health: () => get<HealthResponse>(LAUNCHER_HEALTH_PATH),
    blends: async () => (await get<BlendsResponse>(LAUNCHER_BLENDS_PATH)).blends,
    pluginCatalog: () => get<PluginCatalogView>(LAUNCHER_PLUGIN_CATALOG_PATH),
    add: path => post(LAUNCHER_ADD_PATH, { path }),
    remove: id => post(LAUNCHER_REMOVE_PATH, { id }),
    inApplications: (id, on) => post(LAUNCHER_APPLICATIONS_PATH, { id, on }),
    create: request => post(LAUNCHER_NEW_PATH, request),
    start: id => post(LAUNCHER_START_PATH, { id }),
    stop: id => post(LAUNCHER_STOP_PATH, { id }),
    update: id => post(LAUNCHER_UPDATE_PATH, { id }),
    updateSelf: () => post(LAUNCHER_UPDATE_SELF_PATH, {}),
    openAde: surface => post(LAUNCHER_ADE_PATH, { surface }),
    assistantFolder: async () => (await send<AssistantFolderResponse>(LAUNCHER_ASSISTANT_FOLDER_PATH, {})).folder,
    plugins: async id => (await send<PluginsResponse>(LAUNCHER_PLUGINS_PATH, { id })).plugins,
    pullPlugin: (id, source) => send<PluginPullResponse>(LAUNCHER_PLUGIN_PULL_PATH, { id, source }),
    publishPlan: request => send<PublishPlanView>(LAUNCHER_PUBLISH_PLAN_PATH, request),
    publish: request => send<PublishResponse>(LAUNCHER_PUBLISH_PATH, request),
    sharePlan: request => send<AppSharePlanView>(LAUNCHER_SHARE_PLAN_PATH, request),
    github: () => send<GithubView>(LAUNCHER_GITHUB_PATH, {}),
    githubStart: () => send<GithubStartView>(LAUNCHER_GITHUB_START_PATH, {}),
    githubPoll: () => send<GithubPollView>(LAUNCHER_GITHUB_POLL_PATH, {}),
    githubDisconnect: () => send<GithubView>(LAUNCHER_GITHUB_DISCONNECT_PATH, {}),
    share: request => send<AppShareResponse>(LAUNCHER_SHARE_PATH, request),
  }
}
