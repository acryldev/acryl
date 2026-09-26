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
/* One opener only: the canvas tab strip carries the always-present right-panel toggle, so upstream's own
   header opener (a documented data hook of the right sidebar) is hidden inside the canvas. */
.dshWorkspace [data-sidebar-right-expand] { display: none; }
.dshWorkspaceRightToggle { appearance: none; align-self: center; flex: none; width: 28px; height: 28px; margin: 0 8px 0 2px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; display: grid; place-items: center; }
.dshWorkspaceRightToggle:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshWorkspacePlusWrap { position: relative; flex: none; display: flex; align-items: center; padding: 0 6px; }
.dshWorkspacePlus { appearance: none; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 600 18px/1 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspacePlus:hover, .dshWorkspacePlus[aria-expanded="true"] { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceMenu { position: absolute; top: calc(100% + 4px); right: 4px; z-index: 40; width: 240px; max-height: min(70vh, 520px); overflow: auto; padding: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); box-shadow: 0 16px 40px rgb(0 0 0 / 28%); }
.dshWorkspaceMenuItem { appearance: none; display: block; width: 100%; margin: 0; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; text-align: left; font: 13px/1.2 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceMenuItem:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceMenuRule { height: 1px; margin: 6px 4px; background: var(--dsw-alias-border-l2); }
.dshWorkspaceStage { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: row; background: var(--dsw-alias-bg-base); }
.dshWorkspacePane { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.dshWorkspaceStage[data-split] > .dshWorkspacePane[data-pane="split"] { flex: 1 1 0; }
.dshWorkspaceDivider { flex: none; position: relative; width: 1px; background: var(--dsw-alias-border-l1); cursor: col-resize; touch-action: none; }
.dshWorkspaceDivider::before { content: ''; position: absolute; inset: 0 -4px; }
.dshWorkspaceDivider:hover, .dshWorkspaceDivider:focus-visible { background: #4d6bfe; outline: none; }
.dshWorkspaceDivider:hover::after, .dshWorkspaceDivider:focus-visible::after { content: ''; position: absolute; inset: 0 -1px; background: #4d6bfe; }
.dshWorkspaceSplitHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-base) 92%, black); font: 12px/1 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspaceSplitTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceSplitClose { appearance: none; width: 22px; height: 22px; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font-size: 14px; }
.dshWorkspaceSplitClose:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshWorkspaceTabSplit { appearance: none; width: 22px; margin: 6px 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font-size: 13px; opacity: 0; }
.dshWorkspaceTab:hover .dshWorkspaceTabSplit, .dshWorkspaceTab[data-split] .dshWorkspaceTabSplit, .dshWorkspaceTabSplit:focus-visible { opacity: 1; }
.dshWorkspaceTab[data-split] { box-shadow: inset 0 -2px 0 #a5b4fc; }
.dshWorkspaceChat, .dshWorkspacePty, .dshWorkspaceFile, .dshWorkspaceBrowser, .dshWorkspaceDiff, .dshWorkspaceKanban, .dshWorkspaceDoc { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
/* The conversation is built to fill a flex-column parent (its root is flex: 1; min-height: 0). The frame wraps it in a plain div, so make that wrapper fill the Chat tile with a bounded height; otherwise the message list grows to its content, is clipped, and cannot scroll. */
.dshWorkspaceChat > [data-acryl-slot="conversation"] { display: flex; flex: 1 1 0; flex-direction: column; min-height: 0; min-width: 0; }
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
.dshWorkspaceKanbanCount { margin-left: 4px; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg-l2); font-weight: 500; }
.dshWorkspaceKanbanEmpty { padding: 6px 2px; color: var(--dsw-alias-fg-l2); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceKanbanSessionCard { appearance: none; display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; cursor: pointer; color: var(--dsw-alias-fg); }
.dshWorkspaceKanbanSessionCard:hover { border-color: #4d6bfe; }
.dshWorkspaceKanbanSessionCard[data-running] { border-color: color-mix(in srgb, #4d6bfe 60%, transparent); }
.dshWorkspaceKanbanBranch { font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceKanbanMeta { color: var(--dsw-alias-fg-l2); font: 11px/1.3 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceKanbanAdd { padding: 8px 10px; }
.dshWorkspaceKanbanAdd input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceDoc { flex-direction: row !important; gap: 0; }
.dshWorkspaceDocEditor { flex: 1; min-width: 0; padding: 12px 14px; border: 0; border-right: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-fg); resize: none; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDocPreview { flex: 1; min-width: 0; overflow: auto; padding: 14px 18px; color: var(--dsw-alias-fg); font: 13px/1.6 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceDocHeading { margin: 0.6em 0 0.3em; font-weight: 700; }
.dshWorkspaceDocList { margin: 0.3em 0; padding-left: 1.4em; }
.dshWorkspaceDocParagraph { margin: 0.3em 0; }
.dshWorkspaceSide { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
.dshWorkspaceSideSwitch { display: flex; gap: 6px; margin: 14px 16px 10px; flex: none; }
.dshWorkspaceSideSwitch button { appearance: none; flex: 1; padding: 6px 12px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 500 13px/1.3 ui-sans-serif, system-ui, sans-serif; transition: border-color .12s, background-color .12s, color .12s; }
.dshWorkspaceSideSwitch button:hover { border-color: color-mix(in srgb, var(--dsw-alias-fg) 22%, transparent); color: var(--dsw-alias-fg); }
.dshWorkspaceSideSwitch button[aria-selected="true"] { border-color: color-mix(in srgb, var(--dsw-alias-fg) 34%, transparent); background: color-mix(in srgb, var(--dsw-alias-fg) 10%, transparent); color: var(--dsw-alias-fg); }
.dshWorkspaceSideSwitch button:focus-visible { outline: 2px solid #4d6bfe; outline-offset: 1px; }
/* macOS: the window's traffic-light buttons sit in the top-left; keep the switch clear of them. */
.dshDesktopFrame[data-desktop-platform="darwin"] .dshWorkspaceSideSwitch { margin-top: 26px; }
.dshWorkspaceSideChats { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dshWorkspaceSideChats > * { flex: 1 1 0; min-height: 0; min-width: 0; }
.dshWorkspaceSideChats[hidden] { display: none; }
.dshWorkspaceSideProjects { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px; }
.dshWorkspaceSideProjectsHead { display: flex; align-items: center; justify-content: space-between; padding: 2px 8px 4px; color: var(--dsw-alias-fg-l2); font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.dshWorkspaceSideAdd { appearance: none; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 500 18px/1 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceSideAdd:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceSideHint { margin: 4px 8px; padding: 6px 8px; border-left: 2px solid #4d6bfe; color: var(--dsw-alias-fg-l2); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceSideNotice { margin: 4px 8px; padding: 6px 8px; border-left: 2px solid #f87171; color: #fca5a5; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceSideEmpty { padding: 12px 6px; color: var(--dsw-alias-fg-l2); font: 12px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceRepo { margin: 6px 0 10px; }
.dshWorkspaceRepoHead { display: flex; align-items: center; justify-content: space-between; }
.dshWorkspaceNewBranch { display: flex; gap: 6px; margin: 2px 8px 6px; }
.dshWorkspaceNewBranch input { flex: 1; min-width: 0; box-sizing: border-box; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceNewBranch button { appearance: none; padding: 4px 10px; border: 0; border-radius: 6px; background: #4d6bfe; color: #fff; cursor: pointer; font: 12px/1.3 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceNewBranch button:disabled { opacity: .5; cursor: default; }
.dshWorkspaceWorktreeItem { position: relative; display: flex; align-items: center; }
.dshWorkspaceWorktreeItem > .dshWorkspaceWorktree { flex: 1; min-width: 0; }
.dshWorkspaceWorktreeNew { appearance: none; position: absolute; right: 4px; width: 22px; height: 22px; border: 0; border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-fg); opacity: 0; cursor: pointer; font: 500 16px/1 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceWorktreeItem:hover > .dshWorkspaceWorktreeNew, .dshWorkspaceWorktreeNew:focus-visible { opacity: 1; }
.dshWorkspaceWorktreeNew:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 12%)); }
.dshWorkspaceSideFoot { margin-top: 14px; padding: 8px 8px 0; border-top: 1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceSideFootButton { appearance: none; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 13px/1.3 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceSideFootButton:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshWorkspaceRepoName { margin: 0; padding: 4px 8px; color: var(--dsw-alias-fg-l2); font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.dshWorkspaceWorktrees { list-style: none; margin: 0; padding: 0; }
.dshWorkspaceWorktree { appearance: none; display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; text-align: left; font: 13px/1.3 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceWorktree:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceWorktree[aria-pressed="true"] { background: color-mix(in srgb, #4d6bfe 18%, transparent); box-shadow: inset 2px 0 0 #4d6bfe; }
.dshWorkspaceWorktreeLabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceWorktreeSessions { flex: none; min-width: 16px; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-fg) 12%, transparent); color: var(--dsw-alias-fg-l2); font: 600 10px/16px ui-sans-serif, system-ui, sans-serif; text-align: center; }
.dshWorkspaceWorktreeStat { flex: none; color: var(--dsw-alias-fg-l2); font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceWorktreeStat [data-kind="add"] { color: #4ade80; }
.dshWorkspaceWorktreeStat [data-kind="remove"] { color: #f87171; }
.dshWorkspaceDot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #6b7280; }
.dshWorkspaceDot[data-dot="running"] { background: #4d6bfe; animation: dshWorkspacePulse 1.6s ease-in-out infinite; }
.dshWorkspaceDot[data-dot="done"] { background: #4ade80; }
.dshWorkspaceDot[data-dot="dirty"] { background: #f5b942; }
.dshWorkspaceDot[data-dot="clean"] { background: color-mix(in srgb, #4ade80 55%, transparent); }
.dshWorkspaceDot[data-dot="error"] { background: #f87171; }
.dshWorkspaceDot[data-dot="loading"] { background: #6b7280; opacity: .5; }
@keyframes dshWorkspacePulse { 50% { opacity: .35; } }
.dshWorkspaceChanges { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow-y: auto; color: var(--dsw-alias-fg); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceChangesHead { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.dshWorkspaceChangesTitle { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dshWorkspaceChangesTitle strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceChangesPath { color: var(--dsw-alias-fg-l2); font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.dshWorkspaceThreadList { list-style: none; margin: 0; padding: 4px 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.dshWorkspaceThread { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspaceThread[data-resolved] { opacity: .6; }
.dshWorkspaceThreadWhere { appearance: none; align-self: flex-start; padding: 0; border: 0; background: transparent; color: #4d6bfe; cursor: pointer; font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceThreadWhere:hover { text-decoration: underline; }
.dshWorkspaceThreadSide { margin-left: 6px; color: var(--dsw-alias-fg-l2); font-weight: 400; }
.dshWorkspaceThreadLine { overflow: hidden; text-overflow: ellipsis; white-space: pre; padding: 2px 6px; border-radius: 4px; background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 6%)); font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceThreadText { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.dshWorkspaceThreadActions { display: flex; gap: 6px; }
.dshWorkspaceThreadActions button { appearance: none; padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 11px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceThreadActions button:hover { border-color: color-mix(in srgb, var(--dsw-alias-fg) 30%, transparent); color: var(--dsw-alias-fg); }
.dshWorkspaceCheckList { list-style: none; margin: 0; padding: 4px 8px 12px; display: flex; flex-direction: column; gap: 4px; }
.dshWorkspaceCheck { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspaceCheck[data-primary] { border-color: color-mix(in srgb, #4d6bfe 45%, transparent); }
.dshWorkspaceCheckText { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dshWorkspaceCheckName { font-weight: 600; }
.dshWorkspaceCheckCommand { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-fg-l2); font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceCheckRun { appearance: none; flex: none; padding: 3px 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-fg) 30%, transparent); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceCheckRun:hover { border-color: #4d6bfe; color: #4d6bfe; }
.dshWorkspaceFilesFilter { margin: 4px 8px 6px; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceFilesFilter:focus { outline: 2px solid #4d6bfe; outline-offset: -1px; }
.dshWorkspaceFilesSearch { display: flex; align-items: center; gap: 4px; }
.dshWorkspaceFilesSearch .dshWorkspaceFilesFilter { flex: 1; min-width: 0; }
.dshWorkspaceFilesSearchMode { display: flex; margin-right: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; overflow: hidden; }
.dshWorkspaceFilesSearchMode button { border: 0; background: transparent; color: var(--dsw-alias-fg); padding: 4px 8px; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
.dshWorkspaceFilesSearchMode button[aria-pressed="true"] { background: #4d6bfe; color: #fff; }
.dshWorkspaceFilesResults { overflow: auto; min-height: 0; flex: 1; }
.dshWorkspaceSearchHits { list-style: none; margin: 0; padding: 0; }
.dshWorkspaceSearchHit { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; padding: 4px 10px; border: 0; background: transparent; color: var(--dsw-alias-fg); text-align: left; cursor: pointer; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceSearchHit:hover { background: var(--dsw-alias-bg-hover, rgba(127,127,127,.12)); }
.dshWorkspaceSearchFile { font-weight: 600; overflow-wrap: anywhere; }
.dshWorkspaceSearchText { opacity: .7; font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
.dshWorkspaceFileTree { list-style: none; margin: 0; padding: 0 0 12px; }
.dshWorkspaceFileRow { appearance: none; display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 8px; border: 0; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; text-align: left; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceFileRow:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceFileGlyph { width: 10px; flex: none; color: var(--dsw-alias-fg-l2); }
.dshWorkspaceFileName { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceFileHint { color: var(--dsw-alias-fg-l2); font-size: 10.5px; }
.dshWorkspaceFileHint[data-error] { color: #f87171; }
.dshWorkspaceFileItem { position: relative; display: flex; align-items: center; }
.dshWorkspaceFileItem > .dshWorkspaceFileRow { flex: 1; min-width: 0; }
.dshWorkspaceFilePreview { appearance: none; flex: none; margin-right: 8px; padding: 1px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 10.5px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceFilePreview:hover { border-color: #4d6bfe; color: #4d6bfe; }
.dshWorkspaceDocFile { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.dshWorkspaceDocFileBody { flex: 1; min-height: 0; overflow: auto; padding: 16px 24px; }
.dshWorkspaceDocCode { padding: 1px 5px; border-radius: 4px; background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); font: 0.92em ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDocPre { overflow: auto; margin: 8px 0; padding: 10px 12px; border-radius: 8px; background: #0b0d12; color: #d7e0ea; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDocQuote { margin: 8px 0; padding: 2px 12px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-fg-l2); }
.dshWorkspaceDocRule { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); margin: 14px 0; }
.dshWorkspaceDocTable { border-collapse: collapse; margin: 8px 0; font: 12.5px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceDocTable th, .dshWorkspaceDocTable td { padding: 5px 10px; border: 1px solid var(--dsw-alias-border-l1); text-align: left; vertical-align: top; }
.dshWorkspaceDocTable th { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 6%)); }
.dshWorkspaceFileItem { position: relative; display: flex; align-items: center; }
.dshWorkspaceFileItem > .dshWorkspaceFileRow { flex: 1; min-width: 0; }
.dshWorkspaceFilePreview { appearance: none; flex: none; margin-right: 8px; padding: 1px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 10.5px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceFilePreview:hover { border-color: #4d6bfe; color: #4d6bfe; }
.dshWorkspaceDocFile { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.dshWorkspaceDocFileBody { flex: 1; min-height: 0; overflow: auto; padding: 16px 24px; }
.dshWorkspaceDocCode { padding: 1px 5px; border-radius: 4px; background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); font: 0.92em ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDocPre { overflow: auto; margin: 8px 0; padding: 10px 12px; border-radius: 8px; background: #0b0d12; color: #d7e0ea; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceDocQuote { margin: 8px 0; padding: 2px 12px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-fg-l2); }
.dshWorkspaceDocRule { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); margin: 14px 0; }
.dshWorkspaceDocTable { border-collapse: collapse; margin: 8px 0; font: 12.5px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceDocTable th, .dshWorkspaceDocTable td { padding: 5px 10px; border: 1px solid var(--dsw-alias-border-l1); text-align: left; vertical-align: top; }
.dshWorkspaceDocTable th { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 6%)); }
.dshWorkspaceEditor { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.dshWorkspaceEditorBar { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 0 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); font: 12px/1.3 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspaceEditorPath { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceEditorStatus { color: var(--dsw-alias-fg-l2); }
.dshWorkspaceEditorStatus[data-kind="error"], .dshWorkspaceEditorStatus[data-kind="conflict"] { color: #f87171; }
.dshWorkspaceEditorStatus[data-kind="saved"] { color: #4ade80; }
.dshWorkspaceEditorButton { appearance: none; padding: 3px 14px; border: 1px solid color-mix(in srgb, var(--dsw-alias-fg) 30%, transparent); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceEditorButton:hover:not(:disabled) { border-color: #4d6bfe; color: #4d6bfe; }
.dshWorkspaceEditorButton:disabled { opacity: .5; cursor: default; }
.dshWorkspaceEditorBanner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; background: color-mix(in srgb, #f5b942 16%, transparent); border-bottom: 1px solid var(--dsw-alias-border-l1); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--dsw-alias-fg); }
.dshWorkspaceEditorBanner button { appearance: none; padding: 2px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 11px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceCodeEditor { flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.dshWorkspaceCodeEditor .cm-editor { height: 100%; }
.dshWorkspaceChangeItem { display: flex; align-items: center; }
.dshWorkspaceChangeItem > .dshWorkspaceChange { flex: 1; min-width: 0; }
.dshWorkspaceChangeStage { appearance: none; flex: none; width: 22px; height: 22px; margin: 0 4px 0 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 600 14px/1 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceChangeStage:hover:not(:disabled) { border-color: #4d6bfe; color: #4d6bfe; }
.dshWorkspaceChangeStage:disabled, .dshWorkspaceChangesAll:disabled { opacity: .5; cursor: default; }
.dshWorkspaceChangesAll { appearance: none; margin-right: 4px; padding: 2px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 11px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceChangesAll:hover:not(:disabled) { border-color: #4d6bfe; color: #4d6bfe; }
.dshWorkspaceCommit { display: flex; flex-direction: column; gap: 6px; margin: 8px; padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; }
.dshWorkspaceCommit textarea { resize: vertical; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceCommit textarea:focus { outline: 2px solid #4d6bfe; outline-offset: -1px; }
.dshWorkspaceCommitButton { appearance: none; padding: 5px 12px; border: 1px solid #4d6bfe; border-radius: 999px; background: #4d6bfe; color: #fff; cursor: pointer; font: 600 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceCommitButton:disabled { opacity: .45; cursor: default; }
.dshWorkspaceCommitOk { margin: 0; color: #4ade80; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; overflow-wrap: anywhere; }
.dshWorkspaceChangesMeta { color: var(--dsw-alias-fg-l2); font-size: 11px; }
.dshWorkspaceChangesRefresh { appearance: none; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font-size: 14px; }
.dshWorkspaceChangesRefresh:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshWorkspaceChangesEmpty, .dshWorkspaceChangesError { margin: 0; padding: 12px; color: var(--dsw-alias-fg-l2); font-size: 12px; }
.dshWorkspaceChangesError { color: #fca5a5; }
.dshWorkspaceChangeList { list-style: none; margin: 0; padding: 4px 6px 12px; }
.dshWorkspaceChange { appearance: none; display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 6px; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }
.dshWorkspaceChange:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); }
.dshWorkspaceChangeCode { flex: none; width: 14px; font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.dshWorkspaceChangeCode[data-code="M"] { color: #f5b942; }
.dshWorkspaceChangeCode[data-code="A"], .dshWorkspaceChangeCode[data-code="?"] { color: #4ade80; }
.dshWorkspaceChangeCode[data-code="D"], .dshWorkspaceChangeCode[data-code="U"] { color: #f87171; }
.dshWorkspaceChangeCode[data-code="R"] { color: #60a5fa; }
.dshWorkspaceChangePath { flex: 1; min-width: 0; display: flex; gap: 6px; align-items: baseline; overflow: hidden; }
.dshWorkspaceChangeName { flex: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshWorkspaceChangeDir { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-fg-l2); font-size: 11px; direction: rtl; text-align: left; }
.dshWorkspaceChangeStaged { flex: none; padding: 0 4px; border-radius: 4px; background: color-mix(in srgb, #4d6bfe 25%, transparent); color: #a5b4fc; font: 700 9px/14px ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceChangeStat { flex: none; color: var(--dsw-alias-fg-l2); font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceChangeStat [data-kind="add"] { color: #4ade80; }
.dshWorkspaceChangeStat [data-kind="remove"] { color: #f87171; }
.dshWorkspaceGroup { display: flex; align-items: center; gap: 6px; flex: none; max-width: 200px; padding: 0 12px; border-right: 1px solid var(--dsw-alias-border-l2); color: #a5b4fc; font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshWorkspaceGitDiff { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.dshWorkspaceGitDiffBar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceGitDiffFile { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-fg); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceGitDiffCounts { flex: none; font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceGitDiffCounts [data-kind="add"] { color: #4ade80; }
.dshWorkspaceGitDiffCounts [data-kind="remove"] { color: #f87171; }
.dshWorkspaceGitDiffRefresh { appearance: none; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font-size: 14px; }
.dshWorkspaceGitDiffRefresh:hover { background: var(--dsw-alias-fill-hover, rgb(255 255 255 / 8%)); color: var(--dsw-alias-fg); }
.dshWorkspaceGitDiffBody { flex: 1; min-height: 0; overflow: auto; padding: 4px 0; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dshWorkspaceGitDiffNote { margin: 0; padding: 10px 14px; color: var(--dsw-alias-fg-l2); font: 12px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceGitDiffNote[data-tone="error"] { color: #fca5a5; }
.dshWorkspaceGitDiffLine { display: flex; min-width: max-content; white-space: pre; }
.dshWorkspaceGitDiffLine[data-kind="add"] { background: color-mix(in srgb, #22c55e 14%, transparent); }
.dshWorkspaceGitDiffLine[data-kind="remove"] { background: color-mix(in srgb, #ef4444 14%, transparent); }
.dshWorkspaceGitDiffLine[data-kind="hunk"] { background: color-mix(in srgb, #4d6bfe 12%, transparent); color: #a5b4fc; }
.dshWorkspaceGitDiffLayout { display: inline-flex; flex: none; gap: 4px; }
.dshWorkspaceGitDiffLayout button { appearance: none; padding: 2px 10px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 11px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceGitDiffLayout button:hover { border-color: color-mix(in srgb, var(--dsw-alias-fg) 22%, transparent); }
.dshWorkspaceGitDiffLayout button[aria-pressed="true"] { border-color: color-mix(in srgb, var(--dsw-alias-fg) 34%, transparent); background: color-mix(in srgb, var(--dsw-alias-fg) 10%, transparent); color: var(--dsw-alias-fg); }
.dshWorkspaceGitDiffLine[data-selected], .dshWorkspaceGitDiffCell[data-selected] { outline: 1px solid #4d6bfe; outline-offset: -1px; background-image: linear-gradient(color-mix(in srgb, #4d6bfe 16%, transparent), color-mix(in srgb, #4d6bfe 16%, transparent)); }
.dshWorkspaceGitDiffPair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-width: 0; }
.dshWorkspaceGitDiffCell { display: flex; min-width: 0; white-space: pre; overflow: hidden; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshWorkspaceGitDiffCell:last-child { border-right: 0; }
.dshWorkspaceGitDiffCell[data-kind="add"] { background: color-mix(in srgb, #22c55e 14%, transparent); }
.dshWorkspaceGitDiffCell[data-kind="remove"] { background: color-mix(in srgb, #ef4444 14%, transparent); }
.dshWorkspaceGitDiffCell[data-kind="empty"] { background: color-mix(in srgb, var(--dsw-alias-fg) 4%, transparent); }
.dshWorkspaceGitDiffCell[data-kind="add"] .dshWorkspaceGitDiffText, .dshWorkspaceGitDiffCell[data-kind="add"] .dshWorkspaceGitDiffMarker { color: #86efac; }
.dshWorkspaceGitDiffCell[data-kind="remove"] .dshWorkspaceGitDiffText, .dshWorkspaceGitDiffCell[data-kind="remove"] .dshWorkspaceGitDiffMarker { color: #fca5a5; }
.dshWorkspaceGitDiffNo { flex: none; width: 4.5ch; padding-right: 1ch; text-align: right; color: var(--dsw-alias-fg-l2); opacity: .7; user-select: none; }
.dshWorkspaceGitDiffMarker { flex: none; width: 2ch; text-align: center; user-select: none; }
.dshWorkspaceGitDiffLine[data-kind="add"] .dshWorkspaceGitDiffMarker, .dshWorkspaceGitDiffLine[data-kind="add"] .dshWorkspaceGitDiffText { color: #86efac; }
.dshWorkspaceGitDiffLine[data-kind="remove"] .dshWorkspaceGitDiffMarker, .dshWorkspaceGitDiffLine[data-kind="remove"] .dshWorkspaceGitDiffText { color: #fca5a5; }
.dshWorkspaceGitDiffText { flex: 1; padding-right: 16px; }
.dshWorkspaceGitDiffAdd { flex: none; width: 20px; height: 18px; margin: 0; padding: 0; border: 0; background: transparent; color: transparent; font: 700 13px/18px ui-sans-serif, system-ui, sans-serif; text-align: center; cursor: pointer; }
.dshWorkspaceGitDiffLine:hover .dshWorkspaceGitDiffAdd { color: #a5b4fc; }
.dshWorkspaceGitDiffAdd:hover, .dshWorkspaceGitDiffAdd:focus-visible { background: #4d6bfe; color: #fff !important; border-radius: 4px; }
.dshWorkspaceGitDiffComposer { margin: 4px 12px 8px 36px; padding: 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-fg) 5%, transparent); font-family: ui-sans-serif, system-ui, sans-serif; white-space: normal; min-width: 0; max-width: 640px; }
.dshWorkspaceGitDiffComposer textarea { display: block; width: 100%; box-sizing: border-box; min-height: 56px; resize: vertical; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceGitDiffComposerActions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.dshWorkspaceGitDiffComposerActions button { appearance: none; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-fg); cursor: pointer; font: 12px/1.3 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceGitDiffComposerActions button[type="submit"] { border-color: #4d6bfe; background: #4d6bfe; color: #fff; }
.dshWorkspaceGitDiffComposerActions button:disabled { opacity: .5; cursor: default; }
.dshWorkspaceGitDiffComposerError { flex: 1; color: #fca5a5; font-size: 12px; }
.dshWorkspaceGitDiffSent { margin: 2px 12px 6px 36px; padding: 4px 8px; border-left: 2px solid #4ade80; color: var(--dsw-alias-fg-l2); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; white-space: normal; }
`

/** Install styles owned by one Workspace Client Fiber. */
export function installWorkspaceStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'acryl-workspace'
  style.textContent = WORKSPACE_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
