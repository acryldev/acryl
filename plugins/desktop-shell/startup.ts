/**
 * What the window does before and around its start, as small rules without Electron, so they are tested without a window (found on a Windows 11 report,
 * 2026-11: "I updated ACRYL Control Center and it refuses to start when clicking the .exe", with nothing on screen and nothing on disk to say why):
 *   - the start's own log (`desktop-YYYY-MM-DD.log` in the product's logs folder), from the first line, mirroring what the main process prints;
 *   - a copy that meets a locked file is tried again, and when it cannot be done it is said in words, never as an exit with nothing shown;
 *   - the small window shown while the update's copy runs.
 */
import { format } from 'node:util'
import { appendHostLog } from './host-supervisor.ts'

export interface StartupLog {
  /** One timestamped line; kept in memory until `attach` says where the logs folder is. */
  line(text: string): void
  /** The logs folder is known: what was said so far is written, and every line from now on. */
  attach(dir: string): void
}

/** Never throws (a log must not stop the app). `echo` is where the line also goes (the terminal, when there is one). */
export function createStartupLog(
  now: () => Date = () => new Date(),
  echo: (text: string) => void = () => {},
): StartupLog {
  let dir: string | undefined
  let pending: string[] = []
  return {
    line(text) {
      const stamped = `${now().toISOString()} ${text}\n`
      echo(stamped)
      if (dir === undefined) pending.push(stamped)
      else appendHostLog(dir, stamped, now(), 'desktop')
    },
    attach(folder) {
      dir = folder
      for (const stamped of pending) appendHostLog(folder, stamped, now(), 'desktop')
      pending = []
    },
  }
}

type Level = 'log' | 'info' | 'warn' | 'error'
const LEVELS: readonly Level[] = ['log', 'info', 'warn', 'error']

/** The console's output also goes into the log: every `desktop: ...` line the shell prints is kept without touching each call. Returns the way back. */
export function captureConsole(
  target: Pick<Console, Level>,
  log: Pick<StartupLog, 'line'>,
): () => void {
  const originals = new Map<Level, (...args: unknown[]) => void>()
  for (const level of LEVELS) {
    const original = target[level].bind(target) as (...args: unknown[]) => void
    originals.set(level, target[level] as (...args: unknown[]) => void)
    target[level] = (...args: unknown[]) => {
      try {
        log.line(
          level === 'log' || level === 'info' ? format(...args) : `${level}: ${format(...args)}`,
        )
      } catch {
        // The log never stops the app.
      }
      original(...args)
    }
  }
  return () => {
    for (const level of LEVELS) target[level] = originals.get(level) as never
  }
}

/**
 * Whether the last window closing ends the app. Only once the app's own window has been opened: the update's window closes before it does, and the host takes
 * seconds to serve, so a window count of zero is the normal state of a start (a Windows walk found the app ending itself right after its update).
 */
export const endsWithLastWindow = (appWindowOpened: boolean): boolean => appWindowOpened

const LOCKED = new Set(['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENOTEMPTY'])

/** A file another program holds (the old version still closing, a virus scanner, a sync client): Windows answers EBUSY or EPERM. */
export const isLockedFileError = (cause: unknown): boolean =>
  typeof cause === 'object' && cause !== null && LOCKED.has((cause as { code?: string }).code ?? '')

/** Run `step`; a locked file is tried again after `delayMs`, `attempts` times in all. Any other error, and the last locked one, is thrown. */
export async function retryLocked<T>(
  step: () => Promise<T>,
  options: {
    readonly attempts?: number
    readonly delayMs?: number
    readonly sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const delayMs = options.delayMs ?? 1500
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await step()
    } catch (cause) {
      if (attempt >= attempts || !isLockedFileError(cause)) throw cause
      await sleep(delayMs)
    }
  }
}

/** How long the update's copy may take before the person is told and the old version starts: it takes seconds; a file another program holds can make it wait without an error. */
export const COPY_DEADLINE_MS = 60_000

const TIMED_OUT = 'UPDATE_TIMEOUT'

/** `work`, or an error with code UPDATE_TIMEOUT after `ms`; `work` keeps running (a copy cannot be cancelled) and its later failure is not reported twice. */
export function waitAtMost<T>(work: Promise<T>, ms: number): Promise<T> {
  work.catch(() => undefined)
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error(`did not finish in ${String(Math.round(ms / 1000))} seconds`), {
            code: TIMED_OUT,
          }),
        ),
      ms,
    )
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause)
      },
    )
  })
}

/** What a person is told when the update could not be copied: which file, why in words, what happens next, where the details are. */
export function updateFailureText(
  product: string,
  cause: unknown,
  logs: string,
): { readonly message: string; readonly detail: string } {
  const error = cause as { code?: string; path?: string; message?: string }
  const file = typeof error?.path === 'string' ? ` (${error.path})` : ''
  const why =
    isLockedFileError(cause) || error?.code === TIMED_OUT
      ? `A file is in use by another program${file}: usually ${product} still closing, or a virus scanner. Close every ${product} window and process (Task Manager on Windows), then open it again and the update runs again.`
      : `${error?.message ?? String(cause)}${file}`
  return {
    message: `${product} could not finish its update`,
    detail: `${why}\n\nIt starts now with what is there: the old version, with the files that were already copied. Nothing of yours is changed.\n\nThe details are in ${logs}`,
  }
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')

/** The page of the window shown while the update copies: the product's name and one line, system fonts, light and dark. */
export function updateWindowUrl(product: string): string {
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(product)}</title><style>
html,body{height:100%;margin:0}body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:15px system-ui,sans-serif;background:#fff;color:#1b1b1f;-webkit-user-select:none;user-select:none}
@media(prefers-color-scheme:dark){body{background:#17171a;color:#ececf1}}
.bar{width:220px;height:4px;border-radius:2px;background:rgba(127,127,127,.25);overflow:hidden}.bar i{display:block;width:40%;height:100%;border-radius:2px;background:#6d5efc;animation:go 1.2s ease-in-out infinite alternate}
@keyframes go{from{margin-left:0}to{margin-left:60%}}small{opacity:.65}</style>
<div>Updating ${escapeHtml(product)}...</div><div class="bar"><i></i></div><small>This takes a moment, once.</small>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}
