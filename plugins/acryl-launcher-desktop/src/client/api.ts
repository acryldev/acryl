/** Same-origin browser client for the launcher routes (`../contract.ts`). */
import {
  LAUNCHER_ADD_PATH, LAUNCHER_BLENDS_PATH, LAUNCHER_HEALTH_PATH, LAUNCHER_NEW_PATH, LAUNCHER_REMOVE_PATH, LAUNCHER_START_PATH, LAUNCHER_STATE_PATH, LAUNCHER_STOP_PATH,
  type BlendView, type BlendsResponse, type HealthView, type NewAppRequest, type StateResponse,
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
  add(path: string): Promise<StateResponse>
  remove(id: string): Promise<StateResponse>
  create(request: NewAppRequest): Promise<StateResponse>
  start(id: string): Promise<StateResponse>
  stop(id: string): Promise<StateResponse>
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
  return {
    state: () => get<StateResponse>(LAUNCHER_STATE_PATH),
    health: () => get<HealthResponse>(LAUNCHER_HEALTH_PATH),
    blends: async () => (await get<BlendsResponse>(LAUNCHER_BLENDS_PATH)).blends,
    add: path => post(LAUNCHER_ADD_PATH, { path }),
    remove: id => post(LAUNCHER_REMOVE_PATH, { id }),
    create: request => post(LAUNCHER_NEW_PATH, request),
    start: id => post(LAUNCHER_START_PATH, { id }),
    stop: id => post(LAUNCHER_STOP_PATH, { id }),
  }
}
