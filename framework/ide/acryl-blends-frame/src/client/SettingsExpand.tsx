/**
 * The expand button in DSH's Settings header (its `settings.action` list, next to "Open configuration file" and the close button): the window fills the
 * browser window, and a second click, a double click on the header, or Esc brings it back. The choice is remembered by the browser. While the Graph is
 * full screen on top, Esc leaves the Graph first (its handler runs before this one).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { markSettingsFull, readSettingsFull, writeSettingsFull } from './settings-fullscreen.ts'

const Icon = ({ full }: { readonly full: boolean }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {full
      ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
)

export function SettingsExpand() {
  const button = useRef<HTMLButtonElement>(null)
  const [full, setFull] = useState(readSettingsFull)
  const toggle = useCallback(() => {
    setFull((current) => {
      writeSettingsFull(!current)
      return !current
    })
  }, [])

  // The body is marked while the Settings window is open and full; closing Settings (this button unmounts) clears it.
  useEffect(() => {
    markSettingsFull(full)
    return () => { markSettingsFull(false) }
  }, [full])

  // Esc leaves full screen first; the next Esc closes Settings as it always did. On `document` in the capture phase: after the Graph's own handler on
  // `window` (which stops the key when the Graph is full screen), before DSH's modal handler (on `document`, bubbling).
  useEffect(() => {
    if (!full) return undefined
    const leave = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      event.stopImmediatePropagation()
      event.preventDefault()
      setFull(false)
      writeSettingsFull(false)
    }
    document.addEventListener('keydown', leave, true)
    return () => { document.removeEventListener('keydown', leave, true) }
  }, [full])

  // A double click on the empty part of the header does the same as the button.
  useEffect(() => {
    const header = button.current?.closest<HTMLElement>('[class*="header"]')
    if (header === null || header === undefined) return undefined
    const onDouble = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea') !== null) return
      toggle()
    }
    header.addEventListener('dblclick', onDouble)
    return () => { header.removeEventListener('dblclick', onDouble) }
  }, [toggle])

  return (
    <button
      ref={button}
      type="button"
      className="acrylBlendsSettingsExpand"
      aria-pressed={full}
      aria-label={full ? 'Exit full screen' : 'Full screen'}
      title={full ? 'Back to the smaller window (Esc)' : 'Fill the whole window'}
      onClick={toggle}
    >
      <Icon full={full} />
    </button>
  )
}
