/**
 * The Host's half of "the canvas shows what the files say": it loads the app's code again, and tells the page when the new code is up.
 *
 * What it does, in order, when the app's files change (a version restored, a branch switched, the chat or a PTY agent or an editor writing `src/`):
 * the generation (./app-generation.ts) is raised; each of the app's rows (its routes, its composed plugins) imports its module again under it, which
 * surfaces a syntax error or a missing import before anything is stopped; only then are the rows stopped and started from the new code. A row that
 * does not start fails the whole reload: the last working generation comes back and its rows are started again, so the canvas keeps showing the last
 * good app, and the error is kept for the frame to show (one line in the bar) until a reload succeeds.
 *
 * The rows run on the Cordis loader (`ctx.loader`), so the terminals, agents and chats around the app are untouched: only the app's own fibers restart.
 */

import { existsSync, watch } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppReloadView } from './contract.ts'
import type { AppGeneration } from './app-generation.ts'

/** How long a change is waited on before it is acted on: a version restore or an agent's turn writes many files in a burst. */
export const RELOAD_DEBOUNCE_MS = 300

/** How long after a watch starts its first events are taken for the system replaying the past (macOS FSEvents), not for changes. */
const REPLAY_WINDOW_MS = 250

/** One of the app's loader rows, as the reloader drives it. */
export interface AppRow {
  readonly id: string
  /** Import the row's module under the current generation; rejects with the load error (a syntax error, a missing import). */
  load(): Promise<void>
  /** Stop the row and start it from its module as it loads now; rejects when it does not run. */
  restart(): Promise<void>
}

export interface AppReloaderDeps {
  readonly generation: AppGeneration
  /** The rows to restart, in the order they start. Read at each reload, so a row switched off meanwhile is left out. */
  readonly rows: () => readonly AppRow[]
  /** The app's folder (its real path): a failure's stack is read for the file of the app it points at. */
  readonly appRoot?: string
  readonly report?: (cause: unknown) => void
}

/** The longest the error line is, in characters: a loader error can carry a whole stack. */
const ERROR_LIMIT = 300

/** The line a person reads for a failed load: where (`src/board.ts:12`, when the stack points into the app's `src/`) and what, cut short. */
export function describeError(cause: unknown, appRoot?: string): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  const first = message.split('\n').map(line => line.trim()).find(line => line !== '') ?? 'the code could not be loaded'
  const where = appRoot === undefined || !(cause instanceof Error) ? null : positionIn(cause.stack ?? '', appRoot)
  const line = where === null ? first : `${where} ${first}`
  return line.length > ERROR_LIMIT ? `${line.slice(0, ERROR_LIMIT - 1)}…` : line
}

/** `src/board.ts:12` for the first frame of `stack` inside the app's `src/` (a path or a file URL, with or without a generation query). */
function positionIn(stack: string, appRoot: string): string | null {
  const root = appRoot.replace(/[\\/]+$/u, '')
  for (const prefix of [`${pathToFileURL(root).href}/`, `${root}/`]) {
    const start = stack.indexOf(`${prefix}src/`)
    if (start < 0) continue
    const found = /^(src\/[^\s:)?]+)(?:\?[^\s:)]*)?:(\d+)/u.exec(stack.slice(start + prefix.length))
    if (found !== null) return `${found[1] ?? ''}:${found[2] ?? ''}`
  }
  return null
}

export class AppReloader {
  private seq = 0
  private shown = 0
  private error: string | null = null
  /** The number the last attempt took: every attempt gets its own, so a failed one is never loaded again. */
  private attempt = 0
  /** The last generation whose rows run. */
  private good = 0
  private running: Promise<void> | undefined
  private again = false
  private readonly waiters = new Set<() => void>()

  constructor(private readonly deps: AppReloaderDeps) {}

  view(): AppReloadView {
    return { seq: this.seq, generation: this.shown, error: this.error }
  }

