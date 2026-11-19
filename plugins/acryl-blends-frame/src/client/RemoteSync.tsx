/**
 * The branch against its remote, with Pull and Push and the line the last one said. Two faces on one hook: the Git tab's remote row, and the
 * compact chips on the left panel's versions header (`↑2` / `↓1` / `✓`, with the line as a brief toast). Read again whenever `revision` changes;
 * the first read asks the remote (a fetch), later ones read the local refs, and each push or pull asks it anyway. A push sends the person's
 * versions under their name, so Push first asks what it will send and where ("Push 2 versions to origin/main (github.com/ana/notes)?"), with
 * Cancel as the default, and sends only that.
 */

import { useEffect, useRef, useState } from 'react'
import type { GitRemoteState, GitSyncResult, PushPlan } from '../contract.ts'
import { pushQuestion, remoteChips, remoteLabel, syncActions, type GitSyncPort } from './git-sync.ts'

type Remote =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly state: GitRemoteState }
  | { readonly status: 'error'; readonly message: string }

/** What the last push or pull said: one line, git's own when it failed. */
type Outcome = { readonly message: string; readonly failed: boolean }

const messageOf = (cause: unknown, fallback: string): string => (cause instanceof Error && cause.message !== '' ? cause.message : fallback)

function useRemoteSync(sync: GitSyncPort, root: string, revision: string) {
  const [remote, setRemote] = useState<Remote>({ status: 'loading' })
  const [busy, setBusy] = useState<'push' | 'pull' | undefined>(undefined)
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined)
  const asked = useRef(false)

  useEffect(() => {
    let live = true
    const fetchFirst = !asked.current
    asked.current = true
    sync.remote(fetchFirst).then(
      (state) => { if (live) setRemote({ status: 'ready', state }) },
      (cause: unknown) => { if (live) setRemote({ status: 'error', message: messageOf(cause, 'The remote could not be read.') }) },
    )
    return () => { live = false }
  }, [sync, root, revision])

  const [asking, setAsking] = useState<PushPlan | undefined>(undefined)

  const failed = (kind: 'push' | 'pull', cause: unknown): void => {
    setOutcome({ message: messageOf(cause, `The ${kind} did not go through.`), failed: true })
    // A refused push or pull still fetched: read the counts again.
    sync.remote(false).then(state => setRemote({ status: 'ready', state }), () => {})
  }
  const done = (result: GitSyncResult): void => {
    setRemote({ status: 'ready', state: result.remote })
    setOutcome({ message: result.message, failed: false })
  }

  const act = (kind: 'push' | 'pull'): void => {
    setBusy(kind)
    setOutcome(undefined)
    setAsking(undefined)
    if (kind === 'pull') {
      sync.pull().then(done, cause => { failed('pull', cause) }).finally(() => setBusy(undefined))
      return
    }
    // Push asks first: nothing is sent until the person says yes to this plan.
    sync.planPush().then(setAsking, cause => { failed('push', cause) }).finally(() => setBusy(undefined))
  }
  const confirmPush = (plan: PushPlan): void => {
    setAsking(undefined)
    setBusy('push')
    sync.push(plan).then(done, cause => { failed('push', cause) }).finally(() => setBusy(undefined))
  }
  const cancelPush = (): void => { setAsking(undefined) }
  const stateText = remote.status === 'loading' ? 'Asking the remote…' : remote.status === 'error' ? 'unknown' : remoteLabel(remote.state)
  return { remote, busy, outcome, setOutcome, act, stateText, asking, confirmPush, cancelPush }
}

/** The push's question, Cancel first and focused: Enter or a stray click sends nothing. */
function PushAsk({ plan, className, onPush, onCancel }: { readonly plan: PushPlan; readonly className: string; readonly onPush: () => void; readonly onCancel: () => void }) {
  return (
    <div className={className} role="group" aria-label="Push" data-testid="push-ask">
      <span>{pushQuestion(plan)}</span>
      <span className="acrylBlendsPushAskButtons">
        <button type="button" className="acrylBlendsSmallButton" autoFocus onClick={onCancel}>Cancel</button>
        <button type="button" className="acrylBlendsSmallButton acrylBlendsPushConfirm" onClick={onPush}>Push</button>
      </span>
    </div>
  )
}

export interface RemoteSyncProps {
  readonly sync: GitSyncPort
  readonly root: string
  readonly revision: string
}

