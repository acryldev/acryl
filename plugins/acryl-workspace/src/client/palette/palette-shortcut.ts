/**
 * The palette's global shortcut. The key itself is a DSH shortcut command registered by `acryl-shortcuts` (Cmd/Ctrl+Shift+P by default,
 * rebindable in Edit shortcuts); it announces itself with a window event, which `startPaletteEventListener` turns into a toggle.
 * `startPaletteShortcut` is the older direct Cmd/Ctrl+Shift+K listener, kept for hosts that do not compose `acryl-shortcuts`.
 */

/** Window event `acryl-shortcuts` dispatches when its palette command runs. Keep the string in step with that package. */
export const PALETTE_TOGGLE_EVENT = 'acryl:toggle-command-palette'

/** @returns disposer. Toggles the palette when the shortcut command fires. */
export function startPaletteEventListener(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, toggle: () => void): () => void {
  const handler = (): void => { toggle() }
  target.addEventListener(PALETTE_TOGGLE_EVENT, handler)
  return () => { target.removeEventListener(PALETTE_TOGGLE_EVENT, handler) }
}

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
