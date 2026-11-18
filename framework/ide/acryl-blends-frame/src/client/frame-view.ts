/**
 * The frame's view of the app page, as the app's own client plugins see it (docs/design/blends-frame-mockup.html): Build is the builder's screen, so the
 * app's build-time controls stay out of the canvas; Preview is what production shows, so the app's production controls render there. The frame owns the
 * mode; the page's plugins read it from this handle, and a mode change reaches them without a reload.
 *
 * The app page is same-origin under `/app`, so the frame publishes the handle on its own window and the page reads it through `window.parent`. The page
 * listens for {@link FRAME_MODE_EVENT} on its own window; `mode` is live, so the event is only the notification. A page opened directly has no such
 * parent and keeps its own behavior (plugins/agent-panel/client/main.ts and plugins/feedback/client.js read the same names).
 */

export const FRAME_VIEW_KEY: symbol = Symbol.for('acryl.frame.view')
export const FRAME_MODE_EVENT = 'acryl:frame-mode'

/** Build hides the app's own build-time controls; Preview shows what production shows. */
export type AppFrameMode = 'build' | 'preview'

/** What the app's page reads from `window.parent[FRAME_VIEW_KEY]`. */
export interface AppFrameView {
  readonly mode: AppFrameMode
}

/** The frame's side of the canvas: the live window of the app page it embeds. */
export interface FrameHost {
  contentWindow(): Window | undefined
}

/** The part of the frame's view state the handle publishes. */
export interface FrameViewSource {
  getSnapshot(): { readonly mode: AppFrameMode }
  subscribe(listener: () => void): () => void
}

/**
 * Publish the frame's view and tell the app page whenever the mode changes.
 * @param host - the canvas, whose content window is the app page.
 * @param view - the frame's view state; its `mode` is the published value.
 * @returns a disposer that removes the handle and the subscription.
 */
export function installFrameView(host: FrameHost, view: FrameViewSource): () => void {
  const handle: AppFrameView = {
    get mode(): AppFrameMode {
      return view.getSnapshot().mode
    },
  }
  const frameWindow = window as unknown as Record<symbol, AppFrameView | undefined>
  Object.defineProperty(window, FRAME_VIEW_KEY, { configurable: true, value: handle })
  let mode = handle.mode
  const stop = view.subscribe(() => {
    const next = handle.mode
    if (next === mode) return
    mode = next
    const app = host.contentWindow()
    // A plain Event from the frame's realm: the page's listener reads only its type, and the mode itself comes from the live handle.
    app?.dispatchEvent(new Event(FRAME_MODE_EVENT))
  })
  return () => {
    stop()
    if (frameWindow[FRAME_VIEW_KEY] === handle) delete frameWindow[FRAME_VIEW_KEY]
  }
}
