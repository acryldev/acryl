const WORKSPACE_STYLES = `
.dshWorkspace { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; height: 100%; background: var(--dsw-alias-bg-base); }
.dshWorkspaceTabstrip { display: flex; align-items: stretch; min-height: 36px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, black); -webkit-app-region: no-drag; }
.dshWorkspaceTabs { display: flex; flex: 1; min-width: 0; overflow-x: auto; }
.dshWorkspaceTab { display: flex; align-items: stretch; max-width: 220px; min-width: 88px; border-right: 1px solid var(--dsw-alias-border-l2); background: transparent; }
.dshWorkspaceTab[data-active] { background: var(--dsw-alias-bg-base); }
.dshWorkspaceTabButton { appearance: none; display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; margin: 0; padding: 0 4px 0 10px; border: 0; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 12px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceTab[data-active] .dshWorkspaceTabButton { color: var(--dsw-alias-fg); }
.dshWorkspaceTabGlyph { flex: none; opacity: 0.7; }
.dshWorkspaceTabLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceTabClose { appearance: none; width: 22px; margin: 6px 6px 6px 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font-size: 14px; }
.dshWorkspaceTabClose:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshWorkspacePlusWrap { position: relative; flex: none; display: flex; align-items: center; padding: 0 6px; }
.dshWorkspacePlus { appearance: none; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 600 18px/1 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspacePlus:hover, .dshWorkspacePlus[aria-expanded="true"] { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceMenu { position: absolute; top: calc(100% + 4px); right: 4px; z-index: 40; width: 240px; max-height: min(70vh, 520px); overflow: auto; padding: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); box-shadow: 0 16px 40px rgb(0 0 0 / 28%); }
.dshWorkspaceMenuItem { appearance: none; display: block; width: 100%; margin: 0; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; text-align: left; font: 13px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceMenuItem:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceMenuRule { height: 1px; margin: 6px 4px; background: var(--dsw-alias-border-l2); }
.dshWorkspaceStage { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); }
.dshWorkspaceChat, .dshWorkspacePty, .dshWorkspaceFile, .dshWorkspaceBrowser, .dshWorkspaceDiff, .dshWorkspaceKanban, .dshWorkspaceDoc { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.dshWorkspaceEmpty { display: grid; place-items: center; flex: 1; color: var(--dsw-alias-fg-l2); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspacePtyToolbar, .dshWorkspaceBrowserBar { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.dshWorkspacePtyName { font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspacePtyStatus { margin-left: auto; font: 11px/1 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg-l2); }
.dshWorkspaceXterm { position: relative; flex: 1; min-width: 0; min-height: 0; padding: 8px 10px; overflow: hidden; background: #0b0d12; }
.dshWorkspacePtyError { position: absolute; inset: 50% auto auto 50%; translate: -50% -50%; max-width: min(520px, 80%); color: #fca5a5; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceXterm .xterm { position: relative; width: 100%; height: 100%; cursor: text; user-select: none; }
.dshWorkspaceXterm .xterm.focus, .dshWorkspaceXterm .xterm:focus { outline: none; }
.dshWorkspaceXterm .xterm-helpers { position: absolute; top: 0; z-index: 5; }
.dshWorkspaceXterm .xterm-helper-textarea { position: absolute; z-index: -5; top: 0; left: -9999em; width: 0; height: 0; margin: 0; padding: 0; overflow: hidden; border: 0; opacity: 0; resize: none; white-space: nowrap; }
.dshWorkspaceXterm .composition-view { position: absolute; z-index: 1; display: none; color: white; background: black; white-space: nowrap; }
.dshWorkspaceXterm .composition-view.active { display: block; }
.dshWorkspaceXterm .xterm-viewport { position: absolute; inset: 0; overflow-y: scroll; cursor: default; background: #0b0d12; }
.dshWorkspaceXterm .xterm-screen { position: relative; }
.dshWorkspaceXterm .xterm-screen canvas { position: absolute; top: 0; left: 0; }
.dshWorkspaceXterm .xterm-scroll-area { visibility: hidden; }
.dshWorkspaceXterm .xterm-char-measure-element { position: absolute; top: 0; left: -9999em; display: inline-block; visibility: hidden; line-height: normal; }
.dshWorkspaceXterm .xterm.enable-mouse-events { cursor: default; }
.dshWorkspaceXterm .xterm-cursor-pointer { cursor: pointer; }
.dshWorkspaceXterm .xterm-accessibility:not(.debug), .dshWorkspaceXterm .xterm-message { position: absolute; z-index: 10; inset: 0; color: transparent; pointer-events: none; }
.dshWorkspaceXterm .xterm-accessibility-tree { user-select: text; white-space: pre; }
.dshWorkspaceXterm .live-region { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.dshWorkspaceFile input, .dshWorkspaceFile textarea, .dshWorkspaceBrowserBar input { flex: 1; min-width: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceFile { gap: 0; }
.dshWorkspaceFile input { padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); border-radius: 0; }
.dshWorkspaceFile textarea { flex: 1; padding: 12px 14px; resize: none; }
.dshWorkspaceBrowserBar input { border: 1px solid var(--dsw-alias-border-l2); padding: 6px 8px; }
.dshWorkspaceBrowserBar button { appearance: none; padding: 4px 10px; border: 0; border-radius: 6px; background: #4d6bfe; color: white; cursor: pointer; font: 12px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceBrowserFrame { flex: 1; width: 100%; border: 0; background: white; }
.dshWorkspaceDiff { flex-direction: row !important; gap: 0; }
.dshWorkspaceDiffInputs { display: flex; flex-direction: column; flex: 1; min-width: 0; border-right: 1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceDiffInputs textarea { flex: 1; min-height: 0; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-fg); resize: none; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDiffInputs textarea:last-child { border-bottom: 0; }
.dshWorkspaceDiffOutput { flex: 1; min-width: 0; overflow: auto; padding: 4px 0; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDiffLine { display: flex; gap: 8px; padding: 0 10px; white-space: pre-wrap; word-break: break-word; }
.dshWorkspaceDiffLine[data-diff-kind="add"] { background: color-mix(in srgb, #22c55e 14%, transparent); color: #86efac; }
.dshWorkspaceDiffLine[data-diff-kind="remove"] { background: color-mix(in srgb, #ef4444 14%, transparent); color: #fca5a5; }
.dshWorkspaceDiffMarker { flex: none; opacity: 0.7; width: 1ch; }
.dshWorkspaceKanban { flex-direction: row !important; gap: 10px; padding: 12px; overflow-x: auto; }
.dshWorkspaceKanbanColumn { display: flex; flex-direction: column; flex: 1; min-width: 200px; max-width: 320px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 96%, white); }
.dshWorkspaceKanbanColumnTitle { padding: 10px 12px 6px; font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspaceKanbanCards { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 40px; padding: 0 10px; overflow-y: auto; }
.dshWorkspaceKanbanCard { padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-fg); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; cursor: grab; }
.dshWorkspaceKanbanAdd { padding: 8px 10px; }
.dshWorkspaceKanbanAdd input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceDoc { flex-direction: row !important; gap: 0; }
.dshWorkspaceDocEditor { flex: 1; min-width: 0; padding: 12px 14px; border: 0; border-right: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-fg); resize: none; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDocPreview { flex: 1; min-width: 0; overflow: auto; padding: 14px 18px; color: var(--dsw-alias-fg); font: 13px/1.6 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceDocHeading { margin: 0.6em 0 0.3em; font-weight: 700; }
.dshWorkspaceDocList { margin: 0.3em 0; padding-left: 1.4em; }
.dshWorkspaceDocParagraph { margin: 0.3em 0; }
`

/** Install styles owned by one Workspace Client Fiber. */
export function installWorkspaceStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'acryl-workspace'
  style.textContent = WORKSPACE_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
