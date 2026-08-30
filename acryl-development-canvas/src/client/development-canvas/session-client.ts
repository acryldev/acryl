import type { CanvasPtyCommandId, CanvasPtyView } from '../../canvas-pty-contract.ts'
import type { CanvasPtyApi } from './pty-api.ts'

/**
 * Client-activation owner for every Host PTY opened by one Canvas contribution.
 * The Cordis declaration effect disposes this module before its slot disappears.
 */
export class CanvasPtyClient implements CanvasPtyApi {
  private readonly sessions = new Set<string>()
  private readonly starting = new Set<Promise<void>>()
  private disposed = false
  private disposePromise: Promise<void> | undefined

  constructor(private readonly api: CanvasPtyApi) {}

  async start(commandId: CanvasPtyCommandId): Promise<CanvasPtyView> {
    if (this.disposed) throw new Error('Canvas PTY client is disposed')
    let settle!: () => void
    const completion = new Promise<void>(resolve => { settle = resolve })
    this.starting.add(completion)
    try {
      const view = await this.api.start(commandId)
      if (this.disposed) {
        await this.api.close(view.id).catch(() => {})
        throw new Error('Canvas PTY client is disposed')
      }
      this.sessions.add(view.id)
      return view
    } finally {
      this.starting.delete(completion)
      settle()
    }
  }

  read(id: string): Promise<CanvasPtyView> {
    return this.api.read(id)
  }

  write(id: string, data: string): Promise<void> {
    return this.api.write(id, data)
  }

  resize(id: string, cols: number, rows: number): Promise<void> {
    return this.api.resize(id, cols, rows)
  }

  async close(id: string): Promise<void> {
    await this.api.close(id)
    this.sessions.delete(id)
  }

  /** Close all sessions, including starts that settle while disposal is active. */
  dispose(): Promise<void> {
    this.disposed = true
    return this.disposePromise ??= this.settleAndClose()
  }

  private async settleAndClose(): Promise<void> {
    await Promise.allSettled([...this.starting])
    const ids = [...this.sessions]
    this.sessions.clear()
    await Promise.all(ids.map(async id => this.api.close(id).catch(() => {})))
  }
}
