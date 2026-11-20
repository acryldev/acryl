/**
 * "The agent is driving" bar with its kill switch, in plain DOM (the React one in `acryl-agent-control` shows the same states). Shown for the whole of a run asked for from
 * this page's panel (between the calls too), while a call runs, and after the person stopped the agent. Stop kills the page's control and asks the panel to stop the run (the
 * `acryl:stop-run` event on the window, which the panel listens for). It is marked as driver UI (so snapshots skip it) and as off limits to the agent (so
 * it can never press its own Stop or Allow buttons). Escape stops the agent too, while it is working.
 */

import type { DriverActivity, UiDriver } from './driver/driver.ts'

const LABELS: Record<string, string> = { snapshot: 'looking at the page', click: 'clicking', type: 'typing', select: 'choosing an option', press: 'pressing a key', scroll: 'scrolling', wait: 'waiting' }

/** Dispatched on the page's window by the Stop button: the agent panel in the same page cancels its run. */
export const STOP_RUN_EVENT = 'acryl:stop-run'

const STYLE_ID = 'acryl-door-indicator-style'
const STYLES = `
.acrylDoorBar { position: fixed; z-index: 2147483647; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-radius: 8px; font: 13px/1.4 system-ui, sans-serif; color: #fff; background: #1f2937; box-shadow: 0 4px 16px rgba(0,0,0,.25); }
.acrylDoorBar[data-killed] { background: #7f1d1d; }
.acrylDoorBar button { font: inherit; color: inherit; background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.35); border-radius: 6px; padding: 2px 10px; cursor: pointer; }
.acrylDoorDot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; }
`

/** Show the bar for `driver` in `document`. @returns the disposer, which removes the bar, its style and its listeners. */
export function mountIndicator(driver: UiDriver, document: Document): () => void {
  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.append(style)
  }
  const bar = document.createElement('div')
  bar.className = 'acrylDoorBar'
  bar.setAttribute('data-acryl-agent-control', '')
  bar.setAttribute('data-acryl-no-agent', '')
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-live', 'polite')

  const stopAgent = (): void => {
    driver.kill()
    document.defaultView?.dispatchEvent(new CustomEvent(STOP_RUN_EVENT))
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && event.isTrusted && (driver.activity.busy || driver.activity.running)) stopAgent()
  }
  document.addEventListener('keydown', onKey, true)

  const render = (activity: DriverActivity): void => {
    if (!activity.busy && !activity.running && !activity.killed) { bar.remove(); return }
    const button = document.createElement('button')
    button.type = 'button'
    const text = document.createElement('span')
    if (activity.killed) {
      bar.setAttribute('data-killed', '')
      text.textContent = 'Agent stopped. It cannot use the page until you allow it.'
      button.textContent = 'Allow again'
      button.addEventListener('click', () => { driver.resume() })
      bar.replaceChildren(text, button)
    } else {
      bar.removeAttribute('data-killed')
      const dot = document.createElement('span')
      dot.className = 'acrylDoorDot'
      dot.setAttribute('aria-hidden', 'true')
      text.textContent = `Agent is driving: ${activity.busy ? (LABELS[activity.doing] ?? activity.doing) : 'working on your request'}`
      button.textContent = 'Stop'
      button.addEventListener('click', stopAgent)
      bar.replaceChildren(dot, text, button)
    }
    if (!bar.isConnected) document.body.append(bar)
  }
  const unsubscribe = driver.subscribe(render)
  render(driver.activity)

  return () => {
    unsubscribe()
    document.removeEventListener('keydown', onKey, true)
    bar.remove()
    document.getElementById(STYLE_ID)?.remove()
  }
}
