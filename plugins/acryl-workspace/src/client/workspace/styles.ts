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
.dshWorkspaceSide { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
.dshWorkspaceSideSwitch { display: flex; gap: 2px; margin: 8px 10px 4px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-fg) 7%, transparent); flex: none; }
.dshWorkspaceSideSwitch button { appearance: none; flex: 1; padding: 4px 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-fg-l2); cursor: pointer; font: 500 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceSideSwitch button[aria-selected="true"] { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-fg); box-shadow: 0 0 0 1px var(--dsw-alias-border-l2); }
.dshWorkspaceSideChats { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.dshWorkspaceSideChats > * { flex: 1 1 0; min-height: 0; min-width: 0; }
.dshWorkspaceSideChats[hidden] { display: none; }
.dshWorkspaceSideProjects { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px; }
.dshWorkspaceSideEmpty { padding: 12px 6px; color: var(--dsw-alias-fg-l2); font: 12px/1.5 ui-sans-serif, system-ui, sans-serif; }
.dshWorkspaceRepo { margin: 6px 0 10px; }
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
