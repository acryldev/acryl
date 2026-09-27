/**
 * "The agent is driving" bar with its kill switch. Shown while a call runs and after the user stopped the
 * agent. It is marked as driver UI (so snapshots skip it) and as off limits to the agent (so it can never
 * press its own Stop or Allow buttons).
 */

import { useEffect, useSyncExternalStore } from 'react'
import type { UiDriver } from './driver/driver.ts'

export interface IndicatorProps {
  readonly driver: UiDriver
}

const LABELS: Record<string, string> = { snapshot: 'looking at the window', click: 'clicking', type: 'typing', select: 'choosing an option', press: 'pressing a key', scroll: 'scrolling', wait: 'waiting' }

export function AgentDrivingIndicator({ driver }: IndicatorProps) {
  const activity = useSyncExternalStore(
    listener => driver.subscribe(listener),
    () => driver.activity,
  )
  // The user's Escape key is a kill switch too, while the agent is working.
  useEffect(() => {
    if (!activity.busy) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && event.isTrusted) driver.kill() }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true) }
  }, [driver, activity.busy])

  if (!activity.busy && !activity.killed) return null
  return (
    <div className="acrylDrivingBar" data-acryl-agent-control data-acryl-no-agent role="status" aria-live="polite" data-killed={activity.killed || undefined}>
      {activity.killed ? (
        <>
          <span>Agent stopped. It cannot use the window until you allow it.</span>
          <button type="button" onClick={() => { driver.resume() }}>Allow again</button>
        </>
      ) : (
        <>
          <span className="acrylDrivingDot" aria-hidden="true" />
          <span>Agent is driving: {LABELS[activity.doing] ?? activity.doing}</span>
          <button type="button" onClick={() => { driver.kill() }}>Stop</button>
        </>
      )}
    </div>
  )
}
