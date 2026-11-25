/**
 * Settings > Updates: where this Control Center stands against its Blend's latest release, a check, and the update itself (the same `updateSelf` as the
 * Home banner). Shown only when the app runs from a Blend copy it can update (the state's `self`); polls while an update runs, since the screen may reload.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { SelfView } from '../contract.ts'
import type { LauncherApi } from './api.ts'

export interface UpdatesSectionProps {
  readonly api: Pick<LauncherApi, 'state' | 'blends' | 'updateSelf'>
}

type Load = { readonly kind: 'loading' } | { readonly kind: 'none' } | { readonly kind: 'self', readonly self: SelfView } | { readonly kind: 'error', readonly message: string }

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

export function UpdatesSection({ api }: UpdatesSectionProps): ReactNode {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const read = useCallback(async () => {
    try {
      const state = await api.state()
      setLoad(state.self === undefined ? { kind: 'none' } : { kind: 'self', self: state.self })
    } catch (cause) {
      setLoad({ kind: 'error', message: reason(cause) })
    }
  }, [api])
  const check = useCallback(async () => {
    setBusy(true)
    try {
      await api.blends()
      await read()
    } catch (cause) {
      setLoad({ kind: 'error', message: `The registry could not be read: ${reason(cause)}` })
    } finally {
      setBusy(false)
    }
  }, [api, read])
  useEffect(() => { void check() }, [check])
  const updating = load.kind === 'self' && load.self.status === 'updating'
  useEffect(() => {
    if (!updating) return undefined
    const timer = setInterval(() => { void read() }, 1500)
    return () => { clearInterval(timer) }
  }, [updating, read])
  const update = (): void => {
    setBusy(true)
    api.updateSelf().then(() => read(), (cause: unknown) => { setLoad({ kind: 'error', message: reason(cause) }) }).finally(() => { setBusy(false) })
  }
  return (
    <section className="acrylUpdates" aria-label="Updates">
      <h3>Updates</h3>
      <Status load={load} />
      {load.kind === 'self' && load.self.output !== undefined && load.self.output !== '' ? <pre>{load.self.output}</pre> : null}
      <div className="acrylUpdatesActions">
        {load.kind === 'self' && (load.self.status === 'available' || load.self.status === 'failed')
          ? <button type="button" className="acrylUpdatesButton" data-primary disabled={busy} onClick={update}>{load.self.status === 'failed' ? 'Try again' : `Update to ${load.self.update}`}</button>
          : null}
        <button type="button" className="acrylUpdatesButton" disabled={busy || updating} onClick={() => { void check() }}>{busy ? 'Checking...' : 'Check for updates'}</button>
      </div>
    </section>
  )
}

function Status({ load }: { readonly load: Load }): ReactNode {
  if (load.kind === 'loading') return <p>Checking the registry...</p>
  if (load.kind === 'none') return <p>This copy was not made from a Blend, so it updates by downloading its newest release.</p>
  if (load.kind === 'error') return <p role="alert">{load.message}</p>
  const { self } = load
  switch (self.status) {
    case 'checking': return <p>{self.name} {self.version}. Checking the registry for a newer release...</p>
    case 'current': return <p role="status">{self.name} {self.version} is the latest release.</p>
    case 'available': return <p role="status">{self.name} {self.update} is out; you have {self.version}. Updating keeps any change you made (a git merge), then installs its packages.</p>
    case 'updating': return <p role="status">Updating {self.name} to {self.update}: getting the release, merging it in, then npm install. The window may reload; that is expected.</p>
    case 'done': return <p role="status">{self.name} is updated to {self.update}. Quit it and open it again to finish.</p>
    case 'failed': return <p role="alert">{self.name} could not be updated to {self.update}. Nothing was lost: the copy is as it was. The last lines it printed:</p>
  }
}
