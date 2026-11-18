/**
 * The capture a Save point starts with: the app's snapshot verb `capture` on the frame's Host, so every version is a captured snapshot.
 */

import { FRAME_SNAPSHOT_CAPTURE_PATH, parseSnapshotCapture, type SnapshotCapture } from '../contract.ts'

export interface SnapshotPort {
  /** Undefined when the app was made before the snapshot verbs. @throws the Host's one line (a `blend.yaml` that does not parse). */
  capture(): Promise<SnapshotCapture | undefined>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function failure(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown }
  return new Error(typeof body.error === 'string' && body.error !== '' ? body.error : `${fallback} (HTTP ${String(response.status)})`)
}

export function createSnapshotApi(fetcher: FetchLike = (input, init) => fetch(input, init)): SnapshotPort {
  return {
    async capture() {
      const response = await fetcher(FRAME_SNAPSHOT_CAPTURE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw await failure(response, 'The app could not be captured')
      if (response.status === 204) return undefined
      return parseSnapshotCapture(await response.json())
    },
  }
}
