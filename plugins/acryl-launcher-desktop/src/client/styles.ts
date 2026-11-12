/** Styles for the ACRYL screen (the Control Center design, spec 050 `design/control-center.html`), installed for the plugin's lifetime. Colors come from the app's theme tokens. */

const STYLE_ID = 'acryl-launcher-desktop-styles'

const CSS = `
.acrylHome { --h-bg: var(--dsw-alias-bg-base, #f4f4f6); --h-surface: var(--dsw-alias-bg-l1, var(--h-bg)); --h-fill: var(--dsw-alias-fill-l1, rgba(127,127,127,.09)); --h-border: var(--dsw-alias-border-l1, rgba(127,127,127,.28)); --h-text: var(--dsw-alias-label-primary, #18181b); --h-dim: var(--dsw-alias-label-secondary, #62626b); --h-primary: #4F6BFE; --h-primary-dim: rgba(79,107,254,.14); --h-ok: #22a06b; --h-ok-dim: rgba(34,160,107,.14); --h-warn: #d99a1e; --h-agent: #c9a227; --h-agent-dim: rgba(201,162,39,.16); --h-cloud: #38a0d8;
  position: fixed; inset: 0; z-index: 2147482000; display: grid; grid-template-columns: 208px minmax(0, 1fr); background: var(--h-bg); color: var(--h-text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.acrylHome[hidden] { display: none; }
.acrylHome * { box-sizing: border-box; }
.acrylHomeNav { display: flex; flex-direction: column; gap: 2px; padding: 38px 10px 14px; border-right: 1px solid var(--h-border); background: var(--h-fill); overflow-y: auto; -webkit-app-region: drag; }
.acrylHomeNav > * { -webkit-app-region: no-drag; }
.acrylHomeBrand { padding: 0 10px 12px; font-weight: 700; letter-spacing: .02em; font-size: 15px; -webkit-app-region: drag; }
.acrylHomeNavItem { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border: 0; border-radius: 7px; background: none; color: var(--h-dim); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
.acrylHomeNavItem:hover { color: var(--h-text); }
.acrylHomeNavItem[aria-current="page"] { background: var(--h-primary-dim); color: var(--h-primary); font-weight: 600; }
.acrylHomeNavItem:focus-visible, .acrylHomeBtn:focus-visible, .acrylHomeApp:focus-visible { outline: 2px solid var(--h-primary); outline-offset: 1px; }
.acrylHomeCount { font: 600 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.acrylHomeSep { height: 1px; margin: 8px 6px; background: var(--h-border); }
.acrylHomeMain { display: flex; flex-direction: column; gap: 18px; min-width: 0; padding: 38px 26px 26px; overflow-y: auto; }
.acrylHomeTop { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.acrylHomeSearch { flex: 1 1 240px; min-width: 0; padding: 8px 12px; border: 1px solid var(--h-border); border-radius: 9px; background: var(--h-fill); color: inherit; font: inherit; }
.acrylHomeBtn { padding: 7px 12px; border: 1px solid var(--h-border); border-radius: 8px; background: var(--h-surface); color: inherit; font: inherit; font-weight: 600; font-size: 13px; white-space: nowrap; cursor: pointer; }
.acrylHomeBtn:hover:not(:disabled) { border-color: var(--h-primary); color: var(--h-primary); }
.acrylHomeBtn:disabled { opacity: .5; cursor: default; }
.acrylHomeBtn[data-primary] { border-color: var(--h-primary); background: var(--h-primary); color: #fff; }
.acrylHomeBtn[data-primary]:hover:not(:disabled) { color: #fff; opacity: .92; }
.acrylHomeBtn[data-small] { padding: 4px 9px; font-size: 12px; }
.acrylHomeChips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.acrylHomeChip { padding: 3px 10px; border: 1px solid var(--h-border); border-radius: 99px; background: none; color: var(--h-dim); font: inherit; font-size: 12.5px; cursor: pointer; }
.acrylHomeChip[aria-pressed="true"] { border-color: var(--h-primary); background: var(--h-primary-dim); color: var(--h-primary); font-weight: 600; }
.acrylHomeChip:disabled { opacity: .55; cursor: default; }
.acrylHomeTiles { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.acrylHomeTile { padding: 12px 14px; border: 1px solid var(--h-border); border-radius: 10px; background: var(--h-fill); }
.acrylHomeTile b { display: block; font-size: 24px; line-height: 1.1; }
.acrylHomeTile span { color: var(--h-dim); font-size: 12.5px; }
.acrylHomeGroup { color: var(--h-dim); font: 600 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; }
.acrylHomeApps { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.acrylHomeApp { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px; border: 1px solid var(--h-border); border-radius: 12px; background: var(--h-surface); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.acrylHomeApp:hover, .acrylHomeApp[aria-pressed="true"] { border-color: var(--h-primary); }
.acrylHomeApp[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--h-primary-dim); }
.acrylHomeHead { display: flex; gap: 10px; align-items: center; min-width: 0; }
.acrylHomeIcon { display: grid; flex: none; place-items: center; width: 36px; height: 36px; border-radius: 9px; color: #fff; font-weight: 700; font-size: 15px; }
.acrylHomeName { font-weight: 650; overflow-wrap: anywhere; }
.acrylHomeMeta { color: var(--h-dim); font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.acrylHomeRow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 20px; }
.acrylHomeState { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; }
.acrylHomeState i { width: 8px; height: 8px; border-radius: 50%; background: #a1a1aa; }
.acrylHomeState[data-state="running"] i, .acrylHomeState[data-state="starting"] i { background: var(--h-ok); }
.acrylHomeState[data-state="missing"] i { background: var(--h-warn); }
.acrylHomePill { display: inline-block; padding: 3px 7px; border-radius: 99px; background: var(--h-primary-dim); color: var(--h-primary); font: 600 11px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.acrylHomePill[data-kind="agent"] { background: var(--h-agent-dim); color: var(--h-agent); }
.acrylHomePill[data-kind="off"] { background: var(--h-fill); color: var(--h-dim); }
.acrylHomePill[data-kind="warn"] { background: rgba(217,154,30,.16); color: var(--h-warn); }
.acrylHomePanel { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--h-border); border-radius: 12px; background: var(--h-fill); }
.acrylHomePanelTop { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.acrylHomePanelTop h3 { margin: 0; font-size: 15px; }
.acrylHomeActs { display: flex; flex-wrap: wrap; gap: 8px; }
.acrylHomeKv { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 13px; }
.acrylHomeKv dt { color: var(--h-dim); }
.acrylHomeKv dd { margin: 0; font: 12.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.acrylHomeList { display: flex; flex-direction: column; border: 1px solid var(--h-border); border-radius: 10px; overflow: hidden; }
.acrylHomeItem { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 14px; border-top: 1px solid var(--h-border); background: var(--h-surface); }
.acrylHomeItem:first-child { border-top: 0; }
.acrylHomeItem small { display: block; color: var(--h-dim); font-size: 12.5px; overflow-wrap: anywhere; }
.acrylHomeNote { margin: 0; color: var(--h-dim); font-size: 13px; max-width: 74ch; }
.acrylHomeNote[data-error] { color: #f87171; }
.acrylHomeForm { display: flex; flex-direction: column; gap: 12px; }
.acrylHomeField { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.acrylHomeField > span { font-weight: 650; }
.acrylHomeInput { padding: 7px 10px; border: 1px solid var(--h-border); border-radius: 8px; background: var(--h-surface); color: inherit; font: 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.acrylHomeChoices { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.acrylHomeChoice { display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border: 1px solid var(--h-border); border-radius: 10px; background: var(--h-surface); cursor: pointer; font-size: 13.5px; }
.acrylHomeChoice:has(input:checked) { border-color: var(--h-primary); background: var(--h-primary-dim); }
.acrylHomeChoice[data-disabled] { opacity: .55; cursor: default; }
.acrylHomeChoice small { display: block; color: var(--h-dim); font-size: 12px; }
.acrylHomeChoice input { margin-top: 4px; accent-color: var(--h-primary); }
.acrylHomeJob { padding: 10px 14px; border: 1px solid var(--h-border); border-radius: 10px; background: var(--h-fill); font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.acrylHomeBack { position: fixed; top: 6px; right: 76px; z-index: 2147482000; padding: 3px 10px; border: 1px solid rgba(127,127,127,.35); border-radius: 99px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #18181b); font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; }
.acrylHomeBack:hover { border-color: #4F6BFE; color: #4F6BFE; }
@media (max-width: 760px) { .acrylHome { grid-template-columns: 1fr; grid-template-rows: auto 1fr; } .acrylHomeNav { flex-direction: row; flex-wrap: wrap; padding-top: 14px; border-right: 0; border-bottom: 1px solid var(--h-border); } .acrylHomeBrand, .acrylHomeSep { display: none; } }
`

/** @returns disposer, for one owning `ctx.effect`. */
export function installLauncherStyles(): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
