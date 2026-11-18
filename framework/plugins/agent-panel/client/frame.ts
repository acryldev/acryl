/**
 * The ACRYL frame's view as the app page sees it (ide/acryl-blends-frame/src/client/frame-view.ts): the frame's canvas hides the app's own build-time
 * controls in Build and shows what production shows in Preview. The page is same-origin with the frame, so it reads the handle the frame publishes on
 * its window through `window.parent`; a page opened directly has no such parent and keeps its own behavior.
 */

export const FRAME_VIEW_KEY: symbol = Symbol.for('acryl.frame.view')
export const FRAME_MODE_EVENT = 'acryl:frame-mode'

/** What the app page reads from `window.parent[FRAME_VIEW_KEY]`. */
export interface FrameViewHandle {
  readonly mode: 'build' | 'preview'
}

/**
 * The frame's view handle when this page runs in the frame's canvas.
 * @param win - the page's window.
 * @returns the handle, or undefined when the page is the top window or its parent is cross-origin.
 */
export function frameViewOf(win: Window = window): FrameViewHandle | undefined {
  try {
    if (win.parent === win) return undefined
    return (win.parent as unknown as Record<symbol, FrameViewHandle | undefined>)[FRAME_VIEW_KEY]
  } catch {
    return undefined
  }
}

/**
 * Whether the panel is the production Assistant: the Host itself is the Assistant, or the app's production environment names it (ACRYL_ASSISTANT=on)
 * and the page runs in the frame, whose Preview shows the app as production would.
 * @param session - the panel's session from its Host.
 * @param frame - the frame's view handle, if any.
 */
export function panelVariant(
  session: { readonly assistant?: boolean; readonly assistantInProduction?: boolean },
  frame: FrameViewHandle | undefined,
): boolean {
  if (session.assistant === true) return true
  return frame !== undefined && session.assistantInProduction === true
}

/**
 * Whether the panel shows at all: on a page opened directly, yes; in the frame, only in Preview, and only as the Assistant. Build is the builder's
 * screen, where the app's own panel has no place over the canvas.
 * @param frame - the frame's view handle, if any.
 * @param assistant - whether this panel is the production Assistant (see {@link panelVariant}).
 */
export function panelVisible(frame: FrameViewHandle | undefined, assistant: boolean): boolean {
  return frame === undefined || (frame.mode === 'preview' && assistant)
}