/** The Git tab's row. */
export function RemoteSync({ sync, root, revision }: RemoteSyncProps) {
  const { remote, busy, outcome, act, stateText, asking, confirmPush, cancelPush } = useRemoteSync(sync, root, revision)
  const actions = remote.status === 'ready' ? syncActions(remote.state) : { push: false, pull: false }
  return (
    <>
      <div className="acrylBlendsLabel acrylBlendsGitLabel">Remote</div>
      <div className="acrylBlendsGitRemote">
        <span className="acrylBlendsGitRemoteState" data-testid="git-remote-state" title={stateText}>{stateText}</span>
        <button type="button" className="acrylBlendsSmallButton" disabled={busy !== undefined || !actions.pull} onClick={() => act('pull')}>
          {busy === 'pull' ? 'Pulling…' : 'Pull'}
        </button>
        <button type="button" className="acrylBlendsSmallButton" disabled={busy !== undefined || asking !== undefined || !actions.push} onClick={() => act('push')}>
          {busy === 'push' ? 'Pushing…' : 'Push'}
        </button>
      </div>
      {asking !== undefined && <PushAsk plan={asking} className="acrylBlendsPushAsk" onPush={() => { confirmPush(asking) }} onCancel={cancelPush} />}
      {remote.status === 'error' && <p className="acrylBlendsNote" data-error>{remote.message}</p>}
      {/* A push or pull says what git said; the fetch's own line would only repeat it. */}
      {outcome === undefined && remote.status === 'ready' && remote.state.kind === 'tracking' && remote.state.fetchError !== undefined && (
        <p className="acrylBlendsNote" data-error>The remote did not answer: {remote.state.fetchError}</p>
      )}
      {outcome !== undefined && (
        <p className="acrylBlendsNote" data-testid="git-sync-outcome" role="status" {...(outcome.failed ? { 'data-error': '' } : {})}>{outcome.message}</p>
      )}
    </>
  )
}

/** How long a push's or pull's line stays: a failure longer, and a click on it dismisses it sooner. */
const TOAST_MS = 4000
const TOAST_FAILED_MS = 9000

/** The versions header's chips; nothing when the branch has no remote. */
export function RemoteChips({ sync, root, revision }: RemoteSyncProps) {
  const { remote, busy, outcome, setOutcome, act, stateText, asking, confirmPush, cancelPush } = useRemoteSync(sync, root, revision)
  useEffect(() => {
    if (outcome === undefined) return
    const timer = setTimeout(() => { setOutcome(undefined) }, outcome.failed ? TOAST_FAILED_MS : TOAST_MS)
    return () => { clearTimeout(timer) }
  }, [outcome, setOutcome])
  const chips = remote.status === 'ready' ? remoteChips(remote.state) : undefined
  const fetchError = remote.status === 'ready' && remote.state.kind === 'tracking' ? remote.state.fetchError : undefined
  const title = fetchError === undefined ? stateText : `${stateText} (the remote did not answer: ${fetchError})`
  return (
    <>
      {chips !== undefined && (
        <span className="acrylBlendsRemoteChips" data-testid="remote-chips">
          {chips.synced && <span className="acrylBlendsRemoteChip" data-synced title={title} aria-label={title}>✓</span>}
          {chips.pull !== undefined && (
            <button type="button" className="acrylBlendsRemoteChip" title={`${title} · Pull`} aria-label={`Pull: ${title}`} disabled={busy !== undefined} onClick={() => act('pull')}>
              {busy === 'pull' ? '…' : chips.pull}
            </button>
          )}
          {chips.push !== undefined && (
            <button type="button" className="acrylBlendsRemoteChip" title={`${title} · Push`} aria-label={`Push: ${title}`} disabled={busy !== undefined || asking !== undefined} onClick={() => act('push')}>
              {busy === 'push' ? '…' : chips.push}
            </button>
          )}
        </span>
      )}
      {asking !== undefined && <PushAsk plan={asking} className="acrylBlendsToast acrylBlendsPushAskFloat" onPush={() => { confirmPush(asking) }} onCancel={cancelPush} />}
      {outcome !== undefined && (
        <button
          type="button"
          className="acrylBlendsToast"
          data-testid="git-sync-outcome"
          role="status"
          title="Dismiss"
          {...(outcome.failed ? { 'data-error': '' } : {})}
          onClick={() => { setOutcome(undefined) }}
        >
          {outcome.message}
        </button>
      )}
    </>
  )
}
