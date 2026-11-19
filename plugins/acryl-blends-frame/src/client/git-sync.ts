/**
 * The Git tab's push and pull: the calls to the frame's Host (which runs git), and how the branch's remote state reads in one line.
 */

import {
  FRAME_GIT_PULL_PATH,
  FRAME_GIT_PUSH_PATH,
  FRAME_GIT_PUSH_PLAN_PATH,
  FRAME_GIT_REMOTE_PATH,
  parseGitRemoteState,
  parseGitSyncResult,
  parsePushPlan,
  type GitRemoteState,
  type GitSyncResult,
  type PushPlan,
} from '../contract.ts'

export interface GitSyncPort {
  /** The checked-out branch against its remote; `fetch` asks the remote first. @throws the Host's one line. */
  remote(fetch: boolean): Promise<GitRemoteState>
  /** What a push would send and where, after asking the remote; nothing is sent. @throws the line saying why there is nothing to push. */
  planPush(): Promise<PushPlan>
  /** Sends only the confirmed plan. @throws git's one line (a refused login, the network) or the reason nothing was sent. */
  push(confirmed: PushPlan): Promise<GitSyncResult>
  /** Fast-forward only. @throws git's one line, or the sentence saying the branch moved on both sides and nothing changed. */
  pull(): Promise<GitSyncResult>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown }
  return new Error(typeof body.error === 'string' && body.error !== '' ? body.error : `${fallback} (HTTP ${String(response.status)})`)
}

export function createGitSyncApi(fetcher: FetchLike = (input, init) => fetch(input, init)): GitSyncPort {
  const post = async (path: string, fallback: string, body: unknown = {}): Promise<unknown> => {
    const response = await fetcher(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw await failure(response, fallback)
    return response.json()
  }
  return {
    async remote(fetchFirst) {
      const response = await fetcher(`${FRAME_GIT_REMOTE_PATH}${fetchFirst ? '?fetch=1' : ''}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw await failure(response, 'The remote state could not be read')
      return parseGitRemoteState(await response.json())
    },
    planPush: async () => parsePushPlan(await post(FRAME_GIT_PUSH_PLAN_PATH, 'The push could not be planned')),
    push: async confirmed => parseGitSyncResult(await post(FRAME_GIT_PUSH_PATH, 'The branch could not be pushed', { confirm: confirmed })),
    pull: async () => parseGitSyncResult(await post(FRAME_GIT_PULL_PATH, 'The branch could not be pulled')),
  }
}

/** The question a push asks before anything is sent: how many versions, where they land and the remote's address. */
export function pushQuestion(plan: PushPlan): string {
  const versions = `${String(plan.versions)} version${plan.versions === 1 ? '' : 's'}`
  return plan.createsBranch
    ? `Push ${plan.branch} (${versions}) to ${plan.address}? It creates ${plan.target} there.`
    : `Push ${versions} to ${plan.target} (${plan.address})?`
}

/** The remote state as the Git tab writes it: "origin/main · ahead 2 · behind 1", "up to date with origin/main", "no remote", ... */
export function remoteLabel(state: GitRemoteState): string {
  switch (state.kind) {
    case 'detached':
      return 'not on a branch'
    case 'no-remote':
      return 'no remote'
    case 'unpublished':
      return state.remote === undefined ? `${state.branch} is not on a remote yet` : `${state.branch} is not on ${state.remote} yet`
    case 'tracking': {
      const counts = [
        ...(state.ahead > 0 ? [`ahead ${String(state.ahead)}`] : []),
        ...(state.behind > 0 ? [`behind ${String(state.behind)}`] : []),
      ]
      return counts.length === 0 ? `up to date with ${state.upstream}` : `${state.upstream} · ${counts.join(' · ')}`
    }
  }
}

/**
 * Which buttons do something: Push when there is something to send (or the branch is not on the remote yet), Pull when the remote is ahead.
 * When the remote could not be asked the counts may be old, so both stay on and a click says what git says.
 */
export function syncActions(state: GitRemoteState): { readonly push: boolean; readonly pull: boolean } {
  if (state.kind === 'unpublished') return { push: state.remote !== undefined, pull: false }
  if (state.kind !== 'tracking') return { push: false, pull: false }
  if (state.fetchError !== undefined) return { push: true, pull: true }
  return { push: state.ahead > 0, pull: state.behind > 0 }
}

/**
 * The versions header's compact remote control: `↑2` sends the versions only here, `↓1` brings the remote's in, `✓` says the branch and its
 * remote agree; nothing at all without a remote (or off a branch). A first push shows a bare `↑`. Each chip's tooltip is the remote state's line.
 */
export interface RemoteChips {
  readonly push?: string
  readonly pull?: string
  readonly synced: boolean
}

export function remoteChips(state: GitRemoteState): RemoteChips | undefined {
  if (state.kind === 'detached' || state.kind === 'no-remote') return undefined
  if (state.kind === 'unpublished') return state.remote === undefined ? undefined : { push: '↑', synced: false }
  const actions = syncActions(state)
  const push = state.ahead > 0 ? `↑${String(state.ahead)}` : actions.push ? '↑' : undefined
  const pull = state.behind > 0 ? `↓${String(state.behind)}` : actions.pull ? '↓' : undefined
  return { ...(push === undefined ? {} : { push }), ...(pull === undefined ? {} : { pull }), synced: push === undefined && pull === undefined }
}