  /** The view once it differs from the one the caller has (`after` is its `seq`), or as it is when `timeoutMs` has passed. */
  wait(after: number, timeoutMs: number): Promise<AppReloadView> {
    if (after !== this.seq) return Promise.resolve(this.view())
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer)
        this.waiters.delete(done)
        resolve(this.view())
      }
      const timer = setTimeout(done, timeoutMs)
      this.waiters.add(done)
    })
  }

  /** Load the app's code again. A call made while a reload runs makes one more run after it (the files changed again), never two at once. */
  reload(): Promise<void> {
    this.again = true
    this.running ??= this.drain().finally(() => { this.running = undefined })
    return this.running
  }

  private async drain(): Promise<void> {
    while (this.again) {
      this.again = false
      await this.once()
    }
  }

  private async once(): Promise<void> {
    const rows = this.deps.rows()
    if (rows.length === 0) return
    const next = ++this.attempt
    this.deps.generation.set(next)
    try {
      // Every row imports first: a broken file fails here, with the running app untouched.
      await Promise.all(rows.map(row => row.load()))
    } catch (cause) {
      this.deps.report?.(cause)
      this.deps.generation.set(this.good)
      this.change(this.shown, describeError(cause, this.deps.appRoot))
      return
    }
    try {
      for (const row of rows) await row.restart()
    } catch (cause) {
      this.deps.report?.(cause)
      await this.recover(rows)
      this.change(this.shown, describeError(cause, this.deps.appRoot))
      return
    }
    this.good = next
    this.change(this.shown + 1, null)
  }

  /** The new code did not load or start: the last working generation is what the rows run again (its modules are still loaded). */
  private async recover(rows: readonly AppRow[]): Promise<void> {
    this.deps.generation.set(this.good)
    for (const row of rows) {
      try {
        await row.restart()
      } catch (cause) {
        this.deps.report?.(cause)
      }
    }
  }

  private change(generation: number, error: string | null): void {
    if (generation === this.shown && error === this.error) return
    this.shown = generation
    this.error = error
    this.seq += 1
    for (const done of [...this.waiters]) done()
  }
}

/** A file whose change is no change of the app: an editor's swap or backup file, a hidden file or folder. */
export function isNoise(filename: string): boolean {
  const parts = filename.split(/[\\/]/u)
  return parts.some(part => part.startsWith('.')) || /(~|\.sw[a-p]|\.tmp)$/u.test(filename)
}

/**
 * Calls `onChange` once, `debounceMs` after the last change of a file under `dir` (recursively, or only the `only` files at its top), whoever made it,
 * with the paths that changed in the burst (`dir` itself when the system did not say which file). Returns the function that stops watching; a folder
 * that does not exist is not watched (an app without `src/` has no code to load again).
 */
export function watchFolder(
  dir: string,
  onChange: (changed: readonly string[]) => void,
  options: { readonly debounceMs?: number; readonly report?: (cause: unknown) => void; readonly only?: readonly string[] } = {},
): () => void {
  if (!existsSync(dir)) return () => {}
  const debounceMs = options.debounceMs ?? RELOAD_DEBOUNCE_MS
  let timer: NodeJS.Timeout | undefined
  const changed = new Set<string>()
  const startedAt = Date.now()
  // `only`: the files at the folder's top that count (the app's blend.yaml in its root); the folder is then not watched below its top.
  const only = options.only
  const watcher = watch(dir, { recursive: only === undefined }, (_event, filename) => {
    // macOS replays the folder's latest changes (a scaffold written a moment ago) as the watch starts: those are the code the host just loaded, not a change.
    if (Date.now() - startedAt < REPLAY_WINDOW_MS) return
    if (only !== undefined && (typeof filename !== 'string' || !only.includes(filename))) return
    if (typeof filename === 'string' && isNoise(filename)) return
    changed.add(typeof filename === 'string' ? join(dir, filename) : dir)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const burst = [...changed]
      changed.clear()
      onChange(burst)
    }, debounceMs)
  })
  watcher.on('error', (cause) => { options.report?.(cause) })
  return () => {
    clearTimeout(timer)
    watcher.close()
  }
}

/** {@link watchFolder} over several folders, one debounce per folder: a burst across two folders reloads once, as a reload already running takes the next one in. */
export function watchFolders(dirs: readonly string[], onChange: (changed: readonly string[]) => void, options: { readonly debounceMs?: number; readonly report?: (cause: unknown) => void } = {}): () => void {
  const stops = dirs.map(dir => watchFolder(dir, onChange, options))
  return () => { for (const stop of stops) stop() }
}
