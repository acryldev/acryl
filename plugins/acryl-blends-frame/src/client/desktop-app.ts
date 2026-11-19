/**
 * The app as a desktop product keeps it (specs/049-framework-architecture/app-storage.md in ACRYL): its name, its folder, export, import and start over.
 * A product's window gets `window.acrylBlendsApp` from its preload (acrylblends `plugins/desktop/preload.cjs`, answered by `plugins/desktop/app-page.ts`);
 * a browser tab and an app run with `npm run dev` have none, and the frame then shows no App page. The operation names and shapes are that module's:
 * keep them in step.
 */

/** What the App pages show. `named` is false until the person names the app: the first start asks. */
export interface DesktopAppState {
  readonly id: string
  readonly name: string
  readonly named: boolean
  /** The other apps on this computer; two may share a name, so each says when it was made (an ISO date). */
  readonly others: readonly { readonly id: string; readonly name: string; readonly created: string }[]
  readonly fileManager: 'Finder' | 'Explorer' | 'Files'
  readonly git: boolean
}

export interface DesktopAppSize {
  readonly bytes: number
  readonly files: number
}

type Result = { readonly ok: true; readonly value?: unknown } | { readonly ok: false; readonly message: string }

interface Bridge {
  call(op: string, arg?: unknown): Promise<Result>
}

/** The product's app, read through the bridge: a store of its state (the bar's name and the first start's question follow it) and its operations. */
export class DesktopApp {
  private state: DesktopAppState | undefined
  private readonly listeners = new Set<() => void>()

  constructor(private readonly bridge: Bridge) {}

  private async ask<T>(op: string, arg?: unknown): Promise<T> {
    const result = await this.bridge.call(op, arg)
    if (!result.ok) throw new Error(result.message)
    return result.value as T
  }

  private set(next: DesktopAppState): DesktopAppState {
    this.state = next
    for (const listener of this.listeners) listener()
    return next
  }

  getSnapshot = (): DesktopAppState | undefined => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async refresh(): Promise<DesktopAppState> {
    return this.set(await this.ask<DesktopAppState>('state'))
  }

  async rename(name: string): Promise<DesktopAppState> {
    return this.set(await this.ask<DesktopAppState>('rename', name))
  }

  size(): Promise<DesktopAppSize> {
    return this.ask('size')
  }

  reveal(): Promise<void> {
    return this.ask('reveal')
  }

  /** The save dialog, then the file; `undefined` when the person cancelled. */
  async export(data: boolean): Promise<string | undefined> {
    const answer = await this.ask<{ file?: string }>('export', { data })
    return answer.file
  }

  /** The open dialog, then the new app opens in this window (the page reloads); resolves only when the person cancelled. */
  import(): Promise<void> {
    return this.ask('import')
  }

  /** The app moves to the product's trash folder and a fresh one opens in this window (the page reloads). */
  startOver(): Promise<void> {
    return this.ask('startOver')
  }

  open(id: string): Promise<void> {
    return this.ask('open', id)
  }

  gitLicence(): Promise<void> {
    return this.ask('gitLicence')
  }

  gitSource(): Promise<void> {
    return this.ask('gitSource')
  }
}

/** The product's app when this page is a product's window, else undefined. */
export function desktopApp(scope: { readonly acrylBlendsApp?: unknown } = window as { acrylBlendsApp?: unknown }): DesktopApp | undefined {
  const bridge = scope.acrylBlendsApp as Partial<Bridge> | undefined
  return bridge !== undefined && typeof bridge.call === 'function' ? new DesktopApp(bridge as Bridge) : undefined
}

/** A size as a person reads it: `3.3 MB`, `840 KB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${units[unit] ?? 'TB'}`
}
