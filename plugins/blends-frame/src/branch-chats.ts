/**
 * Which branch each chat was opened on, and which chats are open, kept in the app's ACRYL home (`<home>/frame/branch-chats.json`), keyed by the
 * app's folder. The frame reads it to list each branch's own chats; without it every chat would look like the checked-out branch's. A chat is open
 * while it has a tab or is on screen (docs/design/blends-frame-mockup.html: the left panel lists only what is open); the rest are closed and wait in
 * the chat's History. The set of open chats is absent until the frame first decides it (an app with many chats opens with only the latest per
 * branch open). Writes are serialized and atomic, so a frame and its page never read half a file.
 */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** The file in the app's ACRYL home (from the `appInstance` service: this package never looks up a home itself). */
export function branchChatsFile(appHome: string): string {
  return join(appHome, 'frame', 'branch-chats.json')
}

/** A chat id to its branch, by the app folder the frame serves. */
type Roots = Record<string, Record<string, string>>

/** The chats that are open, by the app folder; an app folder without an entry has not decided yet. */
type OpenSets = Record<string, string[]>

interface Contents {
  readonly roots: Roots
  readonly open: OpenSets
}

/** What the frame reads for an app folder. */
export interface BranchChatsRecord {
  readonly chats: Record<string, string>
  /** The open chats; null until they were first decided. */
  readonly open: string[] | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The file's words, keeping only what is a map of chat id to a branch name and the lists of open chat ids; anything else reads as nothing recorded. */
export function parseBranchChatsFile(text: string): Contents {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { roots: {}, open: {} }
  }
  if (!isRecord(value)) return { roots: {}, open: {} }
  const roots: Roots = {}
  if (isRecord(value.roots)) {
    for (const [root, chats] of Object.entries(value.roots)) {
      if (!isRecord(chats)) continue
      const kept: Record<string, string> = {}
      for (const [id, branch] of Object.entries(chats)) {
        if (typeof branch === 'string' && branch !== '') kept[id] = branch
      }
      roots[root] = kept
    }
  }
  const open: OpenSets = {}
  if (isRecord(value.open)) {
    for (const [root, ids] of Object.entries(value.open)) {
      if (Array.isArray(ids)) open[root] = ids.filter((id): id is string => typeof id === 'string' && id !== '')
    }
  }
  return { roots, open }
}

export interface BranchChatsStore {
  /** What is recorded for an app folder; empty when nothing was or the file is unreadable. @throws when the file cannot be read for another reason. */
  read(root: string): Promise<BranchChatsRecord>
  /** Record a chat's branch; an existing record is kept (a chat stays where it was opened). */
  assign(root: string, id: string, branch: string): Promise<void>
  /** Open or close one chat. Before the open chats were first decided, this decides them: the one chat, or none. */
  setOpen(root: string, id: string, open: boolean): Promise<void>
  /** Decide which chats are open, once: a set that already exists is kept (another page decided first). @returns whether this call decided it. */
  initOpen(root: string, ids: readonly string[]): Promise<boolean>
}

export function createBranchChatsStore(path: string): BranchChatsStore {
  // One file: reads and read-modify-writes take turns, so a write never erases another's entry.
  let tail: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work)
    tail = run.catch(() => {})
    return run
  }
  const load = async (): Promise<Contents> => {
    try {
      return parseBranchChatsFile(await readFile(path, 'utf8'))
    } catch (cause) {
      if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT') return { roots: {}, open: {} }
      throw cause
    }
  }
  const save = async (contents: Contents): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temp, `${JSON.stringify(contents)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temp, path)
  }
  return {
    read(root) {
      return exclusive(async () => {
        const contents = await load()
        return { chats: { ...contents.roots[root] }, open: contents.open[root] === undefined ? null : [...contents.open[root]] }
      })
    },
    assign(root, id, branch) {
      return exclusive(async () => {
        const contents = await load()
        const chats = contents.roots[root] ?? {}
        if (chats[id] !== undefined) return
        await save({ ...contents, roots: { ...contents.roots, [root]: { ...chats, [id]: branch } } })
      })
    },
    setOpen(root, id, open) {
      return exclusive(async () => {
        const contents = await load()
        const current = contents.open[root] ?? []
        const next = open ? (current.includes(id) ? current : [...current, id]) : current.filter(entry => entry !== id)
        if (contents.open[root] !== undefined && next.length === current.length && next.every((entry, index) => entry === current[index])) return
        await save({ ...contents, open: { ...contents.open, [root]: next } })
      })
    },
    initOpen(root, ids) {
      return exclusive(async () => {
        const contents = await load()
        if (contents.open[root] !== undefined) return false
        await save({ ...contents, open: { ...contents.open, [root]: [...new Set(ids)] } })
        return true
      })
    },
  }
}
