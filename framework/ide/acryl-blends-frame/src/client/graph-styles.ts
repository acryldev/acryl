/** The graph view's styles, in the frame's own tokens (`--bf-*`, set on `.acrylBlendsPlugins` for both themes). A style element of its own, so the view adds nothing to the frame's sheet. */

const STYLE_ID = 'acryl-blends-graph-styles'

const CSS = `
.acrylBlendsPluginsViews { display: flex; gap: 8px; margin-bottom: 10px; }
.acrylBlendsGraph { display: flex; flex-direction: column; gap: 8px; min-height: 520px; }
.acrylBlendsGraphChrome { display: flex; flex-direction: column; gap: 8px; }
.acrylBlendsGraphBar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; }
.acrylBlendsGraphCount, .acrylBlendsGraphDim, .acrylBlendsGraphTime { color: var(--bf-dim); }
.acrylBlendsGraphLive { font-size: 11px; border-radius: 99px; padding: 1px 8px; border: 1px solid var(--bf-border-2); color: var(--bf-dim); }
.acrylBlendsGraphLive[data-live="live"] { color: var(--bf-ok); border-color: var(--bf-ok); }
.acrylBlendsGraphLive[data-live="lost"] { color: var(--bf-warn); border-color: var(--bf-warn); }
.acrylBlendsGraphPlanes { display: inline-flex; border: 1px solid var(--bf-border-2); border-radius: 6px; overflow: hidden; }
.acrylBlendsGraphPlanes button { font-size: 12px; padding: 3px 10px; border: 0; background: transparent; color: var(--bf-text-2); cursor: pointer; }
.acrylBlendsGraphPlanes button[aria-pressed="true"] { background: var(--bf-accent-dim); color: var(--bf-strong); }
.acrylBlendsGraphButton { font-size: 12px; padding: 3px 9px; border: 1px solid var(--bf-border-2); border-radius: 6px; background: transparent; color: var(--bf-text-2); cursor: pointer; }
.acrylBlendsGraphButton:hover { border-color: var(--bf-accent); color: var(--bf-strong); }
.acrylBlendsGraphToggle { display: inline-flex; align-items: center; gap: 4px; color: var(--bf-text-2); }
.acrylBlendsGraphSearch { min-width: 170px; max-width: 240px; }
.acrylBlendsGraphLegend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--bf-text-2); }
.acrylBlendsGraphBody { position: relative; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.acrylBlendsGraphCanvas { width: 100%; height: max(400px, calc(var(--bf-pane-h, 800px) - 400px)); min-width: 0; border: 1px solid var(--bf-border-2); border-radius: 8px; background: var(--bf-bg); }
.acrylBlendsGraphSide { display: contents; font-size: 12px; }
.acrylBlendsGraphStage { position: relative; min-width: 0; }
.acrylBlendsGraphZoom { position: absolute; left: 10px; bottom: 10px; z-index: 2; display: flex; flex-direction: column; gap: 4px; }
.acrylBlendsGraphZoom .acrylBlendsGraphButton { width: 30px; height: 30px; padding: 0; font-size: 18px; line-height: 1; background: var(--bf-surface); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.acrylBlendsGraphCard, .acrylBlendsGraphStrip { border: 1px solid var(--bf-border-2); border-radius: 8px; padding: 10px; background: var(--bf-surface); overflow: auto; font-size: 12px; }
.acrylBlendsGraphCard { position: absolute; top: 8px; right: 8px; width: 250px; max-height: 384px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); }
.acrylBlendsGraphStrip { max-height: 140px; }
.acrylBlendsGraph[data-strip="open"] .acrylBlendsGraphStrip { min-height: 120px; }
.acrylBlendsGraphStripHead { display: flex; align-items: center; gap: 6px; width: 100%; padding: 0; border: 0; background: transparent; color: var(--bf-dim); font: inherit; font-size: 11px; cursor: pointer; text-align: left; }
.acrylBlendsGraphStripHead:hover { color: var(--bf-strong); }
.acrylBlendsGraphCardHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.acrylBlendsGraphCardTab { position: absolute; top: 8px; right: 8px; background: var(--bf-surface); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acrylBlendsGraphCard b { color: var(--bf-strong); word-break: break-word; }
.acrylBlendsGraphCard dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 8px 0; }
.acrylBlendsGraphCard dt { color: var(--bf-dim); }
.acrylBlendsGraphCard dd { margin: 0; word-break: break-word; }
.acrylBlendsGraph h4 { margin: 10px 0 3px; font-size: 11px; font-weight: 500; color: var(--bf-dim); text-transform: none; }
.acrylBlendsGraph ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 2px; }
.acrylBlendsGraph code { font-size: 11px; word-break: break-all; }
.acrylBlendsGraphSource { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.acrylBlendsGraphPath { color: var(--bf-text); }
.acrylBlendsGraphActions { display: flex; gap: 6px; }
.acrylBlendsGraphLink { border: 0; background: transparent; padding: 0; color: var(--bf-link); cursor: pointer; font: inherit; text-align: left; }
.acrylBlendsGraphLink:hover { text-decoration: underline; }
.acrylBlendsGraphWarn { color: var(--bf-warn); }
.acrylBlendsGraphStrip h4 { margin-top: 6px; }
/* Full screen: the picture is the window, and everything else lies over it. */
.acrylBlendsGraph[data-fullscreen] { position: fixed; inset: 0; z-index: 2000; min-height: 0; gap: 0; background: var(--bf-bg); color: var(--bf-text); padding: 0; margin: 0; }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphBody { position: absolute; inset: 0; display: block; gap: 0; }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphStage { display: contents; }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphZoom { position: absolute; left: 14px; bottom: 56px; }
.acrylBlendsGraph[data-fullscreen][data-strip="open"] .acrylBlendsGraphZoom { bottom: 148px; }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphCanvas { position: absolute; inset: 0; width: auto; height: auto; border: 0; border-radius: 0; }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphChrome { position: absolute; top: 8px; left: 8px; z-index: 2; max-width: calc(100% - 16px); padding: 8px 10px; border: 1px solid var(--bf-border-2); border-radius: 8px; background: color-mix(in srgb, var(--bf-surface) 92%, transparent); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
.acrylBlendsGraph[data-fullscreen][data-card="open"] .acrylBlendsGraphChrome { max-width: calc(100% - 290px); }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphCard { z-index: 3; top: 8px; right: 8px; bottom: auto; width: 270px; max-height: calc(100% - 28px - 140px); }
.acrylBlendsGraph[data-fullscreen][data-strip="closed"] .acrylBlendsGraphCard { max-height: calc(100% - 28px - 44px); }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphCardTab { z-index: 3; }
.acrylBlendsGraph[data-fullscreen] .acrylBlendsGraphStrip { position: absolute; z-index: 2; left: 8px; right: 8px; bottom: 8px; max-height: 128px; min-height: 0; background: color-mix(in srgb, var(--bf-surface) 94%, transparent); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
.acrylBlendsGraph[data-fullscreen][data-strip="closed"] .acrylBlendsGraphStrip { padding: 6px 10px; }
/* The pane's height for the picture: the Settings window (800px or less) or, when that is full screen, the whole window. */
body { --bf-pane-h: min(800px, calc(100vh - 48px)); }
body[data-bf-settings-full] { --bf-pane-h: calc(100vh - 24px); }
.acrylBlendsGraphStrip li[data-pulse="up"] { list-style-color: var(--bf-ok); }
.acrylBlendsGraphStrip li[data-pulse="error"] .acrylBlendsGraphLink { color: var(--bf-error); }
.acrylBlendsGraphStrip li[data-pulse="down"] .acrylBlendsGraphLink { color: var(--bf-dim); }
`

/** Add the styles once; returns the removal. */
export function installGraphStyles(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  ;(document.head ?? document.documentElement).appendChild(style)
  return () => { style.remove() }
}
