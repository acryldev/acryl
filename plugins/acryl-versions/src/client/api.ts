/** Same-origin browser client for the Versions routes. Every failure becomes an Error fit to show a person. */

import {
  DEFAULT_LOG_LIMIT,
  VERSIONS_LOG_PATH,
  VERSIONS_RESTORE_PATH,
  VERSIONS_SAVE_PATH,
  VERSIONS_SHARE_PATH,
  VERSIONS_SHARE_PLAN_PATH,
  parseSharePlan,
  type VersionsCommitView,
  type VersionsEntry,
  type VersionsLogView,
  type VersionsRestoreView,
  type VersionsSaveView,
  type VersionsSharePlan,
  type VersionsShareView,
} from '../contract.ts'

export interface VersionsApi {
  /** The branch's versions, newest first. @throws an Error whose message is fit to show the user. */
  log(path: string, limit?: number): Promise<VersionsLogView>
  save(path: string, message: string): Promise<VersionsSaveView>
  /** Bring a version back as a new commit; `message` names that commit (else the Host's "Restore <id>"). */
  restore(path: string, hash: string, message?: string): Promise<VersionsRestoreView>
  /** What a share would send, without sending anything. */
  planShare(path: string): Promise<VersionsSharePlan>
  /** Send the plan the person confirmed; the Host sends nothing when it changed meanwhile. */
  share(path: string, confirmed: VersionsSharePlan): Promise<VersionsShareView>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const UNEXPECTED_ANSWER = 'The Host sent an unexpected versions answer.'
const UNREACHABLE = 'The Host could not be reached.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseEntry(value: unknown): VersionsEntry | undefined {
  if (!isRecord(value) || typeof value.hash !== 'string' || typeof value.short !== 'string'
    || typeof value.subject !== 'string' || typeof value.author !== 'string' || typeof value.at !== 'string') {
    return undefined
  }
  return { hash: value.hash, short: value.short, subject: value.subject, author: value.author, at: value.at }
}

function parseCommit(value: unknown): VersionsCommitView | undefined {
  if (!isRecord(value) || typeof value.hash !== 'string' || typeof value.short !== 'string' || typeof value.subject !== 'string') {
    return undefined
  }
  return { hash: value.hash, short: value.short, subject: value.subject }
}

function parseLog(value: unknown): VersionsLogView | undefined {
  if (!isRecord(value) || typeof value.path !== 'string'
    || (value.branch !== null && typeof value.branch !== 'string')
    || (value.upstream !== null && typeof value.upstream !== 'string')
    || typeof value.ahead !== 'number' || typeof value.behind !== 'number'
    || !Array.isArray(value.entries)) {
    return undefined
  }
  const entries: VersionsEntry[] = []
  for (const raw of value.entries) {
    const entry = parseEntry(raw)
    if (entry === undefined) return undefined
    entries.push(entry)
  }
  return {
    path: value.path,
    branch: value.branch,
    upstream: value.upstream,
    ahead: value.ahead,
    behind: value.behind,
    entries,
  }
}

function parseSave(value: unknown): VersionsSaveView | undefined {
  if (!isRecord(value)) return undefined
  const entry = parseEntry(value.entry)
  const commit = parseCommit(value.commit)
  return entry === undefined || commit === undefined ? undefined : { entry, commit }
}

function parseRestore(value: unknown): VersionsRestoreView | undefined {
  if (!isRecord(value) || typeof value.restored !== 'string') return undefined
  const commit = parseCommit(value.commit)
  return commit === undefined ? undefined : { restored: value.restored, commit }
}

function parseShare(value: unknown): VersionsShareView | undefined {
  if (!isRecord(value) || value.pushed !== true || typeof value.upstream !== 'string') return undefined
  return { pushed: true, upstream: value.upstream }
}

/** The Host's own reason, or a plain HTTP line when the answer was not one of its JSON errors. */
function failureMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value.error === 'string' && value.error !== '') return value.error
  return `The versions request failed (HTTP ${String(status)}).`
}

/**
 * @param fetchImpl - injectable for tests; defaults to the page's fetch.
 */
export function createVersionsApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)): VersionsApi {
  const send = async (input: string, init: RequestInit): Promise<Response> => {
    try {
      return await fetchImpl(input, { credentials: 'same-origin', ...init })
    } catch {
      throw new Error(UNREACHABLE)
    }
  }
  const answer = async <T>(response: Response, parse: (value: unknown) => T | undefined): Promise<T> => {
    let value: unknown
    try {
      value = await response.json()
    } catch {
      value = undefined
    }
    if (!response.ok) throw new Error(failureMessage(value, response.status))
    const parsed = parse(value)
    if (parsed === undefined) throw new Error(UNEXPECTED_ANSWER)
    return parsed
  }
  const post = async <T>(path: string, body: object, parse: (value: unknown) => T | undefined): Promise<T> => {
    const response = await send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
    return answer(response, parse)
  }
  return {
    async log(path, limit = DEFAULT_LOG_LIMIT) {
      const query = new URLSearchParams({ path, limit: String(limit) })
      const response = await send(`${VERSIONS_LOG_PATH}?${query.toString()}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
      })
      return answer(response, parseLog)
    },
    save: (path, message) => post(VERSIONS_SAVE_PATH, { path, message }, parseSave),
    restore: (path, hash, message) => post(VERSIONS_RESTORE_PATH, message === undefined ? { path, hash } : { path, hash, message }, parseRestore),
    planShare: path => post(VERSIONS_SHARE_PLAN_PATH, { path }, parseSharePlan),
    share: (path, confirmed) => post(VERSIONS_SHARE_PATH, { path, confirmed }, parseShare),
  }
}
