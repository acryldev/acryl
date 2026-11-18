/** The frame's look, taken from the owner's mockup (docs/design/blends-frame-mockup.html): a dark workbench around the app's own light page. */

const STYLE_ID = 'acryl-blends-frame-styles'

const CSS = `
/* DSH's dialogs and menus on the frame's dark surface, and its active Settings section in the frame's accent: the mockup's Settings. */
html body[data-ds-dark-theme] { --dsw-alias-bg-layer-2: #18181b; --dsw-specific-sidebar-nav-item-active: rgba(84,104,255,.16); }
.acrylBlendsFrame, .acrylBlendsPlugins, .acrylBlendsApp {
  --bf-bg: #0b0b0d; --bf-side: #111113; --bf-surface: #18181b; --bf-surface-2: #222226; --bf-border: #2a2a2f; --bf-border-2: #34343a;
  --bf-text: #e8e8ea; --bf-text-2: #d4d4da; --bf-strong: #fff; --bf-dim: #8b8b93; --bf-faint: #77777f; --bf-toggle-off: #3a3a40;
  --bf-accent: #5468ff; --bf-accent-dim: rgba(84,104,255,.16); --bf-ok: #3fb67b; --bf-warn: #e0a43a; --bf-link: #8fb0ff;
  --bf-error: #f87171; --bf-error-text: #f1b4b4; --bf-error-border: #6b3a3a; --bf-warn-text: #f0d6a4; --bf-warn-text-2: #ecdcbc; --bf-warn-text-dim: #b9ad97; --bf-warn-border: #5a4a2a;
  --bf-tok-kw: #c678dd; --bf-tok-fn: #61afef; --bf-tok-st: #98c379; --bf-tok-ty: #e5c07b; --bf-tok-pu: #abb2bf; --bf-tok-va: #e06c75; --bf-tok-cm: #5c6370; --bf-tok-nu: #d19a66;
  --bf-lw: 248px; --bf-rw: 412px;
}
/* Light: DSH's theme presenter marks the body only while the theme is dark, so the frame follows the same switch (the top bar's button, Settings > General > Appearance, or the OS). */
body:not([data-ds-dark-theme]) .acrylBlendsFrame, body:not([data-ds-dark-theme]) .acrylBlendsPlugins {
  --bf-bg: #f4f4f6; --bf-side: #fafafb; --bf-surface: #ffffff; --bf-surface-2: #ececf0; --bf-border: #dcdce2; --bf-border-2: #cfcfd6;
  --bf-text: #18181b; --bf-text-2: #34343c; --bf-strong: #0b0b0d; --bf-dim: #62626b; --bf-faint: #8a8a93; --bf-toggle-off: #c4c4cc;
  --bf-accent: #4458f0; --bf-accent-dim: rgba(84,104,255,.12); --bf-ok: #1f8f5a; --bf-warn: #a8740f; --bf-link: #3a55d8;
  --bf-error: #c2342e; --bf-error-text: #9b2c2c; --bf-error-border: #e3b0b0; --bf-warn-text: #7a5a14; --bf-warn-text-2: #6b4f12; --bf-warn-text-dim: #8a7d63; --bf-warn-border: #d9b974;
  --bf-tok-kw: #a626a4; --bf-tok-fn: #4078f2; --bf-tok-st: #50a14f; --bf-tok-ty: #c18401; --bf-tok-pu: #383a42; --bf-tok-va: #e45649; --bf-tok-cm: #a0a1a7; --bf-tok-nu: #986801;
}
.acrylBlendsFrame {
  position: fixed; inset: 0; display: grid; grid-template-rows: 38px minmax(0, 1fr);
  background: var(--bf-bg); color: var(--bf-text); color-scheme: dark;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
body:not([data-ds-dark-theme]) .acrylBlendsFrame { color-scheme: light; }
.acrylBlendsFrame[data-left="closed"] { --bf-lw: 0px; }
.acrylBlendsFrame[data-right="closed"] { --bf-rw: 0px; }
.acrylBlendsFrame button { font: inherit; }
.acrylBlendsFrame *, .acrylBlendsFrame *::before, .acrylBlendsFrame *::after { box-sizing: border-box; }

.acrylBlendsBar { display: flex; align-items: center; gap: 10px; padding: 0 10px; border-bottom: 1px solid var(--bf-border); background: var(--bf-side); -webkit-app-region: drag; }
.acrylBlendsBar button { -webkit-app-region: no-drag; }
body[data-dsh-desktop-platform="darwin"] .acrylBlendsBar { padding-left: 78px; }
.acrylBlendsAppName { font-weight: 600; white-space: nowrap; }
.acrylBlendsAppName small { color: var(--bf-dim); font-weight: 400; margin-left: 6px; font-size: 12px; }
.acrylBlendsAppError { min-width: 0; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--bf-error); }
.acrylBlendsGrow { flex: 1; }
.acrylBlendsIconButton { width: 28px; height: 26px; display: grid; place-items: center; border-radius: 6px; border: 0; background: transparent; color: var(--bf-text-2); cursor: pointer; }
.acrylBlendsIconButton:hover:not(:disabled) { background: var(--bf-surface-2); }
.acrylBlendsIconButton[aria-pressed="true"] { color: var(--bf-strong); background: var(--bf-surface-2); }
.acrylBlendsIconButton:disabled { opacity: .4; cursor: default; }
.acrylBlendsIconButton svg { width: 16px; height: 16px; }
.acrylBlendsSettings { display: contents; }
.acrylBlendsModes { display: flex; border: 1px solid var(--bf-border); border-radius: 7px; overflow: hidden; }
.acrylBlendsModes button { font-size: 12px; padding: 3px 10px; border: 0; background: transparent; color: var(--bf-dim); cursor: pointer; }
.acrylBlendsModes button[aria-pressed="true"] { background: var(--bf-accent-dim); color: var(--bf-strong); }

.acrylBlendsBody { display: grid; grid-template-columns: var(--bf-lw) minmax(0, 1fr) var(--bf-rw); min-height: 0; position: relative; }
/* The panels' inner border is the resize area (owner, T009): nothing is drawn and there is no tooltip; a resize cursor on a few px over the border is
   the whole affordance, so grabbing it needs no aim at a line. */
.acrylBlendsGrip { position: absolute; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 4; }
.acrylBlendsGripLeft { left: calc(var(--bf-lw) - 3px); }
.acrylBlendsGripRight { left: calc(100% - var(--bf-rw) - 3px); }
.acrylBlendsGrip[hidden] { display: none; }
.acrylBlendsFrame[data-resizing] { cursor: col-resize; user-select: none; }
.acrylBlendsLeft, .acrylBlendsRight { background: var(--bf-side); min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.acrylBlendsLeft[hidden], .acrylBlendsRight[hidden] { display: none; }
/* Placed by column, so a hidden panel leaves its (zero-width) track empty instead of letting the app move into it. */
.acrylBlendsLeft { grid-column: 1; } .acrylBlendsCanvas { grid-column: 2; } .acrylBlendsRight { grid-column: 3; }
.acrylBlendsLeft, .acrylBlendsCanvas, .acrylBlendsRight { grid-row: 1; }
.acrylBlendsLeft { border-right: 1px solid var(--bf-border); overflow-y: auto; }
.acrylBlendsRight { border-left: 1px solid var(--bf-border); }

.acrylBlendsPaneHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px 6px; }
.acrylBlendsPaneHead .acrylBlendsSmallButton { flex: none; white-space: nowrap; }
.acrylBlendsPaneActions { display: flex; align-items: center; gap: 6px; flex: none; }
.acrylBlendsRemoteChips { display: flex; gap: 4px; }
.acrylBlendsRemoteChip { font-size: 11px; line-height: 16px; color: var(--bf-text-2); background: var(--bf-surface-2); border: 1px solid var(--bf-border-2); border-radius: 999px; padding: 1px 7px; cursor: pointer; font-variant-numeric: tabular-nums; }
.acrylBlendsRemoteChip:disabled { cursor: default; opacity: .6; }
.acrylBlendsRemoteChip[data-synced] { cursor: default; color: var(--bf-ok); border-color: transparent; background: transparent; padding: 1px 2px; }
.acrylBlendsToast { position: fixed; left: 12px; bottom: 44px; z-index: 30; max-width: 224px; text-align: left; font: inherit; font-size: 12px; color: var(--bf-text); background: var(--bf-surface-2); border: 1px solid var(--bf-border-2); border-radius: 8px; padding: 8px 10px; box-shadow: 0 6px 20px rgba(0,0,0,.4); cursor: pointer; overflow-wrap: anywhere; }
.acrylBlendsToast[data-error] { border-color: var(--bf-error-border); color: var(--bf-error-text); }
.acrylBlendsPushAsk { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 0; font-size: 12px; color: var(--bf-warn); overflow-wrap: anywhere; }
.acrylBlendsPushAskFloat { display: flex; flex-direction: column; gap: 8px; cursor: default; color: var(--bf-warn); border-color: var(--bf-warn-border); }
.acrylBlendsPushAskButtons { display: flex; gap: 6px; justify-content: flex-end; }
.acrylBlendsPushConfirm { border-color: var(--bf-accent); color: var(--bf-strong); background: var(--bf-accent-dim); }
.acrylBlendsLabel { color: var(--bf-dim); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.acrylBlendsList { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; padding: 0 6px; }
.acrylBlendsSmallButton { font-size: 11px; color: var(--bf-text-2); background: var(--bf-surface-2); border: 1px solid var(--bf-border-2); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
.acrylBlendsSep { height: 1px; background: var(--bf-border); margin: 10px 12px; flex: none; }
.acrylBlendsNote { margin: 4px 8px; color: var(--bf-dim); font-size: 12px; }
/* Under a chat answer that changed the app (the mockup's .tool line): what it edited and the version it was saved as. */
.acrylBlendsTurnSave { margin: 6px 0 2px; color: var(--bf-dim); font: 11px/1.4 ui-monospace, "SF Mono", Menlo, monospace; overflow-wrap: anywhere; }
.acrylBlendsNote[data-error] { color: var(--bf-error); }
.acrylBlendsMeta { margin-left: auto; color: var(--bf-dim); font-size: 11px; font-weight: 400; white-space: nowrap; }
.acrylBlendsDot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--bf-faint); flex: none; }
.acrylBlendsDot[data-live] { background: var(--bf-ok); }

.acrylBlendsBranchRow { display: flex; align-items: center; }
.acrylBlendsCaretButton { display: flex; align-items: center; justify-content: center; width: 18px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--bf-dim); cursor: pointer; flex: none; }
.acrylBlendsCaretButton:hover { background: var(--bf-surface-2); color: var(--bf-text-2); }
.acrylBlendsCaretSpace { width: 18px; height: 24px; flex: none; }
.acrylBlendsBranch { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--bf-text-2); font-weight: 600; white-space: nowrap; cursor: pointer; text-align: left; }
.acrylBlendsBranch:hover { background: var(--bf-surface-2); }
.acrylBlendsBranch svg { width: 13px; height: 13px; color: var(--bf-dim); flex: none; }
.acrylBlendsCaret { width: 10px; height: 10px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.4; transition: transform .12s ease; }
.acrylBlendsCaret[data-open] { transform: rotate(90deg); }
.acrylBlendsBranchName { overflow: hidden; text-overflow: ellipsis; }
.acrylBlendsAsk { margin: 2px 8px 6px 22px; padding: 7px 8px; border: 1px solid var(--bf-border-2); border-radius: 6px; background: var(--bf-surface-2); }
.acrylBlendsAsk p { margin: 0 0 7px; color: var(--bf-dim); font-size: 12px; }
.acrylBlendsAskActions { display: flex; gap: 6px; }
.acrylBlendsAskActions button { white-space: nowrap; }
.acrylBlendsBranchGroup > .acrylBlendsNote { margin: 2px 8px 6px 22px; }
.acrylBlendsItem { display: flex; align-items: center; gap: 7px; width: 100%; padding: 4px 8px 4px 30px; border: 0; border-radius: 6px; background: transparent; color: var(--bf-text-2); white-space: nowrap; cursor: pointer; text-align: left; }
.acrylBlendsItem:hover { background: var(--bf-surface-2); }
.acrylBlendsItem[aria-current] { background: var(--bf-accent-dim); color: var(--bf-strong); }
.acrylBlendsItemIcon { width: 16px; font: 10px ui-monospace, Menlo, monospace; color: var(--bf-dim); text-align: center; flex: none; }
.acrylBlendsItemTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acrylBlendsItem .acrylBlendsItemTitle { flex: 0 1 auto; }
.acrylBlendsItemMeta { flex: 0 0 auto; max-width: 45%; overflow: hidden; text-overflow: ellipsis; }

.acrylBlendsVersion { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 6px 8px; border-radius: 6px; color: var(--bf-text-2); white-space: nowrap; }
.acrylBlendsVersion[data-back] { cursor: pointer; }
.acrylBlendsVersion[data-back]:hover { background: var(--bf-surface-2); }
.acrylBlendsBackAsk { margin-left: 8px; }
.acrylBlendsBackAsk p[data-error] { color: var(--bf-error-text); }
.acrylBlendsVersion[aria-current] { background: var(--bf-accent-dim); color: var(--bf-strong); }
.acrylBlendsVersionDot { width: 7px; height: 7px; border-radius: 2px; border: 1.5px solid var(--bf-faint); flex: none; }
.acrylBlendsVersion[aria-current] .acrylBlendsVersionDot { background: var(--bf-accent); border-color: var(--bf-accent); }
.acrylBlendsSaveForm { padding: 0 12px 6px; }
.acrylBlendsSaveForm input, .acrylBlendsSearch { width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid var(--bf-border-2); border-radius: 6px; background: var(--bf-surface); color: var(--bf-text); font: inherit; }
.acrylBlendsLeftFoot { margin-top: auto; padding: 10px 12px; display: flex; align-items: center; gap: 8px; color: var(--bf-dim); border-top: 1px solid var(--bf-border); white-space: nowrap; }

.acrylBlendsCanvas { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #fff; }
.acrylBlendsCanvasPage { flex: 1; min-height: 0; display: flex; }
.acrylAppCanvasFrame { flex: 1; display: block; width: 100%; height: 100%; border: 0; background: #fff; }
/* Preview: a small pill floating over the app's top centre, so the app keeps its whole height, as users see it. */
.acrylBlendsBackbar { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 4; display: flex; align-items: center; gap: 10px; padding: 4px 4px 4px 14px; border-radius: 999px; background: rgba(29,28,26,.94); color: #fff; font-size: 12px; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,.18); }
.acrylBlendsBackbar .acrylBlendsSmallButton { border: 0; border-radius: 999px; background: var(--bf-accent); color: #fff; }
.acrylBlendsCanvasTools { position: absolute; top: 10px; right: 10px; z-index: 4; display: flex; align-items: center; gap: 8px; }
.acrylBlendsSelectButton { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border: 1px solid var(--bf-border); border-radius: 7px; background: transparent; color: var(--bf-dim); font-size: 12px; cursor: pointer; }
.acrylBlendsSelectButton svg { width: 13px; height: 13px; }
.acrylBlendsSelectButton:hover { background: var(--bf-surface-2); color: var(--bf-strong); }
.acrylBlendsSelectButton[aria-pressed="true"] { background: #e0a43a; border-color: #e0a43a; color: #1d1c1a; }
.acrylBlendsPickingHint { padding: 4px 9px; border-radius: 7px; background: rgba(29,28,26,.86); color: #fff; font-size: 11.5px; white-space: nowrap; }

.acrylBlendsTabs { position: relative; flex: none; border-bottom: 1px solid var(--bf-border); }
.acrylBlendsTabStrip { display: flex; align-items: center; gap: 2px; padding: 6px 8px 0; overflow-x: hidden; scrollbar-width: none; scroll-padding-right: 40px; }
/* The sizing rule decides when the tabs cannot share the width (tab-sizing.ts): only then does the strip scroll, with every tab at the minimum. */
.acrylBlendsTabStrip[data-scroll] { overflow-x: auto; }
.acrylBlendsTabStrip::-webkit-scrollbar { display: none; }
/* Tabs share the strip's width: each one's max comes from tab-sizing.ts, its label ellipsizes inside it, and the strip only scrolls when even the
   minimums do not fit (five open tabs at 412px still fit). */
.acrylBlendsTabWrap { position: relative; display: flex; flex: 0 1 auto; min-width: 72px; }
.acrylBlendsTab { flex: 1 1 auto; min-width: 0; overflow: hidden; padding: 6px 7px; border: 0; border-radius: 6px 6px 0 0; background: transparent; color: var(--bf-dim); display: flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer; font-size: 12px; }
.acrylBlendsTab:hover { color: var(--bf-text-2); }
.acrylBlendsTab[aria-selected="true"] { color: var(--bf-strong); box-shadow: inset 0 -2px 0 var(--bf-accent); }
.acrylBlendsTabLabel { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acrylBlendsTabKind { flex: none; font-size: 10px; color: var(--bf-faint); }
/* A file tab whose name another open file shares: the folder that tells them apart, dim, before the name. */
.acrylBlendsTabPath { font-size: 10.5px; color: var(--bf-faint); }
.acrylBlendsTabClose { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--bf-dim); font-size: 13px; line-height: 1; cursor: pointer; display: grid; place-items: center; }
.acrylBlendsTabWrap .acrylBlendsTabClose { position: absolute; top: 2px; right: 1px; opacity: 0; background: var(--bf-side); }
.acrylBlendsTabWrap:hover .acrylBlendsTabClose, .acrylBlendsTabClose:focus-visible { opacity: 1; }
.acrylBlendsTabClose:hover { background: var(--bf-surface-2); color: var(--bf-strong); }
/* A panel with its tabs closed keeps its own width and says how to open one (the mockup's panel body, the owner's 2026-11-04 review). */
.acrylBlendsPanelEmpty { margin: 16px 14px; max-width: 300px; color: var(--bf-dim); font-size: 12px; line-height: 1.5; }
/* Every open chat has a tab, so the strip can run past the panel: the + stays at its right edge, over a fade, and the tab shown scrolls into view. */
.acrylBlendsPlus { margin-left: 2px; flex: none; position: sticky; right: 0; background: var(--bf-side); box-shadow: -8px 0 6px 2px var(--bf-side); }
.acrylBlendsMenu { position: absolute; top: 34px; left: 8px; z-index: 5; width: 230px; background: var(--bf-surface); border: 1px solid var(--bf-border-2); border-radius: 8px; padding: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
.acrylBlendsMenuHead { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--bf-dim); padding: 6px 8px 2px; }
.acrylBlendsMenuItem { display: flex; gap: 8px; align-items: center; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--bf-text-2); font-size: 13px; text-align: left; cursor: pointer; }
.acrylBlendsMenuItem:hover:not([data-gone]) { background: var(--bf-surface-2); }
.acrylBlendsMenuItem small { color: var(--bf-dim); margin-left: auto; font-size: 11px; }
.acrylBlendsMenuItem[data-gone] { color: var(--bf-faint); text-decoration: line-through; cursor: default; }
.acrylBlendsNotice { display: flex; gap: 8px; align-items: flex-start; margin: 8px 10px 0; padding: 6px 9px; border-radius: 7px; background: rgba(224,164,58,.12); color: var(--bf-warn-text); font-size: 11.5px; flex: none; }
.acrylBlendsNotice .acrylBlendsTabClose { margin-left: auto; flex: none; }
.acrylBlendsChatPane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.acrylBlendsChatPane[hidden] { display: none; }

.acrylBlendsTerm { flex: 1; min-height: 0; position: relative; display: flex; background: #0a0a0b; padding: 12px; }
.acrylBlendsTermScreen { flex: 1; min-width: 0; min-height: 0; }
.acrylBlendsTermScreen .xterm { width: 100%; height: 100%; }
.acrylBlendsTermScreen .xterm .xterm-viewport { background-color: #0a0a0b; scrollbar-width: thin; scrollbar-color: #3a3a40 transparent; }
.acrylBlendsTermNote { position: absolute; left: 12px; bottom: 8px; margin: 0; color: var(--bf-dim); font-size: 11px; }
.acrylBlendsTermNote[data-error] { color: #f87171; }
.acrylBlendsPtyNote { flex: none; margin: 0; font-size: 11px; color: var(--bf-dim); padding: 6px 12px; border-top: 1px solid var(--bf-border); }

.acrylBlendsFiles, .acrylBlendsFile, .acrylBlendsGit { flex: 1; min-height: 0; overflow: auto; padding: 10px 8px; }
.acrylBlendsFsearch { display: flex; gap: 8px; align-items: center; border: 1px solid var(--bf-accent); border-radius: 7px; padding: 5px 9px; margin: 0 0 8px; }
.acrylBlendsFsearch input { flex: 1; min-width: 0; border: 0; outline: 0; padding: 0; background: transparent; color: var(--bf-strong); font: inherit; }
.acrylBlendsFsearch input::placeholder { color: var(--bf-dim); }
.acrylBlendsFsearch kbd { font: 10.5px ui-monospace, Menlo, monospace; color: var(--bf-dim); }
.acrylBlendsFres { margin-bottom: 10px; border-bottom: 1px solid var(--bf-border); padding-bottom: 8px; }
.acrylBlendsFres .acrylBlendsMeta { font-size: 10.5px; }
.acrylBlendsFrow { display: flex; gap: 8px; align-items: center; width: 100%; min-width: 0; padding: 4px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--bf-text-2); font-size: 13px; text-align: left; white-space: nowrap; }
button.acrylBlendsFrow { cursor: pointer; }
button.acrylBlendsFrow:hover { background: var(--bf-surface-2); }
.acrylBlendsFrow[aria-selected="true"], .acrylBlendsFrow[aria-current="true"] { background: var(--bf-accent-dim); color: var(--bf-strong); }
.acrylBlendsFrow b { color: var(--bf-warn); font-weight: 600; }
.acrylBlendsFrowName { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.acrylBlendsHint { color: var(--bf-dim); font-size: 11.5px; padding: 10px 8px 0; margin: 0; }
.acrylBlendsGm { color: var(--bf-warn); font: 11px ui-monospace, Menlo, monospace; flex: none; }
.acrylBlendsGitLabel { padding: 4px 2px 8px; }
.acrylBlendsGitLabel[data-second] { padding-top: 14px; }
.acrylBlendsGitRemote { display: flex; align-items: center; gap: 6px; padding: 2px 8px 4px; font-size: 13px; color: var(--bf-text-2); }
.acrylBlendsGitRemoteState { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acrylBlendsGitRemote .acrylBlendsSmallButton { flex: none; }
.acrylBlendsSmallButton:disabled { opacity: .45; cursor: default; }
/* git's lines can carry a long path or URL: they wrap inside the panel. */
.acrylBlendsGit .acrylBlendsNote { overflow-wrap: anywhere; }

/* The file keeps its lines whole: the pane scrolls sideways (min-width: 100% keeps the line numbers' column at the panel's left edge). */
.acrylBlendsFile pre { margin: 0; font: 12px/1.6 ui-monospace, "SF Mono", Menlo, monospace; color: var(--bf-text-2); white-space: pre; width: max-content; min-width: 100%; }
.acrylBlendsLine { min-height: 1.6em; }
.acrylBlendsLn { color: var(--bf-faint); display: inline-block; margin-right: 1ch; text-align: right; user-select: none; }
.acrylBlendsTok-kw { color: var(--bf-tok-kw); } .acrylBlendsTok-fn { color: var(--bf-tok-fn); } .acrylBlendsTok-st { color: var(--bf-tok-st); }
.acrylBlendsTok-ty { color: var(--bf-tok-ty); } .acrylBlendsTok-pu { color: var(--bf-tok-pu); } .acrylBlendsTok-va { color: var(--bf-tok-va); }
.acrylBlendsTok-cm { color: var(--bf-tok-cm); font-style: italic; } .acrylBlendsTok-nu { color: var(--bf-tok-nu); }
.acrylBlendsChatHead { display: flex; align-items: center; gap: 8px; padding: 8px 10px 0; flex: none; }
.acrylBlendsHistoryButton { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--bf-text-2); background: transparent; border: 1px solid var(--bf-border-2); border-radius: 6px; padding: 3px 8px; cursor: pointer; }
.acrylBlendsHistoryButton[aria-pressed="true"] { background: var(--bf-accent-dim); color: var(--bf-strong); }
.acrylBlendsChatTitle { color: var(--bf-dim); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acrylBlendsHistory { flex: 1; overflow: auto; padding: 8px 10px; display: grid; gap: 2px; align-content: start; }
.acrylBlendsHistoryGroup { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--bf-dim); padding: 8px 9px 3px; }
.acrylBlendsHistoryRow:disabled { opacity: .5; cursor: default; }
.acrylBlendsHistoryRow { display: grid; gap: 1px; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent; color: var(--bf-text-2); cursor: pointer; text-align: left; }
.acrylBlendsHistoryRow:hover { background: var(--bf-surface-2); }
.acrylBlendsHistoryRow[aria-current] { color: var(--bf-strong); }
.acrylBlendsHistoryRow small { color: var(--bf-dim); font-size: 11px; }
.acrylBlendsConversation { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; }
.acrylBlendsConversation[hidden] { display: none; }
.acrylBlendsConversation > * { flex: 1; min-height: 0; }
/* DSH's sidebar panel is placed absolutely against the nearest positioned box: this one, so it fills the tab below the strip. */
.acrylBlendsDetails { flex: 1; min-height: 0; position: relative; }
.acrylBlendsDetails[hidden] { display: none; }
/* With a chip, only the draft's first line makes room for it (SelectionChip sets the indent): the first paragraph, or the bare text. */
[data-composer-input] > :first-child, [data-composer-input]:not(:has(> *)) { text-indent: var(--acrylBlendsChipInset, 0px); }
.acrylBlendsSelectionChip { position: absolute; z-index: 2; display: inline-flex; align-items: center; gap: 4px; max-width: 60%; height: 18px; padding: 0 6px; border: 0; border-radius: 5px; background: var(--bf-surface-2); color: var(--bf-text-2); font-size: 11px; line-height: 18px; white-space: nowrap; }
.acrylBlendsSelectionChipLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.acrylBlendsSelectionChipClear { width: 13px; height: 13px; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--bf-dim); font-size: 12px; line-height: 1; cursor: pointer; display: grid; place-items: center; flex: none; opacity: 0; }
.acrylBlendsSelectionChip:hover .acrylBlendsSelectionChipClear, .acrylBlendsSelectionChipClear:focus-visible { opacity: 1; }
.acrylBlendsSelectionChipClear:hover { background: var(--bf-border-2); color: var(--bf-strong); }
/* First run (docs/design/blends-frame-mockup.html, scenario 1): a blank chat keeps the frame's shape, with DSH's composer at the bottom and none of
   its centered hero chrome (brand, headline, workspace picker). The composer is still DSH's own; only the blank-session presentation changes. */
.acrylBlendsConversation [data-phase="hero"] div:has(> [data-slot="conversation.composer"]) { margin-top: auto; }
.acrylBlendsConversation [data-phase="hero"] div:has(> [data-slot="conversation.composer.bar"]) { padding-bottom: 8px; }
.acrylBlendsConversation [data-phase="hero"] div:has(> [data-slot="conversation.composer.bar"]) > :not([data-slot="conversation.composer.bar"]):not([data-slot="conversation.input.dock"]) { display: none; }

.acrylBlendsPlugins { color: var(--bf-text, var(--bf-text)); font-size: 13px; }
.acrylBlendsFeedbackNew { margin-left: auto; color: var(--bf-warn); font-size: 11px; }
.acrylBlendsFeedback { display: grid; gap: 2px; width: calc(100% - 12px); margin: 0 6px 4px; padding: 7px 9px; border: 0; border-radius: 6px; background: rgba(224,164,58,.14); color: var(--bf-warn-text-2); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.acrylBlendsFeedback { position: relative; padding-right: 56px; }
.acrylBlendsFeedback:hover { background: rgba(224,164,58,.22); }
.acrylBlendsFeedbackThumb { position: absolute; right: 7px; top: 7px; width: 42px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid var(--bf-border-2); background: var(--bf-bg); }
.acrylBlendsFeedback[data-seen] { background: rgba(224,164,58,.07); color: var(--bf-warn-text-dim); }
.acrylBlendsFeedback b { color: var(--bf-strong); font-weight: 600; }
.acrylBlendsFeedback small { opacity: .75; font-size: 11px; }
.acrylBlendsShortcuts { padding: 14px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #26262b); font-size: 13px; }
.acrylBlendsShortcutsTitle { font-weight: 500; margin-bottom: 8px; }
.acrylBlendsShortcuts ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.acrylBlendsShortcuts li { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--dsw-alias-label-secondary, #a1a1aa); }
.acrylBlendsShortcutsKeys { display: inline-flex; gap: 3px; }
.acrylBlendsShortcutsKeys kbd { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 5px; background: rgb(127 127 127 / 16%); color: var(--dsw-alias-label-primary, var(--bf-text)); font: 11px ui-sans-serif, system-ui, sans-serif; }
.acrylBlendsPlugins h3 { font-size: 15px; margin: 0 0 2px; color: var(--bf-strong); }
.acrylBlendsPluginsSub { color: var(--bf-dim); font-size: 12px; margin: 0 0 12px; }
.acrylBlendsPluginsTools { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; align-items: center; }
.acrylBlendsPluginsTools .acrylBlendsSearch { flex: 1; width: auto; min-width: 160px; }
.acrylBlendsChip { font-size: 11px; border: 1px solid var(--bf-border-2); border-radius: 99px; padding: 3px 10px; color: var(--bf-text-2); background: transparent; cursor: pointer; }
.acrylBlendsChip[aria-pressed="true"] { border-color: var(--bf-accent); color: var(--bf-strong); background: var(--bf-accent-dim); }
.acrylBlendsPlug { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 4px 12px; align-items: center; padding: 9px 10px; border: 1px solid var(--bf-border); border-radius: 8px; margin-bottom: 6px; }
.acrylBlendsPlug b { color: var(--bf-strong); font-weight: 600; font-size: 12.5px; }
.acrylBlendsPlug small { grid-column: 1; color: var(--bf-dim); font-size: 11.5px; }
.acrylBlendsPlugBy { font-size: 10.5px; color: var(--bf-dim); border: 1px solid var(--bf-border-2); border-radius: 4px; padding: 1px 6px; grid-row: 1 / span 2; grid-column: 2; white-space: nowrap; }
.acrylBlendsPlugFixed { grid-row: 1 / span 2; grid-column: 3; font-size: 10.5px; color: var(--bf-faint); }
.acrylBlendsPlugState[data-state="ok"] { color: var(--bf-ok); } .acrylBlendsPlugState[data-state="warn"] { color: var(--bf-warn); }
.acrylBlendsShareButton { padding: 0; border: 0; background: transparent; color: var(--bf-accent); font: inherit; font-size: 11.5px; cursor: pointer; }
.acrylBlendsShareButton:hover:not(:disabled) { text-decoration: underline; }
.acrylBlendsShareButton:disabled { color: var(--bf-faint); cursor: default; }
.acrylBlendsShared { color: var(--bf-link); text-decoration: none; }
.acrylBlendsShared:hover { text-decoration: underline; }
.acrylBlendsSharedGone { color: var(--bf-dim); text-decoration: line-through; }
.acrylBlendsShareAsk { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; color: var(--bf-warn); }
.acrylBlendsShareConfirm, .acrylBlendsShareCancel, .acrylBlendsShareVisibility { padding: 1px 7px; border: 1px solid var(--bf-border-2); border-radius: 5px; background: var(--bf-surface-2); color: var(--bf-text-2); font: inherit; font-size: 11px; cursor: pointer; }
.acrylBlendsShareConfirm { border-color: var(--bf-accent); color: var(--bf-strong); background: var(--bf-accent-dim); }
.acrylBlendsShareConfirm:disabled { opacity: .5; cursor: default; }
.acrylBlendsShareAsk { grid-column: 1 / -1; }
.acrylBlendsPlugPath code, .acrylBlendsPlugWhere code { font-size: 11px; color: var(--bf-text-2); overflow-wrap: anywhere; user-select: all; }
.acrylBlendsPlugWhere, .acrylBlendsPlugSaid { overflow-wrap: anywhere; }
.acrylBlendsPlugSaid { color: var(--bf-ok); }
.acrylBlendsShareChooser { grid-column: 1 / -1; margin-top: 6px; padding: 10px 12px; border: 1px solid var(--bf-border-2); border-radius: 8px; background: var(--bf-surface-2); }
.acrylBlendsShareHead { margin: 0 0 8px; color: var(--bf-strong); font-weight: 600; font-size: 12.5px; }
.acrylBlendsShareChooser ul { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 8px; }
.acrylBlendsShareChooser li { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px 12px; align-items: center; font-size: 11.5px; color: var(--bf-dim); }
.acrylBlendsShareChooser li b { display: block; color: var(--bf-strong); font-size: 12px; font-weight: 600; margin-bottom: 1px; }
.acrylBlendsShareChooser li button { padding: 3px 10px; border: 1px solid var(--bf-accent); border-radius: 5px; background: var(--bf-accent-dim); color: var(--bf-strong); font: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap; }
.acrylBlendsShareChooser li button:disabled { opacity: .5; cursor: default; }
.acrylBlendsShareLater { margin: 0 0 8px; color: var(--bf-faint); font-size: 11px; }

.acrylBlendsShareAsk p { margin: 0; color: var(--bf-warn); font-size: 12px; }
.acrylBlendsShareRow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
.acrylBlendsShareDetails { margin: 6px 0 0; padding-left: 16px; color: var(--bf-dim); font-size: 11px; }
.acrylBlendsShareChooser .acrylBlendsShareAsk { display: block; margin-top: 0; }
.acrylBlendsShareChooser .acrylBlendsNote[data-warn] { color: var(--bf-warn); }
.acrylBlendsConnect { display: grid; gap: 6px; }
.acrylBlendsConnect p { margin: 0; }
.acrylBlendsConnectButton { padding: 5px 14px; border: 1px solid var(--bf-accent); border-radius: 6px; background: var(--bf-accent); color: var(--bf-on-accent, #fff); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.acrylBlendsConnectButton:disabled { opacity: .6; cursor: default; }
.acrylBlendsConnectCode { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.acrylBlendsConnectCode code { padding: 4px 10px; border: 1px solid var(--bf-border-2); border-radius: 6px; background: var(--bf-surface); color: var(--bf-strong); font-size: 18px; font-weight: 600; letter-spacing: .12em; }
.acrylBlendsConnectOpen { padding: 4px 12px; border-radius: 6px; background: var(--bf-accent); color: var(--bf-on-accent, #fff); font-size: 12px; font-weight: 600; text-decoration: none; }
.acrylBlendsConnectAlt { color: var(--bf-dim); font-size: 11px; }
.acrylBlendsCommand { display: block; margin-top: 4px; }
.acrylBlendsCommand code { padding: 1px 6px; border-radius: 4px; background: rgb(127 127 127 / 16%); color: var(--bf-strong); user-select: all; }
.acrylBlendsDetailsText { margin: 4px 0 0; padding: 6px 8px; border-radius: 5px; background: rgb(127 127 127 / 12%); color: var(--bf-text-2); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; }
.acrylBlendsPluginsTabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--bf-border); }
.acrylBlendsPluginsTabs button { padding: 5px 12px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--bf-dim); font: inherit; font-size: 12.5px; cursor: pointer; }
.acrylBlendsPluginsTabs button[aria-selected="true"] { color: var(--bf-strong); border-bottom-color: var(--bf-accent); }
.acrylBlendsRegRow { display: grid; gap: 3px; padding: 9px 10px; border: 1px solid var(--bf-border); border-radius: 8px; margin-bottom: 6px; }
.acrylBlendsRegRow[data-installed] { opacity: .8; }
.acrylBlendsRegHead { display: flex; align-items: center; gap: 8px; }
.acrylBlendsRegHead b { color: var(--bf-strong); font-weight: 600; font-size: 12.5px; margin-right: auto; }
.acrylBlendsRegRow small, .acrylBlendsRegByAddress small { color: var(--bf-dim); font-size: 11.5px; overflow-wrap: anywhere; }
.acrylBlendsRegDetails code { font-size: 11px; color: var(--bf-text-2); user-select: all; }
.acrylBlendsRegAdd { padding: 3px 10px; border: 1px solid var(--bf-accent); border-radius: 5px; background: var(--bf-accent-dim); color: var(--bf-strong); font: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap; }
.acrylBlendsRegAdd:disabled { opacity: .5; cursor: default; }
.acrylBlendsRegAdded { color: var(--bf-ok); font-size: 11.5px; }
.acrylBlendsRegAll { color: var(--bf-text-2); font-size: 11.5px; display: inline-flex; align-items: center; cursor: pointer; }
.acrylBlendsRegByAddress { display: grid; gap: 3px; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--bf-border); }
.acrylBlendsRegByAddress b { color: var(--bf-strong); font-size: 12px; }
.acrylBlendsTog { grid-row: 1 / span 2; grid-column: 3; width: 30px; height: 17px; border: 0; padding: 0; border-radius: 99px; background: var(--bf-toggle-off); position: relative; cursor: pointer; }
.acrylBlendsTog::after { content: ""; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: left .12s ease; }
.acrylBlendsTog[aria-checked="true"] { background: var(--bf-accent); }
.acrylBlendsTog[aria-checked="true"]::after { left: 15px; }
.acrylBlendsTog:disabled { opacity: .6; cursor: default; }

/* Settings > App (a desktop product): the Plugins page's title, line and bordered rows; the controls sit right of the row's name. */
.acrylBlendsApp { color: var(--bf-text); font-size: 13px; }
.acrylBlendsApp h3 { font-size: 15px; margin: 0 0 2px; color: #fff; }
.acrylBlendsApp > .acrylBlendsNote { margin: 0 0 10px; overflow-wrap: anywhere; }
.acrylBlendsAppRow { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 4px 12px; align-items: center; padding: 9px 10px; border: 1px solid var(--bf-border); border-radius: 8px; margin: 0 0 6px; }
.acrylBlendsAppRow b { color: #fff; font-weight: 600; font-size: 12.5px; }
.acrylBlendsAppRow small { grid-column: 1 / -1; color: var(--bf-dim); font-size: 11.5px; }
.acrylBlendsAppControls { grid-row: 1; grid-column: 2; display: inline-flex; align-items: center; gap: 8px; }
.acrylBlendsAppRow .acrylBlendsAppName { width: 220px; }
.acrylBlendsAppButton { padding: 4px 10px; border: 1px solid #34343a; border-radius: 6px; background: var(--bf-surface-2); color: #e8e8ea; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.acrylBlendsAppButton:hover:not(:disabled) { border-color: #4a4a52; color: #fff; }
.acrylBlendsAppButton:disabled { opacity: .5; cursor: default; }
.acrylBlendsAppButton[data-primary] { border-color: var(--bf-accent); background: var(--bf-accent); color: #fff; }
.acrylBlendsAppButton[data-danger] { color: #f3a0a0; }
.acrylBlendsShareConfirm[data-danger] { border-color: #b14646; background: rgba(177,70,70,.22); }
.acrylBlendsAppCheck { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: #c8c8d0; cursor: pointer; }
.acrylBlendsAppCheck input { margin: 0; accent-color: var(--bf-accent); }
.acrylBlendsAppOther { display: inline-flex; gap: 8px; align-items: baseline; margin-right: 14px; color: #c8c8d0; }
.acrylBlendsAppMade { color: var(--bf-dim); }

/* The first start's question, over the frame, in the Settings dialog's look. */
.acrylBlendsNameApp { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(0,0,0,.5); pointer-events: auto; }
.acrylBlendsNameAppCard { width: min(400px, calc(100vw - 32px)); padding: 20px 20px 16px; background: var(--bf-surface); border: 1px solid #34343a; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.6); color: var(--bf-text); }
.acrylBlendsNameAppCard h2 { margin: 0 0 4px; font-size: 15px; color: #fff; }
.acrylBlendsNameAppCard p { margin: 0 0 14px; color: var(--bf-dim); font-size: 12px; }
.acrylBlendsNameAppCard .acrylBlendsSearch { padding: 7px 10px; font-size: 13px; background: var(--bf-bg); }
.acrylBlendsNameAppCard .acrylBlendsNote { margin: 8px 0 0; }
.acrylBlendsNameAppActions { display: flex; justify-content: flex-end; margin-top: 14px; }

.acrylBlendsDialogBackdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.5); display: grid; place-items: center; }
.acrylBlendsDialog { position: relative; width: min(980px, 92vw); height: min(680px, 88vh); background: var(--bf-surface); border: 1px solid var(--bf-border-2); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.acrylBlendsDialog > :not(.acrylBlendsDialogClose) { flex: 1; min-height: 0; }
.acrylBlendsDialogClose { position: absolute; top: 8px; right: 10px; z-index: 2; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--bf-dim); font-size: 18px; cursor: pointer; }
.acrylBlendsDialogClose:hover { background: var(--bf-surface-2); color: var(--bf-strong); }
/* DSH's Settings window, full screen (the expand button in its header marks the body). The panel is DSH's: only its size changes, and what is inside it follows. */
.acrylBlendsSettingsExpand { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.acrylBlendsSettingsExpand:hover { background: rgb(127 127 127 / 16%); }
body[data-bf-settings-full] [data-shortcut-modal="settings"] { width: calc(100vw - 24px); max-width: none; height: calc(100vh - 2 * max(12px, var(--dsh-frame-overlay-top, 12px))); }
.acrylBlendsOverlay { position: fixed; inset: 0; pointer-events: none; z-index: 60; }
.acrylBlendsOverlay > * { pointer-events: auto; }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installFrameStyles(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  ;(document.head ?? document.documentElement).appendChild(style)
  return () => { style.remove() }
}
