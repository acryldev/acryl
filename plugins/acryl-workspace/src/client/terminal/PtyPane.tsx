/** A terminal or agent tab: shows the session's live terminal and its status. */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { WorkspaceTile } from '../canvas/state.ts'
import type { TerminalRegistry, TerminalSessionSnapshot } from './terminal-session.ts'

const NO_SUBSCRIPTION = (): (() => void) => () => {}
const STARTING: TerminalSessionSnapshot = { status: 'connecting', exitCode: null, error: null }

function statusText(snapshot: TerminalSessionSnapshot): string {
  if (snapshot.status === 'live') return 'running'
  if (snapshot.status === 'exited') return snapshot.exitCode === null ? 'exited' : `exited (${String(snapshot.exitCode)})`
  if (snapshot.status === 'reconnecting') return 'reconnecting...'
  if (snapshot.status === 'lost') return 'session ended'
  return 'starting'
}

export function PtyPane({ tile, terminals }: { readonly tile: WorkspaceTile; readonly terminals: TerminalRegistry }) {
  const terminalHost = useRef<HTMLDivElement>(null)
  const session = tile.sessionId === undefined ? undefined : terminals.ensure(tile.sessionId)
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? NO_SUBSCRIPTION,
    session?.getSnapshot ?? (() => STARTING),
  )

  // The terminal is moved into this pane while the tab shows it and back out when it does not.
  useEffect(() => {
    const host = terminalHost.current
    if (session === undefined || host === null) return
    session.attach(host)
    return () => { session.detach() }
  }, [session])

  const status = tile.error !== undefined ? 'error' : statusText(snapshot)
  return (
    <div className="dshWorkspacePty" onMouseDown={() => { session?.focus() }}>
      <div className="dshWorkspacePtyToolbar">
        <span className="dshWorkspacePtyName">{tile.title}</span>
        <span className="dshWorkspacePtyStatus" data-status={snapshot.status}>{status}</span>
      </div>
      <div ref={terminalHost} className="dshWorkspaceXterm" aria-label={`${tile.title} terminal`} />
      {tile.error !== undefined && <div className="dshWorkspacePtyError">{tile.error}</div>}
    </div>
  )
}
