/** The registry, adding a plugin and the GitHub check, as the page asks the frame's Host for them (see `../registry.ts`, `../plain.ts`). */

import { FRAME_PLUGINS_GITHUB_CONNECT_PATH, FRAME_PLUGINS_GITHUB_PATH, FRAME_PLUGINS_PULL_PATH, FRAME_PLUGINS_REGISTRY_PATH, parseGithubConnectState, parseGithubReadiness, parsePulledPlugin, parseRegistryView, type GithubConnectState, type GithubReadiness, type PulledPluginView, type RegistryView } from '../contract.ts'
import { failureOf } from './plain-failure.ts'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface RegistryApi {
  /** The public registry with the plugins this app already has marked; an unreadable registry is an answer, not a failure. */
  registry(): Promise<RegistryView>
  /** Add one released plugin (`github:<owner>/<repo>@<version>`) to the running app. @throws PlainFailure with why it was refused. */
  add(source: string): Promise<PulledPluginView>
  /** Whether this computer can share to GitHub now. */
  github(): Promise<GithubReadiness>
  /** Connect GitHub from the app: GitHub's own browser sign-in, which gives a one-time code for github.com/login/device. */
  readonly connect: GithubConnectApi
}

export interface GithubConnectApi {
  /** Start the sign-in (or rejoin the one waiting); answers with the code once GitHub gave it. */
  start(): Promise<GithubConnectState>
  /** Where the sign-in is now. */
  state(): Promise<GithubConnectState>
}

export function createRegistryApi(fetcher: FetchLike = (input, init) => fetch(input, init)): RegistryApi {
  const get = async (path: string): Promise<unknown> => {
    const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!response.ok) throw await failureOf(response)
    return response.json()
  }
  return {
    registry: async () => parseRegistryView(await get(FRAME_PLUGINS_REGISTRY_PATH)),
    github: async () => parseGithubReadiness(await get(FRAME_PLUGINS_GITHUB_PATH)),
    connect: {
      async start() {
        const response = await fetcher(FRAME_PLUGINS_GITHUB_CONNECT_PATH, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
        if (!response.ok) throw await failureOf(response)
        return parseGithubConnectState(await response.json())
      },
      state: async () => parseGithubConnectState(await get(FRAME_PLUGINS_GITHUB_CONNECT_PATH)),
    },
    async add(source) {
      const response = await fetcher(FRAME_PLUGINS_PULL_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ source }),
      })
      if (!response.ok) throw await failureOf(response)
      return parsePulledPlugin(await response.json())
    },
  }
}
