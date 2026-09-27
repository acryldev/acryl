/** The palette's global shortcut: Cmd+Shift+K on macOS, Ctrl+Shift+K elsewhere. */

/** @returns true for the keydown that toggles the palette. */
export function isPaletteShortcut(event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'isComposing'>): boolean {
  if (event.isComposing || event.altKey || !event.shiftKey) return false
  if (!event.metaKey && !event.ctrlKey) return false
  return event.code === 'KeyK' || event.key.toLowerCase() === 'k'
}

/** @returns disposer, for one owning effect. The event is consumed so the page and the terminal never see it. */
export function startPaletteShortcut(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, toggle: () => void): () => void {
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || !isPaletteShortcut(event)) return
    event.preventDefault()
    event.stopPropagation()
    toggle()
  }
  // Capture phase: a focused terminal would otherwise swallow the keystroke.
  target.addEventListener('keydown', onKeyDown, true)
  return () => { target.removeEventListener('keydown', onKeyDown, true) }
}
