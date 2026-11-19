/**
 * What the frame's App pages ask of a desktop product (app-storage.md, "What the person sees"): the first start's "Name your app" and Settings > App
 * (name, size, show the folder, export, import, start over, the other apps, git's licence). The page asks through one IPC channel that `preload.cjs`
 * exposes as `window.acrylBlendsApp`; this module answers, over `AppStorage` and the shell's own ports, so it is tested without Electron.
 *
 * Every answer is a plain result, never a thrown IPC error: the page shows `message` as it is.
 */

import type { AppInstance } from '../instance/index.ts'
import type { AppSize, AppStorage, RegisteredApp } from '../instance/storage.ts'
import type { ProductGit } from './git.ts'

/** The IPC channel; `preload.cjs` names the same string. */
export const APP_PAGE_CHANNEL = 'acrylblends:app'

/** What the page shows. `named` is false until the person names the app (the first start asks). */
export interface AppPageState {
  readonly id: string
  readonly name: string
  readonly named: boolean
  /** The other apps on this computer, to open one instead. */
  readonly others: readonly {
    readonly id: string
    readonly name: string
    readonly created: string
  }[]
  /** What the OS calls its file manager: the Show button's label. */
  readonly fileManager: 'Finder' | 'Explorer' | 'Files'
  /** The product ships git (its licence and source are offered on the page). */
  readonly git: boolean
}

export type AppPageResult =
  | { readonly ok: true; readonly value?: unknown }
  | { readonly ok: false; readonly message: string }

export interface AppPagePorts {
  readonly storage: AppStorage
  /** The id of the app the window shows now. */
  current(): string
  /** A new app's starting files (the first start's seed). */
  readonly seed: (source: string) => void
  /**
   * Stop the frame host, run `next` (which may move the old app's folders), and start the host on the app it returns, reloading the windows. When
   * `next` fails, the app that ran comes back and the failure is the answer.
   */
  switchTo(next: () => AppInstance): Promise<void>
  /** The save dialog for an export (`suggested` is the file name), or undefined when the person cancels. */
  chooseExportFile(suggested: string): Promise<string | undefined>
  /** The open dialog for an import, or undefined when the person cancels. */
  chooseImportFile(): Promise<string | undefined>
  /** Open a file with the OS's own application for it. */
  openPath(path: string): Promise<void>
  /** The app's label changed: the process name and the window titles follow. */
  renamed(app: RegisteredApp): void
  readonly platform: NodeJS.Platform
  readonly git?: ProductGit
}

const fileManagerOf = (platform: NodeJS.Platform): AppPageState['fileManager'] =>
  platform === 'darwin' ? 'Finder' : platform === 'win32' ? 'Explorer' : 'Files'

/** A file name every OS accepts, from the app's label: the export's suggested name. */
export function exportFileName(name: string): string {
  const safe = [...name]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .join('')
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/[. ]+$/u, '')
    .trim()
  return `${safe === '' ? 'app' : safe}.acrylblend`
}

/** The handler of the page's channel: one operation and its argument, one result. */
export function appPageHandler(
  ports: AppPagePorts,
): (op: unknown, arg: unknown) => Promise<AppPageResult> {
  const state = (): AppPageState => {
    const id = ports.current()
    const app = ports.storage.app(id)
    return {
      id,
      name: app.name,
      named: app.named === true,
      others: ports.storage
        .apps()
        .filter((other) => other.id !== id)
        .map((other) => ({ id: other.id, name: other.name, created: other.created })),
      fileManager: fileManagerOf(ports.platform),
      git: ports.git !== undefined,
    }
  }
  const run = async (op: unknown, arg: unknown): Promise<unknown> => {
    switch (op) {
      case 'state':
        return state()
      case 'size':
        return (await ports.storage.size(ports.current())) satisfies AppSize
      case 'rename': {
        if (typeof arg !== 'string') throw new Error('a name is text')
        ports.renamed(ports.storage.rename(ports.current(), arg))
        return state()
      }
      case 'reveal':
        ports.storage.reveal(ports.current())
        return undefined
      case 'export': {
        const data = (arg as { data?: unknown } | undefined)?.data === true
        const id = ports.current()
        const file = await ports.chooseExportFile(exportFileName(ports.storage.app(id).name))
        if (file === undefined) return { cancelled: true }
        ports.storage.export(id, file, { data })
        return { file }
      }
      case 'import': {
        const file = await ports.chooseImportFile()
        if (file === undefined) return { cancelled: true }
        // Made beside the running app, which keeps running until the new one is ready to open.
        const made = ports.storage.import(file)
        await ports.switchTo(() => ports.storage.open(made.id))
        return undefined
      }
      case 'startOver': {
        const id = ports.current()
        await ports.switchTo(() => ports.storage.open(ports.storage.reset(id, ports.seed).id))
        return undefined
      }
      case 'open': {
        if (typeof arg !== 'string' || !ports.storage.apps().some((app) => app.id === arg))
          throw new Error('there is no such app on this computer')
        if (arg !== ports.current()) await ports.switchTo(() => ports.storage.open(arg))
        return undefined
      }
      case 'gitLicence':
      case 'gitSource': {
        if (ports.git === undefined) throw new Error('this app ships no git of its own')
        await ports.openPath(op === 'gitLicence' ? ports.git.licence : ports.git.source)
        return undefined
      }
      default:
        throw new Error(`the app page cannot ${String(op)}`)
    }
  }
  return async (op, arg) => {
    try {
      return { ok: true, value: await run(op, arg) }
    } catch (cause) {
      return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
    }
  }
}
