/**
 * The in-page driver: takes one {@link UiRequest} and does it, under the rules.
 *
 * It owns the ref table, the kill switch, the yield-to-the-user rule and the "driving" activity the indicator
 * shows. It touches only the document it is given, never another window and never the OS.
 */

import { UiControlError, MUTATING_OPS, type UiRequest, type UiResult } from '../../contract.ts'
import { click, pressKey, scroll, selectOption, typeText, wait, type ActionEnvironment } from './actions.ts'
import { RefTable } from './ref-table.ts'
import { SnapshotBuilder } from './snapshot.ts'

/** After the user touches the page, agent actions wait this long, so the user always wins. */
const YIELD_MS = 400
const MAX_YIELD_MS = 2000

export interface DriverActivity {
  /** True from the moment a call starts until it ends. */
  readonly busy: boolean
  /** What the agent is doing, for the indicator ("click", "type", ...). */
  readonly doing: string
  /** True after the user pressed the kill switch. */
  readonly killed: boolean
}

export interface UiDriverOptions {
  readonly document: () => Document
  /** Milliseconds since the user last used the page (mouse, keyboard); Infinity when never. */
  readonly msSinceUserInput?: () => number
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

function realSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = (): void => { clearTimeout(timer); reject(signal.reason) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class UiDriver {
  private readonly refs = new RefTable()
  private readonly snapshots: SnapshotBuilder
  private readonly listeners = new Set<(activity: DriverActivity) => void>()
  private readonly env: ActionEnvironment
  private readonly stopAll = new Set<AbortController>()
  private killedFlag = false
  private disposed = false
  private busyCount = 0
  private doing = ''
  private current: DriverActivity = { busy: false, doing: '', killed: false }

  constructor(private readonly options: UiDriverOptions) {
    this.snapshots = new SnapshotBuilder(this.refs, () => options.document().body)
    this.env = { refs: this.refs, document: options.document, sleep: options.sleep ?? realSleep }
  }

  /** The current activity; the same object until something changes, as a store snapshot must be. */
  get activity(): DriverActivity {
    return this.current
  }

  subscribe(listener: (activity: DriverActivity) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The user pressed the kill switch: pending calls settle as `killed` and new ones are refused. */
  kill(): void {
    this.killedFlag = true
    for (const controller of [...this.stopAll]) controller.abort(new UiControlError('killed', 'the user stopped the agent'))
    this.refs.clear()
    this.snapshots.clear()
    this.emit()
  }

  /** The user allowed the agent to drive again. */
  resume(): void {
    this.killedFlag = false
    this.emit()
  }

  /** The driver goes away: pending calls settle as `unloaded`; refs are gone. */
  dispose(): void {
    this.disposed = true
    for (const controller of [...this.stopAll]) controller.abort(new UiControlError('unloaded', 'the driver was unloaded'))
    this.refs.clear()
    this.snapshots.clear()
    this.listeners.clear()
  }

  /** @param signal - the Host cancelled the call. @throws UiControlError. */
  async handle(request: UiRequest, signal?: AbortSignal): Promise<UiResult> {
    if (this.disposed) throw new UiControlError('unloaded', 'the driver was unloaded')
    if (this.killedFlag) throw new UiControlError('killed', 'the user stopped the agent; it cannot drive until they allow it again')
    const controller = new AbortController()
    this.stopAll.add(controller)
    const onCancel = (): void => { controller.abort(new UiControlError('aborted', 'the call was cancelled')) }
    signal?.addEventListener('abort', onCancel, { once: true })
    this.busyCount += 1
    this.doing = request.op
    this.emit()
    try {
      if (MUTATING_OPS.includes(request.op)) await this.yieldToUser(controller.signal)
      if (controller.signal.aborted) throw controller.signal.reason
      return await this.run(request, controller.signal)
    } catch (cause) {
      if (cause instanceof UiControlError) throw cause
      if (controller.signal.aborted && controller.signal.reason instanceof UiControlError) throw controller.signal.reason
      throw new UiControlError('not-actionable', cause instanceof Error ? cause.message : 'the action failed')
    } finally {
      signal?.removeEventListener('abort', onCancel)
      this.stopAll.delete(controller)
      this.busyCount -= 1
      if (this.busyCount === 0) this.doing = ''
      this.emit()
    }
  }

  private async run(request: UiRequest, signal: AbortSignal): Promise<UiResult> {
    switch (request.op) {
      case 'snapshot': return this.snapshots.snapshot({ ...(request.cursor === undefined ? {} : { cursor: request.cursor }), ...(request.maxNodes === undefined ? {} : { maxNodes: request.maxNodes }) })
      case 'click': return click(this.env, request)
      case 'type': return typeText(this.env, request)
      case 'select': return selectOption(this.env, request)
      case 'press': return pressKey(this.env, request)
      case 'scroll': return scroll(this.env, request)
      case 'wait': return wait(this.env, request, signal)
    }
  }

  private async yieldToUser(signal: AbortSignal): Promise<void> {
    const since = this.options.msSinceUserInput
    if (since === undefined) return
    let waited = 0
    while (since() < YIELD_MS && waited < MAX_YIELD_MS) {
      await this.env.sleep(100, signal)
      waited += 100
    }
  }

  private emit(): void {
    const next: DriverActivity = { busy: this.busyCount > 0, doing: this.doing, killed: this.killedFlag }
    if (next.busy === this.current.busy && next.doing === this.current.doing && next.killed === this.current.killed) return
    this.current = next
    const activity = next
    for (const listener of [...this.listeners]) listener(activity)
  }
}
