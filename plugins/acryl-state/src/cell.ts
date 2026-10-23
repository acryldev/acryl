/**
 * Observable cells: the reactive core of the state service, with no Cordis and no DOM. A cell holds one value, tells its
 * subscribers when it changes, and can be derived from other cells. The shape is a writable cell and a derived cell
 * (spec 046, M5): small enough to read in one sitting, and the same cell serves a React hook, a terminal component and a
 * server-sent stream.
 */

export type Listener<T> = (value: T, previous: T) => void

export interface ReadonlyCell<T> {
  readonly key: string
  get(): T
  /** Call `listener` after every change (never for a set to an equal value). Returns the unsubscribe function. */
  subscribe(listener: Listener<T>): () => void
}

export interface Cell<T> extends ReadonlyCell<T> {
  set(value: T): void
  update(change: (current: T) => T): void
}

type ErrorSink = (error: unknown) => void

/** A writable cell. `report` receives anything a listener throws; one failing listener never blocks the others. */
export function createCell<T>(key: string, initial: T, report: ErrorSink = () => undefined): Cell<T> {
  let value = initial
  const listeners = new Set<Listener<T>>()
  const set = (next: T): void => {
    if (Object.is(next, value)) return
    const previous = value
    value = next
    for (const listener of [...listeners]) {
      try { listener(next, previous) } catch (error) { report(error) }
    }
  }
  return {
    key,
    get: () => value,
    set,
    update: change => { set(change(value)) },
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

type Values<D extends readonly ReadonlyCell<unknown>[]> = { [K in keyof D]: D[K] extends ReadonlyCell<infer V> ? V : never }

/**
 * A read-only cell computed from other cells and recomputed whenever one of them changes. `dispose` detaches it from its
 * inputs; after that it keeps its last value.
 */
export function createDerived<D extends readonly ReadonlyCell<unknown>[], T>(
  key: string,
  inputs: D,
  compute: (...values: Values<D>) => T,
  report: ErrorSink = () => undefined,
): { readonly cell: ReadonlyCell<T>, readonly dispose: () => void } {
  const read = (): T => compute(...(inputs.map(input => input.get()) as unknown as Values<D>))
  const inner = createCell<T>(key, read(), report)
  const stops = inputs.map(input => input.subscribe(() => { inner.set(read()) }))
  return {
    cell: { key, get: inner.get, subscribe: inner.subscribe },
    dispose: () => { for (const stop of stops) stop() },
  }
}
