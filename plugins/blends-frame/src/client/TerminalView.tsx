/** A terminal or PTY agent tab's screen: the live session moved into the panel while the tab is shown, moved out (not ended) when it is not. */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { TerminalRegistry } from 'acryl-workspace/ui'

export interface TerminalViewProps {
  readonly terminals: TerminalRegistry
  readonly terminalId: string
}

export function TerminalView({ terminals, terminalId }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const session = terminals.ensure(terminalId)
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot)

  useEffect(() => {
    const element = host.current
    if (element === null) return undefined
    session.attach(element)
    session.focus()
    return () => { session.detach() }
  }, [session])

  return (
    <div className="acrylBlendsTerm">
      <div className="acrylBlendsTermScreen" ref={host} />
      {status.status === 'connecting' && <p className="acrylBlendsTermNote">Starting…</p>}
      {status.error !== null && <p className="acrylBlendsTermNote" data-error>{status.error}</p>}
    </div>
  )
}
