/**
 * The in-page driver: takes one {@link UiRequest} and does it, under the rules.
 *
 * It owns the ref table, the kill switch, the yield-to-the-user rule and the "driving" activity the indicator
 * shows. It touches only the document it is given, never another window and never the OS.
 */

import { UiControlError, MUTATING_OPS, type UiActionResult, type UiRequest, type UiResult } from '../protocol.ts'
import { click, pressKey, scroll, selectOption, typeText, wait, type ActionEnvironment } from './actions.ts'
import { RefTable } from './ref-table.ts'
import { SnapshotBuilder } from './snapshot.ts'

/** After the user touches the page, agent actions wait this long, so the user always wins. */
const YIELD_MS = 400
const MAX_YIELD_MS = 2000
/** How long after the answer a reload or a move starts, so the answer is on its way first. */
export const LEAVE_DELAY_MS = 150

export interface DriverActivity {
  /** True from the moment a call starts until it ends. */
  readonly busy: boolean
  /** True from the moment a run asked for from this page's panel starts until it ends, between the calls too. */
  readonly running: boolean
  /** What the agent is doing, for the indicator ("click", "type", ...). */
  readonly doing: string
  /** True after the user pressed the kill switch. */
  readonly killed: boolean
}

/** How long after an act a navigation it started is still noticed (a link's navigation starts a task or two after the click). */
const LEAVE_WATCH_MS = 50

export interface UiDriverOptions {
  readonly document: () => Document
  /** Milliseconds since the user last used the page (mouse, keyboard); Infinity when never. */
  readonly msSinceUserInput?: () => number
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  /** Called with the element an act is about to use, for the page to show it (the door's outline on what the agent touches). */
  readonly touched?: (element: Element) => void
  /** Leave the page: reload it, or go to a path of the app. Default: the document's own `location`, a moment after the answer is sent. */
  readonly leave?: (to: { readonly reload: true } | { readonly path: string }) => void
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
  private current: DriverActivity = { busy: false, running: false, doing: '', killed: false }
  private runningFlag = false

  private readonly options: UiDriverOptions

  constructor(options: UiDriverOptions) {
    this.options = options
    this.snapshots = new SnapshotBuilder(this.refs, () => options.document().body)
    this.env = {
      refs: this.refs,
      document: options.document,
      sleep: options.sleep ?? realSleep,
      ...(options.touched === undefined ? {} : { touched: options.touched }),
    }
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

  /**
   * A run asked for from this page's panel starts (`true`) or ends (`false`). The indicator stays up for the whole run, not only while a call is in flight. A new run is a new
   * question from the person, so it also allows the agent to drive again after an earlier Stop.
   */
  setRunning(running: boolean): void {
    if (running === this.runningFlag) return
    this.runningFlag = running
    if (running) this.killedFlag = false
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
      case 'click': return await this.watchLeaving(() => click(this.env, request), signal)
      case 'type': return await this.watchLeaving(() => typeText(this.env, request), signal)
      case 'select': return selectOption(this.env, request)
      case 'press': return await this.watchLeaving(() => pressKey(this.env, request), signal)
      case 'scroll': return scroll(this.env, request)
      case 'wait': return wait(this.env, request, signal)
      case 'reload': return this.leave({ reload: true }, 'reloading')
      case 'navigate': return this.leave({ path: request.path }, `going to ${request.path}`)
    }
  }

  /**
   * Run an act that may start a navigation (a click on a link, Enter in a form) and say so: the browser asks `beforeunload` when a navigation starts, during the act or a
   * moment after it. The answer is sent before the page goes; the Host then waits for the next page instead of reading this one again.
   */
  private async watchLeaving(act: () => UiActionResult, signal: AbortSignal): Promise<UiActionResult> {
    const view = this.options.document().defaultView
    let leaving = false
    const onLeave = (): void => { leaving = true }
    view?.addEventListener('beforeunload', onLeave)
    try {
      const result = act()
      if (!leaving) await this.env.sleep(LEAVE_WATCH_MS, signal)
      return leaving ? { ...result, leaving: true, detail: `${result.detail === undefined ? '' : `${result.detail}; `}the page is going to another address` } : result
    } finally {
      view?.removeEventListener('beforeunload', onLeave)
    }
  }

  /**
   * The page is about to be replaced, so the answer is given first and the move happens a moment later (the answer is a POST that the page's own unload would cut off).
   * The Host does not wait for this answer to be the last word: it waits for the page to come back.
   */
  private leave(to: { readonly reload: true } | { readonly path: string }, detail: string): UiActionResult {
    const go = this.options.leave ?? ((target) => {
      const location = this.options.document().defaultView?.location
      if (location === undefined) return
      if ('reload' in target) location.reload()
      else location.assign(target.path)
    })
    setTimeout(() => { if (!this.disposed) go(to) }, LEAVE_DELAY_MS)
    return { ok: true, detail }
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
    const next: DriverActivity = { busy: this.busyCount > 0, running: this.runningFlag, doing: this.doing, killed: this.killedFlag }
    if (next.busy === this.current.busy && next.running === this.current.running && next.doing === this.current.doing && next.killed === this.current.killed) return
    this.current = next
    const activity = next
    for (const listener of [...this.listeners]) listener(activity)
  }
}
