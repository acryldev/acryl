/** The Versions section: the branch's commits as save points, with save, restore and share. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_COMMIT_MESSAGE, shareQuestion, type VersionsEntry, type VersionsLogView, type VersionsSharePlan } from '../contract.ts'
import { createVersionsApi, type VersionsApi } from './api.ts'

export interface VersionsSectionProps {
  readonly path: string
  /** Test seam; the page's own API when absent. */
  readonly api?: VersionsApi
}

/** The page's own client; created once and stateless, so the service and the component share one shape. */
const pageApi = createVersionsApi()

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly log: VersionsLogView }
  | { readonly status: 'error'; readonly message: string }

const LOADING: LoadState = { status: 'loading' }

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : 'The versions request failed.'
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the plain calendar date. */
export function formatRelativeTime(at: string, now: number = Date.now()): string {
  const time = Date.parse(at)
  if (Number.isNaN(time)) return ''
  const seconds = Math.max(0, Math.round((now - time) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)} h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${String(days)} d ago`
  return new Date(time).toISOString().slice(0, 10)
}

function LogMeta({ log }: { readonly log: VersionsLogView }) {
  const branch = log.branch ?? 'detached HEAD'
  return (
    <p className="acrylVersionsMeta">
      <span className="acrylVersionsBranch">{branch}</span>
      {log.upstream === null
        ? <span className="acrylVersionsUpstream">no upstream</span>
        : (
            <span className="acrylVersionsUpstream">
              {`${log.upstream}, ${String(log.ahead)} ahead, ${String(log.behind)} behind`}
            </span>
          )}
    </p>
  )
}

export function VersionsSection({ path, api }: VersionsSectionProps) {
  const client = api ?? pageApi
  const [load, setLoad] = useState<LoadState>(LOADING)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'save' | 'restore' | 'share' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // A share sends the branch out under the person's name: Share only plans, the question names what goes where, and only its Push sends that plan.
  const [asking, setAsking] = useState<VersionsSharePlan | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  /** Read the log again; a refresh keeps the list on screen while it runs and a first load shows the loading line. */
  const refresh = useCallback(async (keepList: boolean): Promise<void> => {
    if (path === '') return
    const seq = ++requestSeq.current
    setLoad(current => keepList && current.status === 'ready' ? current : LOADING)
    try {
      const log = await client.log(path)
      if (seq === requestSeq.current) setLoad({ status: 'ready', log })
    } catch (cause) {
      if (seq === requestSeq.current) setLoad({ status: 'error', message: messageOf(cause) })
    }
  }, [client, path])

  useEffect(() => {
    setStatus(null)
    setActionError(null)
    void refresh(false)
    return () => { requestSeq.current += 1 }
  }, [refresh])

  const save = async (): Promise<void> => {
    const text = message.trim()
    if (path === '' || text === '' || busy !== null) return
    setBusy('save')
    setActionError(null)
    setStatus(null)
    try {
      const result = await client.save(path, text)
      setMessage('')
      setStatus(`Saved ${result.commit.short}: ${result.commit.subject}`)
      await refresh(true)
    } catch (cause) {
      setActionError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const restore = async (entry: VersionsEntry): Promise<void> => {
    if (path === '' || busy !== null) return
    if (!window.confirm(`Restore version ${entry.short}? This creates a new version; history is kept.`)) return
    setBusy('restore')
    setActionError(null)
    setStatus(null)
    try {
      const result = await client.restore(path, entry.hash)
      setStatus(`Restored ${result.restored} as ${result.commit.short}`)
      await refresh(true)
    } catch (cause) {
      setActionError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const askShare = async (): Promise<void> => {
    if (path === '' || busy !== null) return
    setBusy('share')
    setActionError(null)
    setStatus(null)
    try {
      setAsking(await client.planShare(path))
    } catch (cause) {
      setActionError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const share = async (confirmed: VersionsSharePlan): Promise<void> => {
    if (path === '' || busy !== null) return
    setBusy('share')
    setActionError(null)
    try {
      const result = await client.share(path, confirmed)
      setStatus(`Pushed to ${result.upstream}.`)
      await refresh(true)
    } catch (cause) {
      setActionError(messageOf(cause))
    } finally {
      setAsking(null)
      setBusy(null)
    }
  }

  if (path === '') return null

  return (
    <section className="acrylVersionsSection" aria-label="Versions">
      <h3 className="acrylVersionsHeading">Versions</h3>
      <div className="acrylVersionsSave">
        <input
          className="acrylVersionsInput"
          aria-label="Version message"
          placeholder="What changed?"
          maxLength={MAX_COMMIT_MESSAGE}
          value={message}
          onChange={(event) => { setMessage(event.target.value) }}
        />
        <button
          type="button"
          className="acrylVersionsButton"
          disabled={message.trim() === '' || busy !== null}
          onClick={() => { void save() }}
        >
          Save point
        </button>
        <button
          type="button"
          className="acrylVersionsButton"
          disabled={busy !== null || asking !== null}
          onClick={() => { void askShare() }}
        >
          Share
        </button>
      </div>
      {asking !== null && (
        <div className="acrylVersionsAsk" role="group" aria-label="Share the branch">
          <p className="acrylVersionsNote">{shareQuestion(asking)}</p>
          <button type="button" className="acrylVersionsButton" autoFocus disabled={busy !== null} onClick={() => { setAsking(null) }}>
            Cancel
          </button>
          <button type="button" className="acrylVersionsButton" disabled={busy !== null} onClick={() => { void share(asking) }}>
            {busy === 'share' ? 'Pushing...' : 'Push'}
          </button>
        </div>
      )}
      {load.status === 'ready' && <LogMeta log={load.log} />}
      {status !== null && <p className="acrylVersionsNote" role="status">{status}</p>}
      {actionError !== null && <p className="acrylVersionsNote" data-error role="alert">{actionError}</p>}
      {load.status === 'loading' && <p className="acrylVersionsEmpty">Loading versions...</p>}
      {load.status === 'error' && <p className="acrylVersionsNote" data-error role="alert">{load.message}</p>}
      {load.status === 'ready' && load.log.entries.length === 0 && (
        <p className="acrylVersionsEmpty">No versions yet. Save a point to make the first one.</p>
      )}
      {load.status === 'ready' && load.log.entries.length > 0 && (
        <ul className="acrylVersionsList">
          {load.log.entries.map((entry, index) => (
            <li className="acrylVersionsItem" key={entry.hash} data-current={index === 0 ? '' : undefined}>
              <div className="acrylVersionsLine">
                <code className="acrylVersionsHash">{entry.short}</code>
                <span className="acrylVersionsSubject">{entry.subject}</span>
              </div>
              <div className="acrylVersionsLine acrylVersionsDetail">
                <span className="acrylVersionsDate">{formatRelativeTime(entry.at)}</span>
                <span className="acrylVersionsAuthor">{entry.author}</span>
                {index === 0 && <span className="acrylVersionsCurrent">current</span>}
                <button
                  type="button"
                  className="acrylVersionsButton acrylVersionsRestore"
                  aria-label={`Restore ${entry.short}`}
                  disabled={busy !== null}
                  onClick={() => { void restore(entry) }}
                >
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
