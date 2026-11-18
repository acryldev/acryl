/** Same-origin browser client for a workspace's brief (the Host keeps it; `shared-context/route.ts`). */

const BRIEF_PATH = '/api/acryl-workspace/brief'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface BriefApi {
  read(id: string): Promise<string>
  /** @throws an Error whose message says what to fix. */
  save(id: string, text: string): Promise<void>
}

export function createBriefApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): BriefApi {
  async function answer(response: Response): Promise<{ readonly text: string }> {
    let body: unknown = null
    try { body = await response.json() } catch { body = null }
    const value = body as { ok?: unknown, text?: unknown, message?: unknown } | null
    if (value?.ok === true && typeof value.text === 'string') return { text: value.text }
    throw new Error(typeof value?.message === 'string' ? value.message : `the request failed (HTTP ${String(response.status)})`)
  }
  return {
    read: async id => (await answer(await fetchImpl(`${BRIEF_PATH}?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' }))).text,
    save: async (id, text) => {
      await answer(await fetchImpl(BRIEF_PATH, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, text }) }))
    },
  }
}
