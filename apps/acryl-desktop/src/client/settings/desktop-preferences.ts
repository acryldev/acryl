/**
 * A small client scope over ACRYL's Desktop preferences (`acryl-settings`, served by `/api/desktop/preferences`).
 *
 * DSH 0.2 removed the client `settingsScope` the Desktop settings page used to bind its namespaces. ACRYL's preferences are its own
 * now, so the page reads and writes them through the Host route with this scope: the same snapshot shape the section already renders
 * (`loading`, `ready`, `unavailable`, `writable`, `value`), and `set(key, value)` that returns once the Host has validated and stored it.
 */

import type { DesktopSettingsApi } from './desktop-settings-api.ts'

export type PreferenceStatus = 'loading' | 'ready' | 'unavailable'

export interface PreferenceSnapshot<T> {
  readonly status: PreferenceStatus
  /** Whether the Host accepted this namespace for writes (it is `ready`). */
  readonly writable: boolean
  readonly value: T | undefined
}

export interface PreferenceScope<T> {
  getSnapshot(): PreferenceSnapshot<T>
  subscribe(listener: () => void): () => void
  /** Store one preference; rejects when the Host refuses the value. */
  set<K extends keyof T & string>(key: K, value: T[K] & (string | number | boolean)): Promise<void>
  /** Read the Host's current values again. */
  refresh(): Promise<void>
}

const LOADING: PreferenceSnapshot<never> = Object.freeze({ status: 'loading', writable: false, value: undefined })
const UNAVAILABLE: PreferenceSnapshot<never> = Object.freeze({ status: 'unavailable', writable: false, value: undefined })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Create one scope per namespace. All scopes made from the same `api` should share one `PreferencesStore`
 * so a write in one section is seen by the others; use {@link createPreferenceScopes}.
 */
export function createPreferenceScopes(api: DesktopSettingsApi): <T>(namespace: string) => PreferenceScope<T> {
  let sections: Readonly<Record<string, unknown>> | undefined
  let failed = false
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  let loading: Promise<void> | undefined

  const apply = (next: Readonly<Record<string, unknown>>): void => {
    sections = next
    failed = false
    notify()
  }
  const load = (): Promise<void> => {
    loading ??= api.readPreferences().then(apply, () => { failed = true; notify() }).finally(() => { loading = undefined })
    return loading
  }
  void load()

  return <T,>(namespace: string): PreferenceScope<T> => {
    let cached: PreferenceSnapshot<T> | undefined
    let cachedSource: unknown
    const snapshot = (): PreferenceSnapshot<T> => {
      if (failed) return UNAVAILABLE
      if (sections === undefined) return LOADING
      const section = sections[namespace]
      if (!isRecord(section)) return UNAVAILABLE
      if (cached !== undefined && cachedSource === section) return cached
      cachedSource = section
      cached = Object.freeze({ status: 'ready', writable: true, value: section as T })
      return cached
    }
    return {
      getSnapshot: snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      async set(key, value) {
        apply(await api.setPreference(namespace, { [key]: value }))
      },
      refresh: load,
    }
  }
}
