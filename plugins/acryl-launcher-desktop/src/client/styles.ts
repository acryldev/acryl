/** Styles for the ACRYL screen (the Control Center design, spec 050 `design/control-center.html`), installed for the plugin's lifetime. Colors come from the app's theme tokens. */

const STYLE_ID = 'acryl-launcher-desktop-styles'

const CSS = `
.acrylHome {
  --h-bg: var(--dsw-alias-bg-base, #fff); --h-surface: var(--dsw-alias-bg-l1, var(--h-bg)); --h-fill: var(--dsw-alias-fill-l1, rgba(127,127,127,.09)); --h-fill2: var(--dsw-alias-fill-l2, rgba(127,127,127,.16));
  --h-border: var(--dsw-alias-border-l1, rgba(127,127,127,.28)); --h-line: rgba(127,127,127,.35); --h-text: var(--dsw-alias-label-primary, #18181b); --h-dim: var(--dsw-alias-label-secondary, #62626b);
  --h-accent: #4d6bfe; --h-accent-dim: rgba(77,107,254,.16); --h-ok: #22a06b; --h-ok-dim: rgba(34,160,107,.16); --h-warn: #d99a1e; --h-warn-dim: rgba(217,154,30,.16); --h-cloud: #38a0d8; --h-danger: #f87171;
  position: fixed; inset: 0; z-index: 2147482000; display: grid; grid-template-columns: 220px minmax(0, 1fr); background: var(--h-bg); color: var(--h-text);
  font: 14px/22px -apple-system, system-ui, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif; }
.acrylHome[hidden] { display: none; }
.acrylHome * { box-sizing: border-box; }
.acrylHomeNav { display: flex; flex-direction: column; gap: 2px; padding: 40px 10px 14px; border-right: 1px solid var(--h-border); overflow-y: auto; -webkit-app-region: drag; }
.acrylHomeNav > * { -webkit-app-region: no-drag; }
.acrylHomeBrand { padding: 0 10px 14px; font-weight: 600; font-size: 18px; line-height: 24px; -webkit-app-region: drag; }
.acrylHomeNavItem { display: flex; justify-content: space-between; align-items: center; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--h-dim); font: inherit; text-align: left; cursor: pointer; }
.acrylHomeNavItem:hover { background: var(--h-fill); color: var(--h-text); }
.acrylHomeNavItem[aria-current="page"] { background: var(--h-accent-dim); color: var(--h-accent); font-weight: 600; }
.acrylHomeNavItem:focus-visible, .acrylHomeBtn:focus-visible, .acrylHomeApp:focus-visible, .acrylHomeChip:focus-visible { outline: 2px solid var(--h-accent); outline-offset: 1px; }
.acrylHomeCount { color: var(--h-dim); font-size: 12px; }
.acrylHomeSep { height: 1px; margin: 8px 6px; background: var(--h-border); }
.acrylHomeMain { display: block; min-width: 0; padding: 40px 32px 32px; overflow-y: auto; }
.acrylHomeMain > * { max-width: 1320px; margin-inline: 0; }
.acrylHomeMain > * + * { margin-top: 20px; }
.acrylHomeTop { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.acrylHomeSearch, .acrylHomeInput { height: 36px; padding: 0 12px; border: 1px solid var(--h-border); border-radius: 10px; background: var(--h-fill); color: inherit; font: inherit; }
.acrylHomeSearch { flex: 1 1 240px; min-width: 0; }
.acrylHomeForm > .acrylHomeSearch { flex: none; max-width: 420px; }
.acrylHomeSearch:focus, .acrylHomeInput:focus { outline: 0; border-color: var(--h-accent); }
.acrylHomeInput[data-mono] { font: 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.acrylHomeBtn { display: inline-flex; align-items: center; justify-content: center; height: 28px; padding: 0 12px; border: 1px solid var(--h-line); border-radius: 99px; background: transparent; color: inherit; font: 600 12px/1 inherit; white-space: nowrap; cursor: pointer; }
.acrylHomeBtn:hover:not(:disabled) { border-color: var(--h-accent); color: var(--h-accent); }
.acrylHomeBtn:disabled { opacity: .45; cursor: default; }
.acrylHomeBtn[data-primary] { border-color: var(--h-accent); background: var(--h-accent); color: #fff; }
.acrylHomeBtn[data-primary]:hover:not(:disabled) { color: #fff; opacity: .9; }
.acrylHomeBtn[data-small] { height: 24px; padding: 0 10px; }
.acrylHomeChips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.acrylHomeChip { height: 24px; padding: 0 11px; border: 1px solid var(--h-line); border-radius: 99px; background: none; color: var(--h-dim); font: 600 12px/1 inherit; cursor: pointer; }
.acrylHomeChip:hover:not(:disabled) { color: var(--h-text); border-color: var(--h-accent); }
.acrylHomeChip[aria-pressed="true"] { border-color: var(--h-accent); background: var(--h-accent-dim); color: var(--h-accent); }
.acrylHomeChip:disabled { opacity: .5; cursor: default; }
.acrylHomeTiles { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.acrylHomeTile { padding: 14px 16px; border: 1px solid var(--h-border); border-radius: 12px; background: var(--h-surface); }
.acrylHomeTile b { display: block; font-size: 22px; line-height: 28px; font-weight: 600; }
.acrylHomeTile span { color: var(--h-dim); font-size: 12px; }
.acrylHomeTile[data-tone="ok"] b { color: var(--h-ok); }
.acrylHomeTile[data-tone="warn"] b { color: var(--h-warn); }
.acrylHomeTile[data-tone="cloud"] b { color: var(--h-cloud); }
.acrylHomeGroup { color: var(--h-dim); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.acrylHomeApps, .acrylHomeCards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.acrylHomeApp { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 16px; border: 1px solid var(--h-border); border-radius: 12px; background: var(--h-surface); color: inherit; font: inherit; text-align: left; }
button.acrylHomeApp { cursor: pointer; }
.acrylHomeApp:hover, .acrylHomeApp[aria-pressed="true"] { border-color: var(--h-line); }
.acrylHomeApp[aria-pressed="true"] { box-shadow: 0 0 0 1px var(--h-accent); border-color: var(--h-accent); }
.acrylHomeHead { display: flex; gap: 12px; align-items: center; min-width: 0; }
.acrylHomeIcon { display: grid; flex: none; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: #fff; font-weight: 600; font-size: 14px; }
.acrylHomeName { font-weight: 600; overflow-wrap: anywhere; }
.acrylHomeMeta { color: var(--h-dim); font: 12px/18px ui-monospace, "SF Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.acrylHomeDesc { margin: 0; color: var(--h-dim); font-size: 13px; line-height: 20px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.acrylHomeRow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 20px; }
.acrylHomeCardFoot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; }
.acrylHomeState { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--h-dim); }
.acrylHomeState[data-state="running"], .acrylHomeState[data-state="starting"] { color: var(--h-ok); }
.acrylHomeState[data-state="missing"] { color: var(--h-warn); }
.acrylHomeState i { width: 7px; height: 7px; border-radius: 50%; background: #71717a; }
.acrylHomeState[data-state="running"] i, .acrylHomeState[data-state="starting"] i { background: var(--h-ok); }
.acrylHomeState[data-state="missing"] i { background: var(--h-warn); }
.acrylHomePill { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 99px; background: var(--h-accent-dim); color: var(--h-accent); font-size: 11px; font-weight: 600; }
.acrylHomePill[data-kind="agent"] { background: var(--h-warn-dim); color: var(--h-warn); }
.acrylHomePill[data-kind="off"] { background: var(--h-fill); color: var(--h-dim); }
.acrylHomePanel { display: flex; flex-direction: column; gap: 14px; padding: 18px; border: 1px solid var(--h-border); border-radius: 12px; background: var(--h-surface); }
.acrylHomePanel.acrylHomeForm { max-width: 680px; }
.acrylHomePanelTop { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.acrylHomePanelTop h3 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.acrylHomeActs { display: flex; flex-wrap: wrap; gap: 8px; }
.acrylHomeKv { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 6px 14px; margin: 0; font-size: 13px; }
.acrylHomeKv dt { color: var(--h-dim); }
.acrylHomeKv dd { margin: 0; font: 12.5px/20px ui-monospace, "SF Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.acrylHomeList { display: flex; flex-direction: column; border: 1px solid var(--h-border); border-radius: 12px; overflow: hidden; }
.acrylHomeItem { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--h-border); background: var(--h-surface); }
.acrylHomeItem:first-child { border-top: 0; }
.acrylHomeItem small { display: block; color: var(--h-dim); font-size: 12px; overflow-wrap: anywhere; }
.acrylHomeNote { margin: 0; color: var(--h-dim); font-size: 13px; line-height: 20px; max-width: 72ch; }
.acrylHomeNote[data-error] { color: var(--h-danger); }
.acrylHomeForm { display: flex; flex-direction: column; gap: 14px; }
.acrylHomeField { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.acrylHomeField > span { color: var(--h-dim); font-weight: 600; }
.acrylHomeChoices { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.acrylHomeChoice { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--h-border); border-radius: 10px; background: var(--h-fill); cursor: pointer; font-size: 13px; }
.acrylHomeChoice:has(input:checked) { border-color: var(--h-accent); background: var(--h-accent-dim); }
.acrylHomeChoice[data-disabled] { opacity: .5; cursor: default; }
.acrylHomeChoice small { display: block; color: var(--h-dim); font-size: 12px; line-height: 18px; }
.acrylHomeChoice input { margin-top: 3px; accent-color: var(--h-accent); }
.acrylHomeJob { max-width: 680px; padding: 12px 16px; border: 1px solid var(--h-border); border-radius: 12px; background: var(--h-surface); font-size: 13px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; }
.acrylHomeBack { position: fixed; top: 6px; right: 76px; z-index: 2147482000; padding: 3px 10px; border: 1px solid var(--h-line, rgba(127,127,127,.35)); border-radius: 99px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #18181b); font: 600 12px -apple-system, system-ui, "Segoe UI", sans-serif; cursor: pointer; }
.acrylHomeBack:hover { border-color: #4d6bfe; color: #4d6bfe; }
@media (max-width: 760px) { .acrylHome { grid-template-columns: 1fr; grid-template-rows: auto 1fr; } .acrylHomeNav { flex-direction: row; flex-wrap: wrap; padding-top: 14px; border-right: 0; border-bottom: 1px solid var(--h-border); } .acrylHomeBrand, .acrylHomeSep { display: none; } .acrylHomeMain { padding: 20px 16px; } }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installLauncherStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
