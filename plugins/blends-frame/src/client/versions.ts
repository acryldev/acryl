/**
 * The versions the left panel lists, through `acryl-versions`: the calls it makes, how a version is numbered, how its time reads, and which
 * versions are shared (also on another branch or the remote, which the frame's Host answers).
 */

import type { VersionsEntry, VersionsLogView } from 'acryl-versions'
import { FRAME_VERSIONS_SHARED_PATH, parseSharedVersions } from '../contract.ts'

export interface VersionsPort {
  log(path: string): Promise<VersionsLogView>
  save(path: string, message: string): Promise<unknown>
  /** Put the app back to a version as a new version on top (history is never rewritten), then show it: the frame state read again, the app page reloaded. */
  restore(path: string, hash: string, message: string): Promise<unknown>
  /** The versions that are also on another local branch or a remote-tracking branch. */
  shared(hashes: readonly string[]): Promise<readonly string[]>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface SharedVersionsApi {
  /** @throws when the Host does not answer the shared check. */
  shared(hashes: readonly string[]): Promise<readonly string[]>
}

export function createSharedVersionsApi(fetcher: FetchLike = (input, init) => fetch(input, init)): SharedVersionsApi {
  return {
    async shared(hashes) {
      const response = await fetcher(FRAME_VERSIONS_SHARED_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ hashes }),
      })
      if (!response.ok) throw new Error(`The shared versions could not be read (HTTP ${String(response.status)}).`)
      return parseSharedVersions(await response.json())
    },
  }
}

/** "v7" for the newest of seven versions: the number counts from the first. */
export function versionNumber(entries: readonly VersionsEntry[], index: number): number {
  return entries.length - index
}

/** "saved" when nothing changed since the last version, else how many files did; nothing outside a repository. */
export function savedLabel(unsaved: number | undefined): string | undefined {
  if (unsaved === undefined) return undefined
  return unsaved === 0 ? 'saved' : `${String(unsaved)} unsaved`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** The versions list's short time: "now", "2 min", "2 h", the weekday within a week ("Sun"), then days ("9 d"). */
export function shortTime(at: string, now: number = Date.now()): string {
  const time = Date.parse(at)
  if (!Number.isFinite(time)) return ''
  const seconds = Math.max(0, Math.floor((now - time) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return WEEKDAYS[new Date(time).getDay()] ?? ''
  return `${String(days)} d`
}

/** A chat's "last active" in the same short form as a version's time; empty when DSH did not say. */
export function chatTime(updatedAt: number | undefined, now: number = Date.now()): string {
  return updatedAt === undefined ? '' : shortTime(new Date(updatedAt).toISOString(), now)
}

/** The new version's name when the app goes back to one: "Back to v2 · Due dates". */
export function backToMessage(number: number, subject: string): string {
  return `Back to v${String(number)} · ${subject}`
}

/** The save point made first when files are unsaved. */
export function saveBeforeBackMessage(number: number): string {
  return `Save before going back to v${String(number)}`
}

/** What the confirmation says; with unsaved files (or an uncounted tree) it says a save point comes first. */
export function backText(number: number, subject: string, unsaved: number | undefined): string {
  if (unsaved === undefined) return `The unsaved files could not be counted. Save a point first, then go back to v${String(number)} · ${subject}.`
  if (unsaved > 0) return `${String(unsaved)} unsaved ${unsaved === 1 ? 'change' : 'changes'}. Save a point first, then go back to v${String(number)} · ${subject}.`
  return `Go back to v${String(number)} · ${subject}? A new version records it, so every version stays.`
}
