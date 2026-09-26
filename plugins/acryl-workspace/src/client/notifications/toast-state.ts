/** Short-lived notices ("Claude finished") with a way back to the tab they are about. */

export interface Toast {
  readonly id: number
  readonly text: string
  /** Where to go when the notice is opened: a worktree's tab group and one of its tabs. */
  readonly target: { readonly group: string; readonly tabId: string }
}

/** How long a notice stays before it goes away by itself. */
export const TOAST_LIFETIME_MS = 12_000
/** The newest notices kept on screen; older ones make room. */
export const MAX_TOASTS = 4

/** @returns the words for an agent whose process ended. */
export function describeFinish(title: string, exitCode: number | null): string {
  if (exitCode === null || exitCode === 0) return `${title} finished`
  return `${title} stopped (exit code ${String(exitCode)})`
}

export class ToastState {
  private toasts: readonly Toast[] = []
  private nextId = 1
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): readonly Toast[] => this.toasts

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the new notice's id. */
  push(text: string, target: Toast['target']): number {
    const toast: Toast = { id: this.nextId, text, target }
    this.nextId += 1
    this.toasts = [...this.toasts, toast].slice(-MAX_TOASTS)
    this.emit()
    return toast.id
  }

  dismiss(id: number): void {
    if (!this.toasts.some(toast => toast.id === id)) return
    this.toasts = this.toasts.filter(toast => toast.id !== id)
    this.emit()
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
