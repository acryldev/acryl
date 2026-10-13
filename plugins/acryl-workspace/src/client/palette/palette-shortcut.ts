/**
 * The palette's global shortcut. The key itself is a DSH shortcut command registered by `acryl-shortcuts` (Cmd/Ctrl+Shift+P by default,
 * rebindable in Settings > Shortcuts); it announces itself with a window event, which `startPaletteEventListener` turns into a toggle.
 */

/** Window event `acryl-shortcuts` dispatches when its palette command runs. Keep the string in step with that package. */
export const PALETTE_TOGGLE_EVENT = 'acryl:toggle-command-palette'

/** Window event that starts picking an element (`acryl-mount-anchors` listens). Keep the string in step with that package. */
export const PICK_ELEMENT_EVENT = 'acryl:toggle-element-picker'

/** @returns disposer. Toggles the palette when the shortcut command fires. */
export function startPaletteEventListener(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, toggle: () => void): () => void {
  const handler = (): void => { toggle() }
  target.addEventListener(PALETTE_TOGGLE_EVENT, handler)
  return () => { target.removeEventListener(PALETTE_TOGGLE_EVENT, handler) }
}
