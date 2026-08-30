const CANVAS_STYLES = `
.dshCanvas { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; height: 100%; background: var(--dsw-alias-bg-base); }
.dshCanvasTabstrip { display: flex; align-items: stretch; min-height: 36px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, black); -webkit-app-region: no-drag; }
.dshCanvasTabs { display: flex; flex: 1; min-width: 0; overflow-x: auto; }
.dshCanvasTab { display: flex; align-items: stretch; max-width: 220px; min-width: 88px; border-right: 1px solid var(--dsw-alias-border-l2); background: transparent; }
.dshCanvasTab[data-active] { background: var(--dsw-alias-bg-base); }
.dshCanvasTabButton { appearance: none; display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; margin: 0; padding: 0 4px 0 10px; border: 0; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 12px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshCanvasTab[data-active] .dshCanvasTabButton { color: var(--dsw-alias-fg); }
.dshCanvasTabGlyph { flex: none; opacity: 0.7; }
.dshCanvasTabLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshCanvasTabClose { appearance: none; width: 22px; margin: 6px 6px 6px 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font-size: 14px; }
.dshCanvasTabClose:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshCanvasPlusWrap { position: relative; flex: none; display: flex; align-items: center; padding: 0 6px; }
.dshCanvasPlus { appearance: none; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 600 18px/1 ui-sans-serif, system-ui, sans-serif; }
.dshCanvasPlus:hover, .dshCanvasPlus[aria-expanded="true"] { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshCanvasMenu { position: absolute; top: calc(100% + 4px); right: 4px; z-index: 40; width: 240px; max-height: min(70vh, 520px); overflow: auto; padding: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); box-shadow: 0 16px 40px rgb(0 0 0 / 28%); }
.dshCanvasMenuItem { appearance: none; display: block; width: 100%; margin: 0; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; text-align: left; font: 13px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshCanvasMenuItem:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshCanvasMenuRule { height: 1px; margin: 6px 4px; background: var(--dsw-alias-border-l2); }
.dshCanvasStage { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); }
.dshCanvasChat, .dshCanvasPty, .dshCanvasFile, .dshCanvasBrowser { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.dshCanvasEmpty { display: grid; place-items: center; flex: 1; color: var(--dsw-alias-fg-l2); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshCanvasPtyToolbar, .dshCanvasBrowserBar { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.dshCanvasPtyName { font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshCanvasPtyStatus { margin-left: auto; font: 11px/1 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg-l2); }
.dshCanvasXterm { position: relative; flex: 1; min-width: 0; min-height: 0; padding: 8px 10px; overflow: hidden; background: #0b0d12; }
.dshCanvasPtyError { position: absolute; inset: 50% auto auto 50%; translate: -50% -50%; max-width: min(520px, 80%); color: #fca5a5; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshCanvasXterm .xterm { position: relative; width: 100%; height: 100%; cursor: text; user-select: none; }
.dshCanvasXterm .xterm.focus, .dshCanvasXterm .xterm:focus { outline: none; }
.dshCanvasXterm .xterm-helpers { position: absolute; top: 0; z-index: 5; }
.dshCanvasXterm .xterm-helper-textarea { position: absolute; z-index: -5; top: 0; left: -9999em; width: 0; height: 0; margin: 0; padding: 0; overflow: hidden; border: 0; opacity: 0; resize: none; white-space: nowrap; }
.dshCanvasXterm .composition-view { position: absolute; z-index: 1; display: none; color: white; background: black; white-space: nowrap; }
.dshCanvasXterm .composition-view.active { display: block; }
.dshCanvasXterm .xterm-viewport { position: absolute; inset: 0; overflow-y: scroll; cursor: default; background: #0b0d12; }
.dshCanvasXterm .xterm-screen { position: relative; }
.dshCanvasXterm .xterm-screen canvas { position: absolute; top: 0; left: 0; }
.dshCanvasXterm .xterm-scroll-area { visibility: hidden; }
.dshCanvasXterm .xterm-char-measure-element { position: absolute; top: 0; left: -9999em; display: inline-block; visibility: hidden; line-height: normal; }
.dshCanvasXterm .xterm.enable-mouse-events { cursor: default; }
.dshCanvasXterm .xterm-cursor-pointer { cursor: pointer; }
.dshCanvasXterm .xterm-accessibility:not(.debug), .dshCanvasXterm .xterm-message { position: absolute; z-index: 10; inset: 0; color: transparent; pointer-events: none; }
.dshCanvasXterm .xterm-accessibility-tree { user-select: text; white-space: pre; }
.dshCanvasXterm .live-region { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.dshCanvasFile input, .dshCanvasFile textarea, .dshCanvasBrowserBar input { flex: 1; min-width: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshCanvasFile { gap: 0; }
.dshCanvasFile input { padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); border-radius: 0; }
.dshCanvasFile textarea { flex: 1; padding: 12px 14px; resize: none; }
.dshCanvasBrowserBar input { border: 1px solid var(--dsw-alias-border-l2); padding: 6px 8px; }
.dshCanvasBrowserBar button { appearance: none; padding: 4px 10px; border: 0; border-radius: 6px; background: #4d6bfe; color: white; cursor: pointer; font: 12px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshCanvasBrowserFrame { flex: 1; width: 100%; border: 0; background: white; }
`

/** Install styles owned by one Canvas Client Fiber. */
export function installCanvasStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'acryl-development-canvas'
  style.textContent = CANVAS_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
